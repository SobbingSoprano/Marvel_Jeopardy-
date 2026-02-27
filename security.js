/*
============================================================
 MARVEL JEOPARDY - SECURITY UTILITIES
 Input validation, sanitization, and content filtering
============================================================
*/

const Security = {
    // List of blocked words/patterns (case insensitive)
    blockedPatterns: [
        // Common profanity - using patterns to catch variations
        /\bf+u+c+k+/i,
        /\bs+h+i+t+/i,
        /\ba+s+s+(?:hole)?/i,
        /\bb+i+t+c+h+/i,
        /\bd+a+m+n+/i,
        /\bc+u+n+t+/i,
        /\bd+i+c+k+/i,
        /\bp+u+s+s+y+/i,
        /\bc+o+c+k+/i,
        /\bw+h+o+r+e+/i,
        /\bs+l+u+t+/i,
        /\bf+a+g+/i,
        /\bn+i+g+g+/i,
        /\br+e+t+a+r+d+/i,
        /\bp+o+r+n+/i,
        /\bs+e+x+(?:y)?/i,
        /\bp+e+n+i+s+/i,
        /\bv+a+g+i+n+a+/i,
        /\bb+o+o+b+/i,
        /\bt+i+t+s?/i,
        /\ba+n+u+s+/i,
        /\bh+e+l+l+\b/i,
        /\bc+r+a+p+/i,
        /\bp+i+s+s+/i,
        // Hate speech
        /k+i+k+e+/i,
        /s+p+i+c+\b/i,
        /c+h+i+n+k+/i,
        // Leet speak variations
        /f.?u.?c.?k/i,
        /s.?h.?[1i].?t/i,
        /b.?[1i].?t.?c.?h/i,
        // Number substitutions
        /4ss/i,
        /sh1t/i,
        /b1tch/i,
        /f4g/i
    ],

    // Check if text contains profanity
    containsProfanity(text) {
        if (!text || typeof text !== 'string') return false;
        
        const normalized = text.toLowerCase()
            .replace(/[0@]/g, 'o')
            .replace(/[1!|]/g, 'i')
            .replace(/[3]/g, 'e')
            .replace(/[4@]/g, 'a')
            .replace(/[5\$]/g, 's')
            .replace(/[7]/g, 't')
            .replace(/[8]/g, 'b')
            .replace(/\s+/g, ''); // Remove spaces to catch "f u c k"
        
        return this.blockedPatterns.some(pattern => pattern.test(text) || pattern.test(normalized));
    },

    // Sanitize name input - removes profanity and limits length
    sanitizeName(name, maxLength = 20) {
        if (!name || typeof name !== 'string') return 'Player';
        
        // Trim and limit length
        let sanitized = name.trim().substring(0, maxLength);
        
        // Remove HTML/script tags
        sanitized = this.escapeHtml(sanitized);
        
        // Check for profanity
        if (this.containsProfanity(sanitized)) {
            return 'Player'; // Return default if profanity detected
        }
        
        // Only allow alphanumeric, spaces, hyphens, underscores, and common characters
        sanitized = sanitized.replace(/[^\w\s\-_.!?']/g, '');
        
        return sanitized || 'Player';
    },

    // Validate name and return error message if invalid
    validateName(name) {
        if (!name || name.trim().length === 0) {
            return { valid: false, message: 'Name cannot be empty' };
        }
        
        if (name.trim().length > 20) {
            return { valid: false, message: 'Name must be 20 characters or less' };
        }
        
        if (this.containsProfanity(name)) {
            return { valid: false, message: 'Please choose an appropriate name' };
        }
        
        return { valid: true, message: '' };
    },

    // Sanitize and validate numeric input
    sanitizeNumber(value, min = 0, max = Infinity) {
        // Remove any non-numeric characters except minus and decimal
        const cleaned = String(value).replace(/[^\d.-]/g, '');
        const num = parseInt(cleaned, 10);
        
        if (isNaN(num)) return min;
        
        return Math.max(min, Math.min(max, num));
    },

    // Validate wager input
    validateWager(value, minWager = 5, maxWager = 10000, currentScore = 0) {
        const wager = this.sanitizeNumber(value, 0, Infinity);
        
        if (isNaN(wager) || wager < minWager) {
            return { valid: false, value: minWager, message: `Minimum wager is $${minWager}` };
        }
        
        const actualMax = Math.max(currentScore, maxWager);
        if (wager > actualMax) {
            return { valid: false, value: actualMax, message: `Maximum wager is $${actualMax}` };
        }
        
        return { valid: true, value: wager, message: '' };
    },

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        if (!text || typeof text !== 'string') return '';
        
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };
        
        return text.replace(/[&<>"'`=/]/g, char => escapeMap[char]);
    },

    // Decode HTML entities (for display purposes only)
    decodeHtml(text) {
        if (!text || typeof text !== 'string') return '';
        
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    },

    // Sanitize answer input (allow more characters but escape HTML)
    sanitizeAnswer(answer, maxLength = 200) {
        if (!answer || typeof answer !== 'string') return '';
        
        let sanitized = answer.trim().substring(0, maxLength);
        
        // Escape HTML but preserve the answer content
        return this.escapeHtml(sanitized);
    },

    // Validate URL parameters to prevent injection
    sanitizeUrlParam(param) {
        if (!param || typeof param !== 'string') return '';
        
        // Only allow alphanumeric and specific safe characters
        return param.replace(/[^a-zA-Z0-9_-]/g, '');
    },

    // Add security event listeners to number inputs
    setupNumberInputs() {
        document.querySelectorAll('input[type="number"]').forEach(input => {
            // Prevent non-numeric input
            input.addEventListener('keypress', (e) => {
                if (!/[\d-]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                }
            });
            
            // Clean pasted content
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                const cleaned = text.replace(/[^\d-]/g, '');
                document.execCommand('insertText', false, cleaned);
            });
            
            // Validate on blur
            input.addEventListener('blur', (e) => {
                const min = parseInt(input.min) || 0;
                const max = parseInt(input.max) || Infinity;
                input.value = Security.sanitizeNumber(input.value, min, max);
            });
        });
    },

    // Setup name input validation
    setupNameInputs() {
        document.querySelectorAll('input[type="text"]').forEach(input => {
            if (input.id.toLowerCase().includes('name') || input.placeholder?.toLowerCase().includes('name')) {
                input.maxLength = 20;
                
                // Real-time profanity check
                input.addEventListener('input', (e) => {
                    const validation = Security.validateName(input.value);
                    if (!validation.valid && input.value.trim().length > 0) {
                        input.setCustomValidity(validation.message);
                        input.classList.add('input-error');
                    } else {
                        input.setCustomValidity('');
                        input.classList.remove('input-error');
                    }
                });
            }
        });
    },

    // Initialize all security measures
    init() {
        // Setup input validation when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupNumberInputs();
                this.setupNameInputs();
            });
        } else {
            this.setupNumberInputs();
            this.setupNameInputs();
        }
        
        return this;
    }
};

// Auto-initialize
Security.init();
