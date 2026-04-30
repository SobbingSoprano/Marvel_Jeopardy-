/*
============================================================
 MARVEL JEOPARDY - VISUAL EFFECTS SYSTEM
 Score animations, screen shake, flashes, parallax
============================================================
*/

// ============================================================
// SCORE ANIMATOR - Rolling number counter
// ============================================================
const ScoreAnimator = {
    animations: new Map(), // element -> { from, to, startTime, duration }

    // Set a score with smooth animation
    setScore(element, newValue) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        if (!element) return;

        const target = parseInt(newValue) || 0;
        const currentText = element.textContent.replace(/[^0-9-]/g, '');
        const current = parseInt(currentText) || 0;

        // Skip animation on initial load or if value hasn't changed
        if (currentText === '' || current === target) {
            element.textContent = `$${target}`;
            return;
        }

        // Cancel any existing animation on this element
        if (this.animations.has(element)) {
            cancelAnimationFrame(this.animations.get(element).rafId);
        }

        const duration = 800; // ms
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const val = Math.round(current + (target - current) * eased);
            element.textContent = `$${val}`;

            // Add pop effect at the end
            if (progress >= 1) {
                element.classList.add('score-pop');
                setTimeout(() => element.classList.remove('score-pop'), 400);
                this.animations.delete(element);
            } else {
                const rafId = requestAnimationFrame(animate);
                this.animations.set(element, { rafId });
            }
        };

        const rafId = requestAnimationFrame(animate);
        this.animations.set(element, { rafId });
    }
};

// ============================================================
// SCREEN EFFECTS - Shake, flash, pulse
// ============================================================
const ScreenEffects = {
    // Shake the screen
    shake(intensity = 'medium') {
        const map = { light: 'screen-shake-light', medium: 'screen-shake', heavy: 'screen-shake-heavy' };
        const className = map[intensity] || map.medium;
        document.body.classList.add(className);
        setTimeout(() => document.body.classList.remove(className), 500);
    },

    // Flash the screen with a color
    flash(color = 'red') {
        const overlay = document.querySelector('.flash-overlay') || this.createFlashOverlay();
        overlay.style.background = color === 'red' ? 'rgba(255, 0, 0, 0.3)' : 
                                   color === 'green' ? 'rgba(0, 255, 0, 0.3)' :
                                   color === 'white' ? 'rgba(255, 255, 255, 0.4)' : color;
        overlay.classList.add('flash-active');
        setTimeout(() => overlay.classList.remove('flash-active'), 300);
    },

    // Pulse an element
    pulse(element) {
        if (typeof element === 'string') element = document.getElementById(element);
        if (!element) return;
        element.classList.add('effect-pulse');
        setTimeout(() => element.classList.remove('effect-pulse'), 600);
    },

    createFlashOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'flash-overlay';
        document.body.appendChild(overlay);
        return overlay;
    }
};

// ============================================================
// PARALLAX TITLE - Mouse-follow effect on homepage
// ============================================================
const ParallaxTitle = {
    enabled: false,
    title: null,
    marvel: null,
    jeopardy: null,

    init() {
        this.title = document.querySelector('.title');
        if (!this.title) return;
        
        // Only run on homepage (where video background exists)
        if (!document.querySelector('.video-background')) return;
        
        // Skip on touch devices (no mouse) or very small screens
        if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) return;

        this.marvel = this.title.querySelector('.title-marvel');
        this.jeopardy = this.title.querySelector('.title-jeopardy');
        this.enabled = true;

        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    },

    onMouseMove(e) {
        if (!this.enabled) return;
        
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = (e.clientX - cx) / cx; // -1 to 1
        const dy = (e.clientY - cy) / cy; // -1 to 1

        // Move title slightly opposite to mouse for depth
        if (this.title) {
            this.title.style.transform = `translateX(calc(-50% + ${dx * -12}px)) translateY(${dy * -6}px)`;
        }
        // Move Marvel text more for layered effect
        if (this.marvel) {
            this.marvel.style.transform = `translate(${dx * 4}px, ${dy * 2}px)`;
        }
        // Move Jeopardy text differently
        if (this.jeopardy) {
            this.jeopardy.style.transform = `translate(${dx * -6}px, ${dy * -3}px) scaleX(0.85)`;
        }
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ParallaxTitle.init());
} else {
    ParallaxTitle.init();
}
