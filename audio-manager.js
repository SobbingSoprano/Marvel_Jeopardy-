/*
============================================================
 MARVEL JEOPARDY - AUDIO MANAGER
 Handles smooth audio transitions with fade in/out effects
============================================================
*/

const AudioManager = {
    currentAudio: null,
    currentTrack: null,
    fadeTime: 500, // ms for fade transitions
    volume: 0.7,   // default volume
    preloadedAudio: {}, // Cache for preloaded audio
    
    tracks: {
        'menu': 'Assets/Sounds/krakoa-menu-theme.mp3',
        'match': 'Assets/Sounds/krakoa-match.mp3',
        'overtime': 'Assets/Sounds/krakoa-overtime.mp3'
    },
    
    // Preload all audio tracks immediately
    preloadAll() {
        Object.entries(this.tracks).forEach(([name, url]) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = url;
            // Start loading immediately
            audio.load();
            this.preloadedAudio[name] = audio;
        });
    },
    
    // Initialize audio system
    init() {
        // Preload all tracks first
        this.preloadAll();
        
        // Create main audio element if it doesn't exist
        if (!document.getElementById('audioManager')) {
            const audio = document.createElement('audio');
            audio.id = 'audioManager';
            audio.loop = true;
            audio.volume = 0;
            audio.preload = 'auto';
            document.body.appendChild(audio);
        }
        this.currentAudio = document.getElementById('audioManager');
        
        // Handle browser autoplay restrictions
        this.setupAutoplayHandler();
        
        return this;
    },
    
    // Setup autoplay handler for browser restrictions
    setupAutoplayHandler() {
        const startAudio = () => {
            if (this.currentAudio && this.currentAudio.paused && this.currentTrack) {
                this.currentAudio.play().catch(() => {});
            }
            document.removeEventListener('click', startAudio);
            document.removeEventListener('keydown', startAudio);
            document.removeEventListener('touchstart', startAudio);
        };
        
        document.addEventListener('click', startAudio);
        document.addEventListener('keydown', startAudio);
        document.addEventListener('touchstart', startAudio);
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
        this.currentAudio.src = url;
        this.currentAudio.loop = loop;
        this.currentTrack = trackName;
        
        if (fadeIn) {
            this.currentAudio.volume = 0;
        } else {
            this.currentAudio.volume = this.volume;
        }
        
        const playPromise = this.currentAudio.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
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
            callback();
        }
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
        return this.fadeOut().then(() => {
            if (this.currentAudio) {
                this.currentAudio.src = '';
                this.currentTrack = null;
            }
        });
    },
    
    // Set volume (0-1)
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.volume = this.volume;
        }
    },
    
    // Mute/unmute
    mute() {
        if (this.currentAudio) {
            this.currentAudio.muted = true;
        }
    },
    
    unmute() {
        if (this.currentAudio) {
            this.currentAudio.muted = false;
        }
    },
    
    // Check if audio is playing
    isPlaying() {
        return this.currentAudio && !this.currentAudio.paused;
    },
    
    // Get current track name
    getCurrentTrack() {
        return this.currentTrack;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AudioManager.init());
} else {
    AudioManager.init();
}
