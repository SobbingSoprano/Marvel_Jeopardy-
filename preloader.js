/*
============================================================
 MARVEL JEOPARDY - ASSET PRELOADER
 Waits for all page assets to load before hiding preloader
============================================================
*/

const Preloader = {
    minDisplayTime: 2000, // Minimum time to show preloader (ms)
    globalTimeout: window.innerWidth < 768 ? 12000 : 25000, // Shorter timeout on mobile
    startTime: Date.now(),
    quipInterval: null,
    loadPromise: null,
    loadResolve: null,
    autoHide: false,
    _hidden: false,

    // Marvel-themed loading quips
    quips: [
        "Assembling the Avengers...",
        "Wakanda tech loading (HA! as if- they solved this AGES ago)...",
        "Stark is still building this...",
        "Hulk SMASH... WRONG ANSWERS!!",
        "Spider-senses are tingling...",
        "Shields up! Claws Out! Loading assets...",
        "Mystic Spells of great power require time... so does this Site",
        "Professor X is reading your mind...",
        "Deadpool is breaking the 4th wall... again.",
        "Thor is Reconsiling with Loki (Or so he thinks)...",
        "Hint: Daily Doubles are a risky way to catch up to Opponents!",
        "Remember: What is... [your answer here]",
        "Even Captain America had to wait for the super serum",
        "Fury is recruiting players...",
        "Ant-Man is shrinking the load times...",
        "Doctor Strange saw 14 million futures... You might win in one",
        "Galactus is having a 'snack' while we load...",
        "Syncing Cerebro...",
        "The Black Panther never freezes... unlike Chrome",
        "Magneto is pulling the files together...",
        "Insert Stan Lee Cameo Here...",
        "Star-Lord is grooving out while we buffer...",
        "01010101 01101100 01110100 01110010 01101111 01101110 00100000 01010111 01100001 01110011 00100000 01001000 01100101 01110010 01100101 00101110 00101110 00101110",
        "I am Groot! (Translation: Loading...)",
        "Hint: Final Jeopardy is anyone's game, so dont give up if you're behind!",
    ],

    // Initialize preloader
    init() {
        const preloader = document.querySelector('.preloader');
        if (preloader) {
            preloader.style.opacity = '1';
            preloader.style.visibility = 'visible';
            preloader.style.pointerEvents = 'all';
        }

        this.loadPromise = new Promise(resolve => {
            this.loadResolve = resolve;
        });

        this.startQuips();
        this.playPreloaderAudio();
        this.loadAssets();
    },

    // Wait for loading to complete
    waitForLoad() {
        return this.loadPromise || Promise.resolve();
    },

    // Cycle through loading quips
    startQuips() {
        const quipEl = document.querySelector('.preloader-loading-text');
        if (!quipEl) return;

        let currentIndex = Math.floor(Math.random() * this.quips.length);
        quipEl.textContent = this.quips[currentIndex];

        this.quipInterval = setInterval(() => {
            quipEl.classList.add('quip-fade-out');
            setTimeout(() => {
                currentIndex = (currentIndex + 1) % this.quips.length;
                quipEl.textContent = this.quips[currentIndex];
                quipEl.classList.remove('quip-fade-out');
                quipEl.classList.add('quip-fade-in');
                setTimeout(() => quipEl.classList.remove('quip-fade-in'), 500);
            }, 500);
        }, 3500);
    },

    // Play preloader ambient sound if available
    playPreloaderAudio() {
        const sfx = document.getElementById('preloader-sfx');
        if (sfx) {
            sfx.volume = 0.3;
            const playPromise = sfx.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {});
            }
        }
    },

    // Stop preloader audio
    stopPreloaderAudio() {
        const sfx = document.getElementById('preloader-sfx');
        if (sfx) {
            sfx.pause();
            sfx.currentTime = 0;
        }
    },

    // Load and track all assets
    async loadAssets() {
        const allPromises = [];

        // AudioManager preload
        if (typeof AudioManager !== 'undefined') {
            AudioManager.preloadAll();
        }

        // Track existing audio elements — only those declared preload="auto".
        // hover-sfx uses preload="none" and loads on first interaction, so skip it.
        const audios = document.querySelectorAll('audio[preload="auto"]');
        audios.forEach(audio => {
            if (audio.readyState < 3) {
                allPromises.push(this.loadAudio(audio));
            }
        });

        // Only wait for the first (eagerly sourced) video.
        // Videos 2-8 use data-lazy-src and are loaded progressively by lazyLoadVideos().
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (!video.dataset.lazySrc) {
                allPromises.push(this.loadVideo(video));
            }
        });

        // Track image loading
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (!img.complete) {
                allPromises.push(this.loadImage(img));
            }
        });

        // Track background images in CSS
        allPromises.push(this.loadBackgroundImages());

        // Wait for fonts
        if (document.fonts && document.fonts.ready) {
            allPromises.push(document.fonts.ready);
        }

        // Wait for ALL assets, but cap at global timeout
        try {
            await Promise.race([
                Promise.all(allPromises),
                this.delay(this.globalTimeout)
            ]);
        } catch (e) {
            console.log('Preloader asset error:', e);
        }

        // Kick off lazy video loading now (during the min-display-time window).
        // This gives videos 2-8 extra seconds to buffer before they become visible.
        this.lazyLoadVideos();

        // Ensure minimum display time so the quips can be read
        const elapsed = Date.now() - this.startTime;
        if (elapsed < this.minDisplayTime) {
            await this.delay(this.minDisplayTime - elapsed);
        }

        // Resolve load promise so PageTransitions can coordinate
        if (this.loadResolve) {
            this.loadResolve();
            this.loadResolve = null;
        }

        // Auto-hide only if no one else is controlling timing
        if (this.autoHide) {
            this.hide();
        }
    },

    // Load a single video - wait for canplaythrough OR loadeddata with enough buffer
    loadVideo(video) {
        return new Promise((resolve) => {
            if (video.readyState >= 3) {
                resolve();
                return;
            }

            let resolved = false;
            const doResolve = () => {
                if (!resolved) {
                    resolved = true;
                    video.removeEventListener('canplaythrough', doResolve);
                    video.removeEventListener('loadeddata', doResolve);
                    video.removeEventListener('error', doResolve);
                    resolve();
                }
            };

            video.addEventListener('canplaythrough', doResolve);
            video.addEventListener('loadeddata', doResolve); // Fallback
            video.addEventListener('error', doResolve);

            // Per-video safety timeout (generous for large files)
            setTimeout(doResolve, 15000);
        });
    },

    // Load a single audio
    loadAudio(audio) {
        return new Promise((resolve) => {
            if (audio.readyState >= 3) {
                resolve();
                return;
            }

            let resolved = false;
            const doResolve = () => {
                if (!resolved) {
                    resolved = true;
                    audio.removeEventListener('canplaythrough', doResolve);
                    audio.removeEventListener('error', doResolve);
                    resolve();
                }
            };

            audio.addEventListener('canplaythrough', doResolve);
            audio.addEventListener('error', doResolve);
            setTimeout(doResolve, 5000);
        });
    },

    // Load a single image
    loadImage(img) {
        return new Promise((resolve) => {
            if (img.complete) {
                resolve();
                return;
            }

            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 5000);
        });
    },

    // Load background images
    loadBackgroundImages() {
        return new Promise((resolve) => {
            const elements = document.querySelectorAll('*');
            const bgPromises = [];

            elements.forEach(el => {
                const style = getComputedStyle(el);
                const bgImage = style.backgroundImage;

                if (bgImage && bgImage !== 'none') {
                    const urlMatch = bgImage.match(/url\(["']?(.+?)["']?\)/);
                    if (urlMatch && urlMatch[1]) {
                        bgPromises.push(this.loadImageUrl(urlMatch[1]));
                    }
                }
            });

            if (bgPromises.length === 0) {
                resolve();
            } else {
                Promise.all(bgPromises).then(resolve).catch(resolve);
            }
        });
    },

    // Load image from URL
    loadImageUrl(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = url;
            setTimeout(resolve, 5000);
        });
    },

    // Hide the preloader with fade effect (returns a Promise)
    hide() {
        if (this._hidden) return Promise.resolve();
        this._hidden = true;

        if (this.quipInterval) {
            clearInterval(this.quipInterval);
        }
        this.stopPreloaderAudio();

        return new Promise(resolve => {
            const preloader = document.querySelector('.preloader');
            if (preloader) {
                // Clear inline styles so CSS class takes effect
                preloader.style.opacity = '';
                preloader.style.visibility = '';
                preloader.style.pointerEvents = '';
                preloader.classList.add('preloader-hidden');
                setTimeout(() => {
                    preloader.style.display = 'none';
                    resolve();
                }, 600);
            } else {
                resolve();
            }
        });
    },

    // Show / fade in the preloader
    show() {
        this._hidden = false;
        const preloader = document.querySelector('.preloader');
        if (preloader) {
            preloader.style.display = '';
            preloader.classList.remove('preloader-hidden');
            preloader.style.opacity = '1';
            preloader.style.visibility = 'visible';
            preloader.style.pointerEvents = 'all';
        }
    },

    // Progressively load videos that carry a data-lazy-src attribute.
    // The 120-second CSS animation cycle means each clip first becomes visible at:
    //   Clip2 → ~16s | Clip3 → ~31s | Clip4 → ~46s
    //   Clip5 → ~62s | Clip6 → ~76s | Clip7 → ~92s | Clip8 → ~106s
    // We load in three batches, each well ahead of first appearance.
    lazyLoadVideos() {
        const lazyVideos = Array.from(document.querySelectorAll('video[data-lazy-src]'));
        if (!lazyVideos.length) return;

        const loadVideo = (video) => {
            const src = video.dataset.lazySrc;
            if (!src || video.src) return; // already loaded
            video.src = src;
            delete video.dataset.lazySrc;
            video.load();
        };

        // Batch 1 (Clips 2-4): load ~1 second from now.
        // Gives 15+ seconds of buffer before Clip2 first appears.
        setTimeout(() => lazyVideos.slice(0, 3).forEach(loadVideo), 1000);

        // Batch 2 (Clips 5-6): load ~35 seconds from now.
        // Clips 5 & 6 appear at ~62s and ~76s — 35 seconds of buffer.
        setTimeout(() => lazyVideos.slice(3, 5).forEach(loadVideo), 35000);

        // Batch 3 (Clips 7-8): load ~65 seconds from now.
        // Clips 7 & 8 appear at ~92s and ~106s — 27+ seconds of buffer.
        setTimeout(() => lazyVideos.slice(5).forEach(loadVideo), 65000);
    },

    // Utility: delay
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Preloader.init());
} else {
    Preloader.init();
}
