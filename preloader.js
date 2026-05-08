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
        "Wakanda tech loading...",
        "Tony Stark is still coding this...",
        "Hulk SMASH... bugs!",
        "Spider-sense tingling...",
        "Shields up! Loading assets...",
        "Thanos is snapping... patience required",
        "Professor X is reading your mind...",
        "Deadpool is breaking the 4th wall...",
        "Thor is charging his lightning...",
        "Hint: Daily Doubles are no joke!",
        "Remember: What is... [your answer here]",
        "Even Captain America had to wait for the super serum",
        "Nick Fury is recruiting players...",
        "Ant-Man is shrinking the load times...",
        "Doctor Strange saw 14 million futures. This is the good one.",
        "Galactus is snacking while we load...",
        "The X-Men are syncing Cerebro...",
        "Black Panther never freezes... unlike some browsers",
        "Magneto is pulling the files together...",
        "Did you know? Stan Lee cameoed in every loading screen",
        "Star-Lord is dancing while we buffer...",
        "Vibranium doesn't download itself",
        "Groot says: I am Groot! (Translation: Loading...)",
        "Loki is misdirecting the bugs away..."
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

        // Track existing audio elements
        const audios = document.querySelectorAll('audio');
        audios.forEach(audio => {
            audio.preload = 'auto';
            if (audio.readyState < 3) {
                allPromises.push(this.loadAudio(audio));
            }
        });

        // Track video loading (critical - wait for enough data to play)
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            allPromises.push(this.loadVideo(video));
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
