/*
============================================================
 MARVEL JEOPARDY - AUDIO MANAGER
 Handles smooth audio transitions with fade in/out effects
============================================================
*/

const AudioManager = {
    currentAudio: null,
    _nextAudio: null,       // Secondary buffer for seamless loop crossfade
    currentTrack: null,
    fadeTime: 500, // ms for fade transitions
    volume: 0.7,   // default volume
    preloadedAudio: {}, // Cache for preloaded audio
    _pendingResume: false,
    _pausedByVisibility: false,
    _loopCheckInterval: null,
    _isCrossfading: false,
    _crossfadeDuration: 2000, // ms for loop boundary crossfade
    
    tracks: {
        'menu': 'Assets/Sounds/krakoa-menu-theme.mp3',
        'match': 'Assets/Sounds/krakoa-match.mp3',
        'overtime': 'Assets/Sounds/krakoa-overtime.mp3'
    },
    
    // Preload all audio tracks — deferred by 6 seconds so it doesn't compete
    // with the critical path (video 1, CSS, fonts) on initial page load.
    preloadAll() {
        setTimeout(() => {
            Object.entries(this.tracks).forEach(([name, url]) => {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.src = url;
                // Start loading immediately within the deferred window
                audio.load();
                this.preloadedAudio[name] = audio;
            });
        }, 2000);
    },
    
    // Initialize audio system
    init() {
        // Preload all tracks first
        this.preloadAll();
        
        // Create dual audio elements for seamless loop crossfading
        this._ensureAudioElements();
        
        // Restore state from a previous session (reload / bfcache)
        const state = this.restoreState();
        if (state && state.currentTrack) {
            // Always restore muted state (user preference)
            this.currentAudio.muted = !!state.muted;
            if (this._nextAudio) this._nextAudio.muted = !!state.muted;

            // Only restore track and auto-resume if we're on the same page.
            // Prevents game audio leaking onto the homepage/navbar when leaving a match.
            const isSamePage = !state.pageUrl || state.pageUrl === location.pathname;
            if (isSamePage) {
                this.currentTrack = state.currentTrack;
                if (!this.currentAudio.src) {
                    const src = this.tracks[state.currentTrack] || state.currentTrack;
                    this.currentAudio.src = src;
                    if (this._nextAudio) this._nextAudio.src = src;
                }
                if (state.wasPlaying) {
                    this.currentAudio.volume = 0;
                    this._pendingResume = true;
                }
            }
        }
        
        // Handle browser autoplay restrictions
        this.setupAutoplayHandler();
        this.setupLifecycleHandlers();
        
        return this;
    },
    
    _ensureAudioElements() {
        // Primary buffer
        if (!document.getElementById('audioManager')) {
            const audioA = document.createElement('audio');
            audioA.id = 'audioManager';
            audioA.volume = 0;
            audioA.preload = 'auto';
            document.body.appendChild(audioA);
        }
        // Secondary buffer (for loop crossfade)
        if (!document.getElementById('audioManagerB')) {
            const audioB = document.createElement('audio');
            audioB.id = 'audioManagerB';
            audioB.volume = 0;
            audioB.preload = 'auto';
            document.body.appendChild(audioB);
        }
        this.currentAudio = document.getElementById('audioManager');
        this._nextAudio = document.getElementById('audioManagerB');
    },
    
    // Setup autoplay handler for browser restrictions
    setupAutoplayHandler() {
        const startAudio = () => {
            // Unlock Web Audio context for sound effects first
            if (typeof SoundEffects !== 'undefined') {
                SoundEffects.resumeAudioContext();
            }

            if (this.currentAudio && this.currentAudio.paused) {
                if (this._pendingResume && this.currentTrack) {
                    this._pendingResume = false;
                    this.currentAudio.play().then(() => this.fadeIn()).catch(() => {});
                } else if (this.currentTrack) {
                    this.currentAudio.play().catch(() => {});
                }
            }
            document.removeEventListener('click', startAudio);
            document.removeEventListener('keydown', startAudio);
            document.removeEventListener('touchstart', startAudio);
        };
        
        document.addEventListener('click', startAudio);
        document.addEventListener('keydown', startAudio);
        document.addEventListener('touchstart', startAudio);
    },

    // Persist audio state so it survives reloads and bfcache restores
    saveState() {
        try {
            sessionStorage.setItem('mj_audio_state', JSON.stringify({
                currentTrack: this.currentTrack,
                volume: this.volume,
                muted: this.currentAudio ? this.currentAudio.muted : false,
                wasPlaying: this.currentAudio && !this.currentAudio.paused,
                pageUrl: location.pathname
            }));
        } catch (_) {}
    },

    restoreState() {
        try {
            const raw = sessionStorage.getItem('mj_audio_state');
            if (raw) {
                const state = JSON.parse(raw);
                if (typeof state.volume === 'number') this.volume = state.volume;
                return state;
            }
        } catch (_) {}
        return null;
    },

    // Lifecycle helpers for reload / bfcache / tab-switching
    setupLifecycleHandlers() {
        // Save state before leaving
        window.addEventListener('beforeunload', () => this.saveState());
        window.addEventListener('pagehide', () => this.saveState());

        // Restore on back-forward cache (bfcache) restore
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                // Page was restored from bfcache — audio element may be stale
                this._rebuildAudioElement();
                const state = this.restoreState();
                if (state && state.currentTrack && state.wasPlaying) {
                    this.currentTrack = state.currentTrack;
                    this.currentAudio.src = this.tracks[state.currentTrack] || state.currentTrack;
                    this.currentAudio.loop = true;
                    this.currentAudio.muted = !!state.muted;
                    this.currentAudio.volume = 0;
                    // Wait for user interaction before actually playing
                    this._pendingResume = true;
                }
            }
        });

        // Pause when tab hidden, resume when visible
        document.addEventListener('visibilitychange', () => {
            if (!this.currentAudio) return;
            if (document.hidden) {
                this.saveState();
                if (!this.currentAudio.paused) {
                    this.currentAudio.pause();
                    if (this._nextAudio && !this._nextAudio.paused) this._nextAudio.pause();
                    this._pausedByVisibility = true;
                }
            } else if (this._pausedByVisibility) {
                this._pausedByVisibility = false;
                this.currentAudio.play().catch(() => {});
                if (this._isCrossfading && this._nextAudio) {
                    this._nextAudio.play().catch(() => {});
                }
            }
        });
    },

    _rebuildAudioElement() {
        const oldA = document.getElementById('audioManager');
        if (oldA) oldA.remove();
        const oldB = document.getElementById('audioManagerB');
        if (oldB) oldB.remove();
        this._ensureAudioElements();
    },
    
    // Play a track with fade in
    play(trackName, options = {}) {
        const trackUrl = this.tracks[trackName] || trackName;
        const fadeIn = options.fadeIn !== false;
        const loop = options.loop !== false;
        
        if (!this.currentAudio) {
            this.init();
        }
        
        // If same track is already playing, do nothing
        if (this.currentTrack === trackName && !this.currentAudio.paused) {
            return Promise.resolve();
        }
        
        return new Promise((resolve) => {
            // If there's current audio playing, fade it out first
            if (this.currentTrack && !this.currentAudio.paused) {
                this.fadeOut().then(() => {
                    this.startNewTrack(trackUrl, trackName, loop, fadeIn, resolve);
                });
            } else {
                this.startNewTrack(trackUrl, trackName, loop, fadeIn, resolve);
            }
        });
    },
    
    // Start playing a new track
    startNewTrack(url, trackName, loop, fadeIn, callback) {
        this._clearLoopCheck();
        this._isCrossfading = false;
        
        // Load into both buffers (primary plays now, secondary ready for loop)
        this.currentAudio.src = url;
        this.currentAudio.loop = false; // We handle looping manually for crossfade
        if (this._nextAudio) {
            this._nextAudio.src = url;
            this._nextAudio.loop = false;
            this._nextAudio.volume = 0;
        }
        this.currentTrack = trackName;
        
        if (fadeIn) {
            this.currentAudio.volume = 0;
        } else {
            this.currentAudio.volume = this.volume;
        }
        
        const playPromise = this.currentAudio.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if (loop) {
                    this._setupLoopCrossfade();
                }
                if (fadeIn) {
                    this.fadeIn().then(callback);
                } else {
                    callback();
                }
            }).catch(() => {
                // Autoplay blocked - will play on user interaction
                this.currentAudio.volume = this.volume;
                callback();
            });
        } else {
            if (loop) this._setupLoopCrossfade();
            callback();
        }
    },
    
    // Monitor playback and trigger crossfade before loop boundary
    _setupLoopCrossfade() {
        this._clearLoopCheck();
        if (!this.currentAudio || this.currentAudio.paused) return;
        
        const check = () => {
            if (this._isCrossfading || !this.currentAudio || this.currentAudio.paused) return;
            
            const duration = this.currentAudio.duration;
            const currentTime = this.currentAudio.currentTime;
            
            if (duration && !isNaN(duration) && currentTime >= duration - (this._crossfadeDuration / 1000)) {
                this._performLoopCrossfade();
            }
        };
        
        this._loopCheckInterval = setInterval(check, 50);
    },
    
    _clearLoopCheck() {
        if (this._loopCheckInterval) {
            clearInterval(this._loopCheckInterval);
            this._loopCheckInterval = null;
        }
    },
    
    _performLoopCrossfade() {
        if (this._isCrossfading || !this._nextAudio) return;
        this._isCrossfading = true;
        
        const outgoing = this.currentAudio;
        const incoming = this._nextAudio;
        
        // Prepare incoming buffer
        incoming.currentTime = 0;
        incoming.muted = outgoing.muted;
        
        // Start incoming playback silently
        const playPromise = incoming.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
        
        // Crossfade from outgoing to incoming
        const duration = this._crossfadeDuration;
        const steps = 20;
        const stepTime = duration / steps;
        const targetVolume = this.volume;
        let step = 0;
        
        const interval = setInterval(() => {
            step++;
            const progress = step / steps;
            
            outgoing.volume = Math.max(0, targetVolume * (1 - progress));
            incoming.volume = Math.min(targetVolume, targetVolume * progress);
            
            if (step >= steps) {
                clearInterval(interval);
                outgoing.pause();
                outgoing.volume = 0;
                incoming.volume = targetVolume;
                
                // Swap buffers: incoming becomes the new current
                this.currentAudio = incoming;
                this._nextAudio = outgoing;
                this._isCrossfading = false;
                
                // Continue monitoring the new current audio
                this._setupLoopCrossfade();
            }
        }, stepTime);
    },
    
    // Fade in current audio
    fadeIn(duration = this.fadeTime) {
        return new Promise((resolve) => {
            if (!this.currentAudio) {
                resolve();
                return;
            }
            
            const startVolume = this.currentAudio.volume;
            const targetVolume = this.volume;
            const steps = 20;
            const stepTime = duration / steps;
            const volumeStep = (targetVolume - startVolume) / steps;
            let currentStep = 0;
            
            const fadeInterval = setInterval(() => {
                currentStep++;
                this.currentAudio.volume = Math.min(targetVolume, startVolume + (volumeStep * currentStep));
                
                if (currentStep >= steps) {
                    clearInterval(fadeInterval);
                    this.currentAudio.volume = targetVolume;
                    resolve();
                }
            }, stepTime);
        });
    },
    
    // Fade out current audio
    fadeOut(duration = this.fadeTime) {
        return new Promise((resolve) => {
            if (!this.currentAudio || this.currentAudio.paused) {
                resolve();
                return;
            }
            
            const startVolume = this.currentAudio.volume;
            const steps = 20;
            const stepTime = duration / steps;
            const volumeStep = startVolume / steps;
            let currentStep = 0;
            
            const fadeInterval = setInterval(() => {
                currentStep++;
                this.currentAudio.volume = Math.max(0, startVolume - (volumeStep * currentStep));
                
                if (currentStep >= steps) {
                    clearInterval(fadeInterval);
                    this.currentAudio.volume = 0;
                    this.currentAudio.pause();
                    resolve();
                }
            }, stepTime);
        });
    },
    
    // Switch to a different track with crossfade
    switchTo(trackName, options = {}) {
        return this.play(trackName, options);
    },
    
    // Pause with fade out
    pause() {
        return this.fadeOut();
    },
    
    // Resume with fade in
    resume() {
        if (this.currentAudio && this.currentAudio.paused && this.currentTrack) {
            this.currentAudio.volume = 0;
            const playPromise = this.currentAudio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => this.fadeIn()).catch(() => {});
            }
        }
    },
    
    // Stop audio completely
    stop() {
        this._clearLoopCheck();
        this._isCrossfading = false;
        return this.fadeOut().then(() => {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio.src = '';
            }
            if (this._nextAudio) {
                this._nextAudio.pause();
                this._nextAudio.src = '';
            }
            this.currentTrack = null;
            try { sessionStorage.removeItem('mj_audio_state'); } catch (_) {}
        });
    },
    
    // Set volume (0-1)
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.volume = this.volume;
        }
        if (this._nextAudio && !this._nextAudio.paused) {
            this._nextAudio.volume = Math.min(this.volume, this._nextAudio.volume);
        }
    },
    
    // Mute/unmute
    mute() {
        if (this.currentAudio) this.currentAudio.muted = true;
        if (this._nextAudio) this._nextAudio.muted = true;
    },
    
    unmute() {
        if (this.currentAudio) this.currentAudio.muted = false;
        if (this._nextAudio) this._nextAudio.muted = false;
    },
    
    // Check if audio is playing
    isPlaying() {
        return (this.currentAudio && !this.currentAudio.paused) ||
               (this._nextAudio && !this._nextAudio.paused);
    },
    
    // Get current track name
    getCurrentTrack() {
        return this.currentTrack;
    }
};

