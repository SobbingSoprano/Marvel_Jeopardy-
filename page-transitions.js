/*
============================================================
 MARVEL JEOPARDY - PAGE TRANSITION SYSTEM
 Comic-book style screen wipes with audio crossfades
============================================================
*/

const PageTransitions = {
    transitioning: false,
    overlay: null,
    panels: [],

    // Initialize transition overlay
    init() {
        this.overlay = document.querySelector('.page-transition-overlay');
        if (!this.overlay) {
            this.createOverlay();
        }
        this.panels = document.querySelectorAll('.transition-panel');

        // On page load, play the "in" transition
        this.playIn();
    },

    // Create overlay if not present in HTML
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'page-transition-overlay';
        for (let i = 0; i < 5; i++) {
            const panel = document.createElement('div');
            panel.className = 'transition-panel';
            panel.style.left = `${i * 20}%`;
            this.overlay.appendChild(panel);
        }
        document.body.appendChild(this.overlay);
        this.panels = this.overlay.querySelectorAll('.transition-panel');
    },

    // Play transition IN (revealing page) on load
    playIn() {
        if (!this.overlay) return;

        // Don't play in-transition if preloader is still active
        const preloader = document.querySelector('.preloader');
        if (preloader && !preloader.classList.contains('preloader-hidden')) {
            // Wait for preloader to hide, then play in-transition
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.target.classList.contains('preloader-hidden')) {
                        observer.disconnect();
                        setTimeout(() => this.playIn(), 100);
                    }
                });
            });
            observer.observe(preloader, { attributes: true, attributeFilter: ['class'] });
            return;
        }

        this.overlay.classList.add('transition-active');
        document.body.classList.add('page-transitioning');

        // Panels start covering screen, then slide away
        this.panels.forEach((panel, i) => {
            panel.style.transform = 'translateY(0)';
            panel.style.transition = 'none';
        });

        // Force reflow
        void this.overlay.offsetWidth;

        this.panels.forEach((panel, i) => {
            const direction = i % 2 === 0 ? '-100%' : '100%';
            panel.style.transition = `transform 0.5s cubic-bezier(0.7, 0, 0.3, 1) ${i * 0.06}s`;
            panel.style.transform = `translateY(${direction})`;
        });

        setTimeout(() => {
            this.overlay.classList.remove('transition-active');
            document.body.classList.remove('page-transitioning');
        }, 900);
    },

    // Play transition OUT (covering screen) then navigate
    playOut(url) {
        if (this.transitioning) return;
        this.transitioning = true;

        if (!this.overlay) {
            window.location.href = url;
            return;
        }

        this.overlay.classList.add('transition-active');
        document.body.classList.add('page-transitioning');

        // Slide panels in to cover screen
        this.panels.forEach((panel, i) => {
            const startDirection = i % 2 === 0 ? '-100%' : '100%';
            panel.style.transform = `translateY(${startDirection})`;
            panel.style.transition = 'none';
        });

        void this.overlay.offsetWidth;

        this.panels.forEach((panel, i) => {
            panel.style.transition = `transform 0.5s cubic-bezier(0.7, 0, 0.3, 1) ${i * 0.06}s`;
            panel.style.transform = 'translateY(0)';
        });

        // Wait for panels to cover, then navigate
        setTimeout(() => {
            window.location.href = url;
        }, 700);
    },

    // Navigate with audio fade and transition
    navigateTo(url) {
        if (this.transitioning) return;

        // Fade out audio if AudioManager exists
        if (typeof AudioManager !== 'undefined' && AudioManager.isPlaying && AudioManager.isPlaying()) {
            AudioManager.fadeOut(600).then(() => {
                this.playOut(url);
            });
        } else {
            this.playOut(url);
        }
    },

    // Setup click interception for links with data-transition attribute
    setupLinkInterception() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-transition], button[data-transition]');
            if (!link) return;

            const url = link.getAttribute('href') || link.dataset.href;
            if (!url || url === '#' || url.startsWith('javascript:')) return;

            // Don't intercept external links
            if (url.startsWith('http') && !url.includes(window.location.hostname)) return;

            e.preventDefault();
            this.navigateTo(url);
        });
    }
};

// Inject background artifacts on game pages
function injectBackgroundArtifacts() {
    if (!document.body.classList.contains('game-page')) return;
    if (document.querySelector('.speed-lines')) return;

    const bursts = [
        { style: 'top:5%;left:5%;width:120px;height:120px;animation-delay:0s;', shape: 'star' },
        { style: 'top:15%;right:10%;width:80px;height:80px;animation-delay:-5s;', shape: 'burst' },
        { style: 'bottom:20%;left:8%;width:100px;height:100px;animation-delay:-10s;', shape: 'star' },
        { style: 'bottom:10%;right:5%;width:140px;height:140px;animation-delay:-15s;', shape: 'burst' }
    ];

    bursts.forEach(b => {
        const div = document.createElement('div');
        div.className = 'comic-burst';
        div.style.cssText = b.style;
        // Simple SVG shapes
        if (b.shape === 'star') {
            div.innerHTML = `<svg viewBox="0 0 100 100"><polygon points="50,5 61,35 95,35 68,55 79,85 50,65 21,85 32,55 5,35 39,35"/></svg>`;
        } else {
            div.innerHTML = `<svg viewBox="0 0 100 100"><path d="M50 0 L60 35 L95 35 L65 55 L75 90 L50 70 L25 90 L35 55 L5 35 L40 35 Z"/></svg>`;
        }
        document.body.appendChild(div);
    });

    const sl1 = document.createElement('div');
    sl1.className = 'speed-lines speed-lines-top-left';
    document.body.appendChild(sl1);

    const sl2 = document.createElement('div');
    sl2.className = 'speed-lines speed-lines-bottom-right';
    document.body.appendChild(sl2);
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injectBackgroundArtifacts();
        PageTransitions.init();
        PageTransitions.setupLinkInterception();
    });
} else {
    injectBackgroundArtifacts();
    PageTransitions.init();
    PageTransitions.setupLinkInterception();
}
