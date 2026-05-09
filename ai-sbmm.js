/*
============================================================
 MARVEL JEOPARDY - AI-SBMM SYSTEM
 Skill-Based Match Making via Google Gemini Agent
 Tracks player performance & dynamically adjusts difficulty
============================================================
*/

const AISBMM = {
    enabled: false,
    sessionMetrics: {},
    difficultyLevel: 1, // 1 = Normal, 2 = Hard, 3 = Expert
    lastAnalysisTime: 0,
    analysisCooldown: 30000, // ms between Gemini calls
    originalQuestions: null,

    // Thresholds for automatic difficulty adjustment
    thresholds: {
        easyStreak: 3,       // Drop difficulty after 3 wrong in a row
        hardStreak: 5,       // Raise difficulty after 5 correct in a row
        fastAnswerMs: 5000,  // Consider "fast" if answered under 5s
        slowAnswerMs: 20000, // Consider "slow" if over 20s
    },

    init() {
        this.enabled = localStorage.getItem('mj_ai_sbmm_enabled') === '1';
        this.difficultyLevel = parseInt(localStorage.getItem('mj_ai_sbmm_difficulty') || '1');

        // Store original question set on first run (only on game pages that load questions.js)
        if (!this.originalQuestions && typeof allQuestions !== 'undefined') {
            this.originalQuestions = JSON.parse(JSON.stringify(allQuestions));
        }

        this.loadSessionMetrics();

        if (this.enabled) {
            console.log('[AI-SBMM] Initialized — Difficulty:', this.difficultyLevel);
        }
    },

    // Toggle enabled state
    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('mj_ai_sbmm_enabled', this.enabled ? '1' : '0');
        this.updateToggleButton();
        return this.enabled;
    },

    // Check if currently enabled
    isEnabled() {
        return this.enabled;
    },

    // ========================================
    // METRIC TRACKING
    // ========================================

    startQuestionTimer(category, value) {
        if (!this.enabled) return;
        const key = `${category}|${value}`;
        this.sessionMetrics.timers = this.sessionMetrics.timers || {};
        this.sessionMetrics.timers[key] = Date.now();
    },

    recordAnswer(category, value, playerNum, isCorrect, userAnswer) {
        if (!this.enabled) return;

        const key = `${category}|${value}`;
        const startTime = this.sessionMetrics.timers?.[key];
        const answerTimeMs = startTime ? Date.now() - startTime : null;

        // Per-player stats
        const playerStats = this.getPlayerStats(playerNum);
        playerStats.totalAnswers++;
        if (isCorrect) {
            playerStats.correctStreak++;
            playerStats.wrongStreak = 0;
            playerStats.totalCorrect++;
        } else {
            playerStats.wrongStreak++;
            playerStats.correctStreak = 0;
            playerStats.totalWrong++;
        }
        if (answerTimeMs) {
            playerStats.answerTimes.push(answerTimeMs);
        }
        playerStats.lastAnswer = userAnswer;

        // Per-category stats
        const catStats = this.getCategoryStats(category);
        catStats.total++;
        if (isCorrect) catStats.correct++;

        // Per-value stats
        const valStats = this.getValueStats(value);
        valStats.total++;
        if (isCorrect) valStats.correct++;

        this.saveSessionMetrics();

        // Check if we should auto-adjust difficulty
        this.evaluateDifficulty(playerNum);
    },

    getPlayerStats(playerNum) {
        this.sessionMetrics.players = this.sessionMetrics.players || {};
        this.sessionMetrics.players[playerNum] = this.sessionMetrics.players[playerNum] || {
            totalAnswers: 0, totalCorrect: 0, totalWrong: 0,
            correctStreak: 0, wrongStreak: 0,
            answerTimes: [], lastAnswer: ''
        };
        return this.sessionMetrics.players[playerNum];
    },

    getCategoryStats(category) {
        this.sessionMetrics.categories = this.sessionMetrics.categories || {};
        this.sessionMetrics.categories[category] = this.sessionMetrics.categories[category] || { total: 0, correct: 0 };
        return this.sessionMetrics.categories[category];
    },

    getValueStats(value) {
        this.sessionMetrics.values = this.sessionMetrics.values || {};
        this.sessionMetrics.values[value] = this.sessionMetrics.values[value] || { total: 0, correct: 0 };
        return this.sessionMetrics.values[value];
    },

    getAverageAnswerTime(playerNum) {
        const stats = this.sessionMetrics.players?.[playerNum];
        if (!stats || !stats.answerTimes.length) return null;
        return stats.answerTimes.reduce((a, b) => a + b, 0) / stats.answerTimes.length;
    },

    // ========================================
    // DIFFICULTY EVALUATION
    // ========================================

    evaluateDifficulty(playerNum) {
        const stats = this.getPlayerStats(playerNum);
        let newLevel = this.difficultyLevel;

        if (stats.correctStreak >= this.thresholds.hardStreak) {
            newLevel = Math.min(3, this.difficultyLevel + 1);
        } else if (stats.wrongStreak >= this.thresholds.easyStreak) {
            newLevel = Math.max(1, this.difficultyLevel - 1);
        }

        if (newLevel !== this.difficultyLevel) {
            // Reset streaks so the very next answer doesn't immediately re-trigger
            stats.correctStreak = 0;
            stats.wrongStreak = 0;
            this.setDifficulty(newLevel);
        }
    },

    setDifficulty(level) {
        this.difficultyLevel = Math.max(1, Math.min(3, level));
        localStorage.setItem('mj_ai_sbmm_difficulty', this.difficultyLevel.toString());
        console.log('[AI-SBMM] Difficulty adjusted to:', this.difficultyLevel);
        this.applyDifficultyToQuestions();
    },

    // ========================================
    // QUESTION MODIFICATION
    // ========================================

    applyDifficultyToQuestions() {
        if (!this.enabled || !this.originalQuestions) return;

        // Level 1 = Original questions (no change)
        // Level 2 = Swap in harder variants if available
        // Level 3 = Swap in expert variants + reduce hint tolerance

        if (this.difficultyLevel === 1) {
            // Restore originals
            Object.keys(this.originalQuestions).forEach(cat => {
                Object.keys(this.originalQuestions[cat]).forEach(val => {
                    allQuestions[cat][val] = JSON.parse(JSON.stringify(this.originalQuestions[cat][val]));
                });
            });
            return;
        }

        // For levels 2+, integrate with Gemini here
        // to fetch dynamically generated harder questions.
        // The placeholder below shows the hook structure.
        this.requestGeminiQuestionUpdate();
    },

    // ========================================
    // GEMINI API INTEGRATION (via Vercel proxy)
    // ========================================

    async requestGeminiQuestionUpdate() {
        const now = Date.now();
        if (now - this.lastAnalysisTime < this.analysisCooldown) {
            return; // Rate limited
        }
        this.lastAnalysisTime = now;

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    difficultyLevel: this.difficultyLevel,
                    metricsSummary: this.getMetricsSummary()
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error(
                    '[AI-SBMM] Gemini proxy error:', response.status,
                    '| Gemini status:', errData.status || 'unknown',
                    '| Message:', errData.error || '',
                    '| Details:', errData.details || '(none)'
                );
                // Back off a full cooldown so a broken endpoint isn't hammered
                this.lastAnalysisTime = Date.now();
                return;
            }

            const data = await response.json();
            const text = data.text || '';
            this.applyGeminiResponse(text);
        } catch (err) {
            console.error('[AI-SBMM] Gemini request failed:', err);
        }
    },

    getMetricsSummary() {
        const lines = [];
        Object.entries(this.sessionMetrics.players || {}).forEach(([num, stats]) => {
            const accuracy = stats.totalAnswers > 0
                ? ((stats.totalCorrect / stats.totalAnswers) * 100).toFixed(1)
                : 0;
            const avgTime = this.getAverageAnswerTime(num);
            lines.push(`Player ${num}: ${accuracy}% accuracy, streak ${stats.correctStreak} correct / ${stats.wrongStreak} wrong, avg time ${avgTime ? (avgTime/1000).toFixed(1) + 's' : 'N/A'}`);
        });
        return lines.join('\n') || 'No data yet.';
    },

    applyGeminiResponse(text) {
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/) || [null, text];
            const jsonStr = jsonMatch[1].trim();
            const newQuestions = JSON.parse(jsonStr);

            let replaced = 0;
            let skipped = 0;

            // Merge new questions into allQuestions
            Object.keys(newQuestions).forEach(cat => {
                if (!allQuestions[cat]) return;
                Object.keys(newQuestions[cat]).forEach(val => {
                    if (!allQuestions[cat][val]) return;
                    const entry = newQuestions[cat][val];

                    // Validate structure: question must be a non-empty string,
                    // answer must be a non-empty array of strings
                    if (
                        typeof entry.question !== 'string' || !entry.question.trim() ||
                        !Array.isArray(entry.answer) || entry.answer.length === 0 ||
                        !entry.answer.every(a => typeof a === 'string' && a.trim())
                    ) {
                        console.warn(`[AI-SBMM] Skipping malformed entry for ${cat} ${val}:`, entry);
                        skipped++;
                        return;
                    }

                    allQuestions[cat][val] = {
                        question: entry.question.trim(),
                        answer: entry.answer.map(a => a.toLowerCase().trim())
                    };
                    replaced++;
                });
            });

            console.log(`[AI-SBMM] Questions updated: ${replaced} replaced, ${skipped} skipped.`);
        } catch (err) {
            console.error('[AI-SBMM] Failed to parse Gemini response:', err);
        }
    },

    // ========================================
    // UI: HOMEPAGE TOGGLE
    // ========================================

    injectToggleButton() {
        if (document.getElementById('ai-sbmm-toggle')) return;

        const container = document.createElement('div');
        container.id = 'ai-sbmm-toggle';
        container.className = 'ai-sbmm-toggle';
        container.innerHTML = `
            <button class="ai-sbmm-btn ${this.enabled ? 'active' : ''}" id="aiSbmmBtn" aria-describedby="aiSbmmTooltip">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span>AI-SBMM</span>
            </button>
            <div class="ai-sbmm-tooltip" id="aiSbmmTooltip" role="tooltip">
                <strong>AI Skill-Based Match Making</strong>
                <p>Uses AI to analyze player behavior — answer speed, accuracy, and streaks — and dynamically adjusts question difficulty in real-time.</p>
                <span class="tooltip-hint">Toggle to enable/disable</span>
            </div>
        `;

        // Insert into page-nav area or top-right of body
        const nav = document.querySelector('.page-nav');
        if (nav) {
            nav.appendChild(container);
        } else {
            container.style.position = 'fixed';
            container.style.top = '3vh';
            container.style.right = '3vw';
            container.style.zIndex = '1000';
            document.body.appendChild(container);
        }

        document.getElementById('aiSbmmBtn').addEventListener('click', () => {
            const nowEnabled = this.toggle();
            document.getElementById('aiSbmmBtn').classList.toggle('active', nowEnabled);
        });
    },

    updateToggleButton() {
        const btn = document.getElementById('aiSbmmBtn');
        if (btn) btn.classList.toggle('active', this.enabled);
    },

    // ========================================
    // PERSISTENCE
    // ========================================

    loadSessionMetrics() {
        const saved = sessionStorage.getItem('mj_ai_sbmm_metrics');
        this.sessionMetrics = saved ? JSON.parse(saved) : {};
    },

    saveSessionMetrics() {
        sessionStorage.setItem('mj_ai_sbmm_metrics', JSON.stringify(this.sessionMetrics));
    },

    clearSessionMetrics() {
        this.sessionMetrics = {};
        sessionStorage.removeItem('mj_ai_sbmm_metrics');
    },

    // Reset difficulty and metrics at the start of every new game
    resetForNewGame() {
        this.difficultyLevel = 1;
        localStorage.setItem('mj_ai_sbmm_difficulty', '1');
        this.lastAnalysisTime = 0;
        this.clearSessionMetrics();
        this.originalQuestions = null;
        console.log('[AI-SBMM] Reset for new game — Difficulty: 1');
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AISBMM.init());
} else {
    AISBMM.init();
}