// Sound Effects System (click, card hovers, unhover)
const SoundEffects = {
    sounds: {},
    enabled: true,
    audioContext: null,

    init() {
        this.preload('click', 'Assets/Sounds/click.wav');
        this.preload('unhover', 'Assets/Sounds/unhover.wav');
        this.preload('hover-2p', 'Assets/Sounds/2p hover.wav');
        this.preload('hover-3p', 'Assets/Sounds/3p hover.wav');
        this.preload('hover-4p', 'Assets/Sounds/4p hover.wav');
        this.preload('hover-online', 'Assets/Sounds/Online hover.wav');
        this.preload('ai-sbmm-hover', 'Assets/Sounds/ai-sbmm hover.wav');
        this.preload('ct-hover', 'Assets/Sounds/community-train. hover.wav');
        this.preload('telephone', 'Assets/Sounds/telephone.wav');

        // Proactively create AudioContext so we can resume it on interaction
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.audioContext = new AC();
        } catch (_) {}

        // Global interaction handler to unlock Web Audio after reloads / bfcache
        const unlockAudio = () => {
            this.resumeAudioContext();
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);

        this.setupClickSound();
        this.setupCardHoverSounds();
        this.setupTabHoverSounds();
    },

    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
    },

    preload(name, url) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;
        audio.load();
        this.sounds[name] = audio;
    },

    play(name, volume = 0.5, pan = null) {
        if (!this.enabled) return;
        const audio = this.sounds[name];
        if (!audio) return;

        // Skip if sound hasn't buffered enough to play (prevents hang on first load)
        if (audio.readyState < 2) return;

        // Ensure AudioContext is running (browsers suspend it on reload)
        this.resumeAudioContext();

        // Limit concurrent clones to prevent audio stacking
        if (!this._activeCounts) this._activeCounts = {};
        this._activeCounts[name] = (this._activeCounts[name] || 0) + 1;
        if (this._activeCounts[name] > 3) {
            this._activeCounts[name]--;
            return;
        }

        // Clone to allow overlapping playback and avoid cutting off
        const clone = audio.cloneNode();
        clone.volume = Math.max(0, Math.min(1, volume));

        // Pan audio via Web Audio API (-1 = full left, 1 = full right)
        if (typeof pan === 'number') {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) throw new Error('Web Audio not supported');

                if (!this.audioContext) {
                    this.audioContext = new AC();
                }
                this.resumeAudioContext();

                const source = this.audioContext.createMediaElementSource(clone);
                const panner = this.audioContext.createStereoPanner();
                panner.pan.value = Math.max(-1, Math.min(1, pan));
                source.connect(panner);
                panner.connect(this.audioContext.destination);
            } catch (e) {
                // Fallback to normal playback if Web Audio API fails
            }
        }

        const cleanup = () => {
            clone.onended = null;
            clone.src = '';
            clone.remove();
            if (this._activeCounts) {
                this._activeCounts[name] = Math.max(0, (this._activeCounts[name] || 1) - 1);
            }
        };
        clone.onended = cleanup;

        const promise = clone.play();
        if (promise !== undefined) {
            promise.then(() => {
                setTimeout(cleanup, 5000);
            }).catch(() => {
                cleanup();
            });
        }
    },

    setupClickSound() {
        document.addEventListener('click', (e) => {
            if (e.button !== 0) return; // Only left-clicks
            this.play('click');
        });
    },

    setupCardHoverSounds() {
        const cards = document.querySelectorAll('.player-option');
        const lastHoverTime = new Map();
        const DEBOUNCE_MS = 200;

        cards.forEach(card => {
            const label = card.querySelector('.player-number')?.textContent?.trim();
            let soundName = null;

            if (label === '2P') soundName = 'hover-2p';
            else if (label === '3P') soundName = 'hover-3p';
            else if (label === '4P') soundName = 'hover-4p';
            else if (label === 'ONLINE') soundName = 'hover-online';

            if (!soundName) return;

            card.addEventListener('mouseenter', () => {
                const now = Date.now();
                const last = lastHoverTime.get(card) || 0;
                if (now - last < DEBOUNCE_MS) return;
                lastHoverTime.set(card, now);
                this.play(soundName);
            });

            card.addEventListener('mouseleave', () => {
                this.play('unhover');
            });
        });
    },

    setupTabHoverSounds() {
        const sbmmBtn = document.getElementById('aiSbmmBtn');
        const ctBtn = document.getElementById('ctBtn');
        const lastHoverTime = new Map();
        const DEBOUNCE_MS = 200;

        if (sbmmBtn) {
            sbmmBtn.dataset.hoverSoundAttached = 'true';
            sbmmBtn.addEventListener('mouseenter', () => {
                const wrap = sbmmBtn.closest('.sbmm-tab-wrap');
                if (wrap && getComputedStyle(wrap).pointerEvents === 'none') return;
                const now = Date.now();
                const last = lastHoverTime.get(sbmmBtn) || 0;
                if (now - last < DEBOUNCE_MS) return;
                lastHoverTime.set(sbmmBtn, now);
                this.play('ai-sbmm-hover', 0.5);
            });
        }

        if (ctBtn) {
            ctBtn.dataset.hoverSoundAttached = 'true';
            ctBtn.addEventListener('mouseenter', () => {
                const wrap = ctBtn.closest('.ct-tab-wrap');
                if (!wrap || !wrap.classList.contains('ct-visible')) return;
                const now = Date.now();
                const last = lastHoverTime.get(ctBtn) || 0;
                if (now - last < DEBOUNCE_MS) return;
                lastHoverTime.set(ctBtn, now);
                this.play('ct-hover', 0.5, 1); // 1 = full right ear
            });
        }
    }
};

