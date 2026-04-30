/*
============================================================
 MARVEL JEOPARDY - PAGE TRANSITION SYSTEM
 Comic-book style screen wipes with audio crossfades
 Coordinated across pages via sessionStorage
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

        // On page load, decide whether to play the "in" transition
        this.handlePageEntry();
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

    // Decide what to do when a page loads
    handlePageEntry() {
        const cameFromTransition = sessionStorage.getItem('mj_transition_out') === '1';
        const transitionTime = parseInt(sessionStorage.getItem('mj_transition_time') || '0');
        const age = Date.now() - transitionTime;

        // Clear the flag immediately so refreshing doesn't retrigger
        sessionStorage.removeItem('mj_transition_out');
        sessionStorage.removeItem('mj_transition_time');

        // Only play "in" transition if we genuinely came from another page's "out"
        if (cameFromTransition && age < 8000) {
            this.playIn();
        }
    },

    // Play transition IN (revealing page) on load
    playIn() {
        if (!this.overlay) return;

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

        // Set flag so next page knows to play "in" transition
        sessionStorage.setItem('mj_transition_out', '1');
        sessionStorage.setItem('mj_transition_time', Date.now().toString());

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

    // Fade out homepage background music manually
    fadeOutHomepageMusic(duration = 600) {
        const bgMusic = document.getElementById('bgMusic');
        if (!bgMusic || bgMusic.paused) return Promise.resolve();

        return new Promise((resolve) => {
            const startVolume = bgMusic.volume;
            const steps = 20;
            const stepTime = duration / steps;
            const volumeStep = startVolume / steps;
            let currentStep = 0;

            const fadeInterval = setInterval(() => {
                currentStep++;
                bgMusic.volume = Math.max(0, startVolume - (volumeStep * currentStep));
                if (currentStep >= steps) {
                    clearInterval(fadeInterval);
                    bgMusic.volume = 0;
                    bgMusic.pause();
                    resolve();
                }
            }, stepTime);
        });
    },

    // Navigate with audio fade and transition
    navigateTo(url) {
        if (this.transitioning) return;

        const audioFadePromises = [];

        // Fade out AudioManager if playing
        if (typeof AudioManager !== 'undefined' && AudioManager.isPlaying && AudioManager.isPlaying()) {
            audioFadePromises.push(AudioManager.fadeOut(600));
        }

        // Fade out homepage raw bgMusic if playing
        audioFadePromises.push(this.fadeOutHomepageMusic(600));

        Promise.all(audioFadePromises).then(() => {
            this.playOut(url);
        });
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

// ============================================================
// BACKGROUND ARTIFACTS - Rich comic-book decorations
// ============================================================

function injectBackgroundArtifacts() {
    if (!document.body.classList.contains('game-page')) return;
    if (document.querySelector('.speed-lines')) return;

    const isDesktop = window.innerWidth >= 1024;

    // Comic bursts / stars
    const bursts = [
        { style: 'top:5%;left:5%;width:120px;height:120px;animation-delay:0s;', shape: 'star' },
        { style: 'top:15%;right:10%;width:80px;height:80px;animation-delay:-5s;', shape: 'burst' },
        { style: 'bottom:20%;left:8%;width:100px;height:100px;animation-delay:-10s;', shape: 'star' },
        { style: 'bottom:10%;right:5%;width:140px;height:140px;animation-delay:-15s;', shape: 'burst' }
    ];

    // More bursts for desktop to fill empty space
    if (isDesktop) {
        bursts.push(
            { style: 'top:40%;left:2%;width:60px;height:60px;animation-delay:-3s;', shape: 'burst' },
            { style: 'top:60%;right:3%;width:90px;height:90px;animation-delay:-7s;', shape: 'star' },
            { style: 'top:25%;left:85%;width:70px;height:70px;animation-delay:-12s;', shape: 'burst' },
            { style: 'bottom:35%;left:12%;width:110px;height:110px;animation-delay:-18s;', shape: 'star' },
            { style: 'top:8%;left:45%;width:50px;height:50px;animation-delay:-2s;', shape: 'burst' },
            { style: 'bottom:8%;left:55%;width:65px;height:65px;animation-delay:-9s;', shape: 'star' }
        );
    }

    bursts.forEach(b => {
        const div = document.createElement('div');
        div.className = 'comic-burst';
        div.style.cssText = b.style;
        if (b.shape === 'star') {
            div.innerHTML = `<svg viewBox="0 0 100 100"><polygon points="50,5 61,35 95,35 68,55 79,85 50,65 21,85 32,55 5,35 39,35"/></svg>`;
        } else {
            div.innerHTML = `<svg viewBox="0 0 100 100"><path d="M50 0 L60 35 L95 35 L65 55 L75 90 L50 70 L25 90 L35 55 L5 35 L40 35 Z"/></svg>`;
        }
        document.body.appendChild(div);
    });

    // Speed lines in corners
    const sl1 = document.createElement('div');
    sl1.className = 'speed-lines speed-lines-top-left';
    document.body.appendChild(sl1);

    const sl2 = document.createElement('div');
    sl2.className = 'speed-lines speed-lines-bottom-right';
    document.body.appendChild(sl2);

    // Extra floating circles for desktop
    if (isDesktop) {
        const circles = [
            { style: 'top:10%;left:30%;width:40px;height:40px;animation-delay:0s;', color: 'rgba(0,0,0,0.06)' },
            { style: 'top:70%;left:75%;width:60px;height:60px;animation-delay:-4s;', color: 'rgba(0,0,0,0.05)' },
            { style: 'top:45%;left:90%;width:35px;height:35px;animation-delay:-8s;', color: 'rgba(0,0,0,0.07)' },
            { style: 'top:80%;left:25%;width:50px;height:50px;animation-delay:-14s;', color: 'rgba(0,0,0,0.05)' },
            { style: 'top:30%;left:15%;width:30px;height:30px;animation-delay:-6s;', color: 'rgba(0,0,0,0.06)' }
        ];
        circles.forEach(c => {
            const div = document.createElement('div');
            div.className = 'comic-burst';
            div.style.cssText = c.style;
            div.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/></svg>`;
            div.querySelector('svg').style.fill = c.color;
            document.body.appendChild(div);
        });
    }

    // Diagonal action stripes (subtle)
    const stripes = document.createElement('div');
    stripes.className = 'action-stripes';
    document.body.appendChild(stripes);
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
