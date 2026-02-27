/*
============================================================
 MARVEL JEOPARDY - ASSET PRELOADER
 Waits for all page assets to load before hiding preloader
============================================================
*/

const Preloader = {
    minDisplayTime: 1000, // Minimum time to show preloader (ms)
    startTime: Date.now(),
    
    // Initialize preloader
    init() {
        // Ensure preloader is visible immediately
        const preloader = document.querySelector('.preloader');
        if (preloader) {
            preloader.style.opacity = '1';
            preloader.style.visibility = 'visible';
        }
        
        // Start loading assets
        this.loadAssets();
    },
    
    // Load and track all assets
    async loadAssets() {
        const promises = [];
        
        // Track video loading (wait for canplaythrough or enough data)
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            promises.push(this.loadVideo(video));
        });
        
        // Track audio loading
        const audios = document.querySelectorAll('audio');
        audios.forEach(audio => {
            promises.push(this.loadAudio(audio));
        });
        
        // Track image loading
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (!img.complete) {
                promises.push(this.loadImage(img));
            }
        });
        
        // Track background images in CSS
        promises.push(this.loadBackgroundImages());
        
        // Wait for fonts
        if (document.fonts && document.fonts.ready) {
            promises.push(document.fonts.ready);
        }
        
        // Wait for all assets or timeout after 10 seconds
        try {
            await Promise.race([
                Promise.all(promises),
                this.timeout(10000)
            ]);
        } catch (e) {
            console.log('Preloader timeout or error, continuing anyway');
        }
        
        // Ensure minimum display time
        const elapsed = Date.now() - this.startTime;
        if (elapsed < this.minDisplayTime) {
            await this.delay(this.minDisplayTime - elapsed);
        }
        
        // Hide preloader
        this.hide();
    },
    
    // Load a single video
    loadVideo(video) {
        return new Promise((resolve) => {
            // If already ready
            if (video.readyState >= 3) {
                resolve();
                return;
            }
            
            // Wait for canplaythrough event
            const onReady = () => {
                video.removeEventListener('canplaythrough', onReady);
                video.removeEventListener('error', onError);
                resolve();
            };
            
            const onError = () => {
                video.removeEventListener('canplaythrough', onReady);
                video.removeEventListener('error', onError);
                resolve(); // Resolve anyway to not block
            };
            
            video.addEventListener('canplaythrough', onReady);
            video.addEventListener('error', onError);
            
            // Timeout for slow videos - resolve after 5s per video
            setTimeout(resolve, 5000);
        });
    },
    
    // Load a single audio
    loadAudio(audio) {
        return new Promise((resolve) => {
            if (audio.readyState >= 3) {
                resolve();
                return;
            }
            
            const onReady = () => {
                audio.removeEventListener('canplaythrough', onReady);
                audio.removeEventListener('error', onError);
                resolve();
            };
            
            const onError = () => {
                audio.removeEventListener('canplaythrough', onReady);
                audio.removeEventListener('error', onError);
                resolve();
            };
            
            audio.addEventListener('canplaythrough', onReady);
            audio.addEventListener('error', onError);
            
            setTimeout(resolve, 3000);
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
            
            setTimeout(resolve, 3000);
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
            setTimeout(resolve, 3000);
        });
    },
    
    // Hide the preloader with fade effect
    hide() {
        const preloader = document.querySelector('.preloader');
        if (preloader) {
            preloader.classList.add('preloader-hidden');
            
            // Remove from DOM after animation
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        }
    },
    
    // Utility: delay
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // Utility: timeout
    timeout(ms) {
        return new Promise((_, reject) => setTimeout(() => reject('timeout'), ms));
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Preloader.init());
} else {
    Preloader.init();
}