// Hover sound system (generic - skips player cards which have their own sounds)
const HoverSound = {
    _src: 'Assets/Sounds/click.wav',
    _audio: null,
    enabled: true,
    _observer: null,
    _lastHover: 0,
    _lastFocus: 0,

    init() {
        // Preload hover sound as a buffer so we can clone it for overlapping playback
        this._audio = new Audio();
        this._audio.preload = 'auto';
        this._audio.src = this._src;
        this._audio.load();

        // Skip on touch devices — no hover on mobile and focus-on-touch is noisy
        if (window.matchMedia('(pointer: coarse)').matches) return;

        this._attachListeners();
        this._setupObserver();
    },

    _attachListeners() {
        const selectors = 'button:not(.player-option):not([data-hover-sound-attached]), .value-cell:not([data-hover-sound-attached]), .buzzer-box:not([data-hover-sound-attached]), .submit-btn:not([data-hover-sound-attached]), .cancel-btn:not([data-hover-sound-attached]), .start-btn:not([data-hover-sound-attached]), a:not([href^="http"]):not(.player-option):not([data-hover-sound-attached])';
        const elements = document.querySelectorAll(selectors);
        elements.forEach(el => {
            el.dataset.hoverSoundAttached = 'true';
            el.addEventListener('mouseenter', this._onHover);
            el.addEventListener('focus', this._onFocus);
            el.classList.add('hover-sound-active');
        });
    },

    _setupObserver() {
        if (this._observer || typeof MutationObserver === 'undefined') return;
        this._observer = new MutationObserver((mutations) => {
            const hasNewNodes = mutations.some(m => m.type === 'childList' && m.addedNodes.length);
            if (hasNewNodes) this._attachListeners();
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
    },

    _onHover: (() => {
        let last = 0;
        const DEBOUNCE = 80;
        return () => {
            const now = Date.now();
            if (now - last < DEBOUNCE) return;
            last = now;
            HoverSound.play();
        };
    })(),

    _onFocus: (() => {
        let last = 0;
        const DEBOUNCE = 150;
        return () => {
            const now = Date.now();
            if (now - last < DEBOUNCE) return;
            last = now;
            HoverSound.play();
        };
    })(),

    play() {
        if (!this.enabled || !this._audio || this._audio.readyState < 2) return;
        const clone = this._audio.cloneNode();
        clone.volume = 0.4;
        const promise = clone.play();
        if (promise !== undefined) {
            promise.catch(() => {});
        }
        clone.onended = () => { clone.src = ''; clone.remove(); };
        setTimeout(() => {
            clone.onended = null;
            clone.src = '';
            clone.remove();
        }, 3000);
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AudioManager.init();
        SoundEffects.init();
        HoverSound.init();
    });
} else {
    AudioManager.init();
    SoundEffects.init();
    HoverSound.init();
}
