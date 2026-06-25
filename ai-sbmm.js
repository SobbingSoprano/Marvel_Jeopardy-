/*
============================================================
 MARVEL JEOPARDY - AI-SBMM SYSTEM
 Skill-Based Match Making via Google Gemini Agent
 Tracks player performance & dynamically adjusts difficulty
============================================================
*/

const AISBMM = {
    enabled: false,
    geminiAvailable: true,
    sessionMetrics: {},
    difficultyLevel: 1, // 1 = Normal, 2 = Hard, 3 = Expert
    lastAnalysisTime: 0,
    analysisCooldown: 12000, // ms between Gemini calls
    originalQuestions: null,
    generatedQuestions: { 2: null, 3: null }, // Cached Hard/Expert sets per level
    difficultyChangeCount: 0,
    difficultyHistory: [],
    answersSinceDifficultyChange: 0,
    logEntries: [],          // in-memory log (Ctrl+S to print)
    logMaxEntries: 60,       // keep the last N entries

    // Thresholds for automatic difficulty adjustment
    thresholds: {
        easyStreak: 3,        // Drop difficulty after 3 wrong in a row
        skillScoreUp: 10,     // Raise difficulty when skillScore hits this (see scoreAnswer)
        skillScoreDown: -6,   // Drop difficulty when skillScore hits this
        fastAnswerMs: 6000,   // "Fast" answer — bonus multiplier applies
        slowAnswerMs: 21600,  // "Slow" answer — no score awarded for correct answers
    },

    // Point-value → base skill weight.  Higher-value questions count more.
    valueWeights: {
        '$200':  1,
        '$400':  2,
        '$600':  3,
        '$800':  4,
        '$1000': 5,
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
            this.logEvent('AI-SBMM active — Difficulty ' + ['', 'Normal', 'Hard', 'Expert'][this.difficultyLevel], 'system');
            this._registerStatsShortcut();
        }
        this.updateToggleButton();
        this.injectSbmmIndicator();
        // Delayed second call ensures indicator is visible after preloader settles
        setTimeout(() => this._updateIndicatorVisibility(), 800);
        this.checkGeminiHealth();
    },

    // ── In-game API activity indicator ─────────────────────────────────────
    injectSbmmIndicator() {
        if (document.getElementById('sbmm-indicator-wrap')) return;
        const gameContent = document.getElementById('gameContent');
        if (!gameContent || !gameContent.parentNode) {
            setTimeout(() => this.injectSbmmIndicator(), 500);
            return;
        }

        const wrap = document.createElement('div');
        wrap.id = 'sbmm-indicator-wrap';
        wrap.className = 'sbmm-indicator-wrap';
        wrap.innerHTML = '<div class="sbmm-indicator-dot" id="sbmm-indicator-dot"></div>';
        gameContent.parentNode.insertBefore(wrap, gameContent);
        this._updateIndicatorVisibility();
        console.log('[AI-SBMM] Indicator injected');
    },

    _updateIndicatorVisibility() {
        const wrap = document.getElementById('sbmm-indicator-wrap');
        if (!wrap) return;
        wrap.classList.toggle('visible', this.enabled);
        console.log('[AI-SBMM] Indicator visibility:', this.enabled, '→ wrap classes:', wrap.className);
    },

    _indicatorSuccess() {
        const dot = document.getElementById('sbmm-indicator-dot');
        const wrap = document.getElementById('sbmm-indicator-wrap');
        if (!dot || !wrap) {
            console.log('[AI-SBMM] Indicator: success skipped — element not found');
            return;
        }
        console.log('[AI-SBMM] Indicator: success blink');
        // Ensure container is visible before blinking
        wrap.classList.add('visible');
        dot.style.background = '#ffaa00';
        this._runBlink(dot, 3, 500);
    },

    _indicatorFail() {
        const dot = document.getElementById('sbmm-indicator-dot');
        const wrap = document.getElementById('sbmm-indicator-wrap');
        if (!dot || !wrap) {
            console.log('[AI-SBMM] Indicator: fail skipped — element not found');
            return;
        }
        console.log('[AI-SBMM] Indicator: fail blink');
        // Ensure container is visible before blinking
        wrap.classList.add('visible');
        dot.style.background = '#ffaa00';
        this._runBlink(dot, 1, 500, () => {
            dot.style.background = '#ff0000';
            this._runBlink(dot, 2, 500);
        });
    },

    _runBlink(dot, times, intervalMs, onDone) {
        // Disable CSS transitions so blinks are instant and distinct
        const savedTransition = dot.style.transition;
        dot.style.transition = 'none';
        let count = 0;
        const max = times * 2;
        const step = () => {
            dot.style.opacity = (count % 2 === 0) ? '1' : '0';
            count++;
            if (count < max) {
                setTimeout(step, intervalMs);
            } else {
                dot.style.opacity = '0';
                dot.style.transition = savedTransition;
                if (onDone) onDone();
            }
        };
        step();
    },

    // ── Board-update modal (shown on any difficulty change) ────────────────
    _showBoardUpdateModal(title, subtitle) {
        // Remove any existing modal first
        this._hideBoardUpdateModal();

        const div = document.createElement('div');
        div.id = 'sbmm-board-update-modal';
        div.className = 'question-overlay';
        div.style.cssText = 'display:flex; z-index:200001;';
        div.innerHTML = `
            <div class="question-card" style="text-align:center; max-width:420px;">
                <h2 class="guess-title" style="margin-bottom:0.5em;">${title}</h2>
                <p class="guess-instructions" style="margin:0.5em 0 1.2em;">${subtitle}</p>
                <div class="preloader-spinner" style="margin:0 auto;"></div>
            </div>`;
        document.body.appendChild(div);
    },

    _hideBoardUpdateModal(delayMs = 0) {
        const remove = () => {
            const el = document.getElementById('sbmm-board-update-modal');
            if (el) el.remove();
        };
        if (delayMs > 0) {
            setTimeout(remove, delayMs);
        } else {
            remove();
        }
    },

    // ── Gemini health check ────────────────────────────────────────────────
    async checkGeminiHealth() {
        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'health' })
            });
            console.log('[AI-SBMM] Health check HTTP status:', response.status);
            if (!response.ok) throw new Error(`Health check failed — HTTP ${response.status}`);
            const data = await response.json();
            console.log('[AI-SBMM] Health check response:', data);
            this.geminiAvailable = data.ready !== false;
            console.log('[AI-SBMM] Gemini available:', this.geminiAvailable);
        } catch (err) {
            console.error('[AI-SBMM] Health check error:', err.message);
            this.geminiAvailable = false;
        }
        this.updateGeminiStatusUI();
    },

    updateGeminiStatusUI() {
        const tooltip = document.getElementById('aiSbmmTabTooltip');
        const btn = document.getElementById('aiSbmmBtn');
        if (!this.geminiAvailable) {
            if (tooltip) {
                let warning = tooltip.querySelector('.tooltip-warning');
                if (!warning) {
                    warning = document.createElement('span');
                    warning.className = 'tooltip-warning';
                    tooltip.appendChild(warning);
                }
                warning.textContent = '⚠️ AI-SBMM cannot be enabled at this time. Please check back later!';
            }
            if (btn) {
                btn.classList.add('gemini-unavailable');
                // If currently enabled, auto-disable since Gemini is down
                if (this.enabled) {
                    this.enabled = false;
                    localStorage.setItem('mj_ai_sbmm_enabled', '0');
                    this.updateToggleButton();
                    if (typeof CommTraining !== 'undefined') CommTraining.setSbmmActive(false);
                }
            }
        } else {
            if (tooltip) {
                const warning = tooltip.querySelector('.tooltip-warning');
                if (warning) warning.remove();
            }
            if (btn) btn.classList.remove('gemini-unavailable');
        }
    },

    // Register Ctrl+S shortcut once
    _shortcutRegistered: false,
    _registerStatsShortcut() {
        if (this._shortcutRegistered) return;
        this._shortcutRegistered = true;
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.printStats();
            }
        });
        console.log('[AI-SBMM] Press Ctrl+S at any time to print a live stats snapshot.');
    },

    // ── Ctrl+S: print full stats snapshot to console ──────────────
    printStats() {
        const diffLabel = ['', 'Normal', 'Hard', 'Expert'][this.difficultyLevel];
        const players   = this.sessionMetrics.players   || {};
        const cats      = this.sessionMetrics.categories || {};
        const vals      = this.sessionMetrics.values     || {};

        console.group('%c[AI-SBMM] ─── STATS SNAPSHOT ───────────────────────', 'color:#ffaa00;font-weight:bold');
        console.log(`%cDifficulty: ${diffLabel} (Level ${this.difficultyLevel})`, 'color:#ffaa00');

        // ── Per-player table ──────────────────────────────────────
        const playerRows = Object.entries(players).map(([num, s]) => {
            const acc = s.totalAnswers > 0
                ? ((s.totalCorrect / s.totalAnswers) * 100).toFixed(1) + '%'
                : 'N/A';
            const avgMs = s.answerTimes?.length
                ? (s.answerTimes.reduce((a, b) => a + b, 0) / s.answerTimes.length / 1000).toFixed(2) + 's'
                : 'N/A';
            return {
                Player: `P${num}`,
                'Skill Score': (s.skillScore >= 0 ? '+' : '') + (s.skillScore || 0).toFixed(1),
                Correct: s.totalCorrect,
                Wrong: s.totalWrong,
                'Accuracy': acc,
                'Avg Speed': avgMs,
                'Correct Streak': s.correctStreak,
                'Wrong Streak': s.wrongStreak,
            };
        });
        if (playerRows.length) {
            console.log('%cPlayers:', 'color:#ccc;font-style:italic');
            console.table(playerRows);
        } else {
            console.log('%c  No answers recorded yet.', 'color:#888');
        }

        // ── Per-category breakdown ────────────────────────────────
        const catRows = Object.entries(cats).map(([cat, s]) => ({
            Category: cat,
            Asked: s.total,
            Correct: s.correct,
            Accuracy: s.total ? ((s.correct / s.total) * 100).toFixed(1) + '%' : 'N/A',
        }));
        if (catRows.length) {
            console.log('%cCategories:', 'color:#ccc;font-style:italic');
            console.table(catRows);
        }

        // ── Per-value breakdown ───────────────────────────────────
        const valRows = ['$200','$400','$600','$800','$1000'].filter(v => vals[v]).map(v => ({
            Value: v,
            Asked: vals[v].total,
            Correct: vals[v].correct,
            Accuracy: vals[v].total ? ((vals[v].correct / vals[v].total) * 100).toFixed(1) + '%' : 'N/A',
        }));
        if (valRows.length) {
            console.log('%cPoint Values:', 'color:#ccc;font-style:italic');
            console.table(valRows);
        }

        // ── Recent event feed ─────────────────────────────────────
        if (this.logEntries.length) {
            console.log('%cRecent Events (newest first):', 'color:#ccc;font-style:italic');
            this.logEntries.forEach(e => {
                const ts  = new Date(e.time).toLocaleTimeString();
                const css = {
                    correct:    'color:#00ff88',
                    wrong:      'color:#ff4444',
                    timeout:    'color:#ff6600',
                    difficulty: 'color:#ffaa00;font-weight:bold',
                    system:     'color:#aaa;font-style:italic',
                }[e.type] || 'color:#fff';
                console.log(`%c  [${ts}] ${e.message}`, css);
            });
        }

        console.groupEnd();
    },

    // Toggle enabled state
    toggle() {
        if (!this.geminiAvailable) {
            console.warn('[AI-SBMM] Cannot toggle: Gemini API is unavailable');
            return this.enabled;
        }
        this.enabled = !this.enabled;
        localStorage.setItem('mj_ai_sbmm_enabled', this.enabled ? '1' : '0');
        this.updateToggleButton();
        this._updateIndicatorVisibility();
        if (this.enabled) {
            this.logEvent('AI-SBMM enabled — Difficulty ' + ['', 'Normal', 'Hard', 'Expert'][this.difficultyLevel], 'system');
            this._registerStatsShortcut();
        }
        // Sync Community Training button visibility / auto-disable CT if SBMM turned off
        if (typeof CommTraining !== 'undefined') CommTraining.setSbmmActive(this.enabled);
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

        // Weighted skill score delta for this answer
        const rawDelta = this.scoreAnswer(value, isCorrect, answerTimeMs);
        // Apply community training modifier (subtle ±35% nudge based on aggregate data)
        const ctMod = (typeof CommTraining !== 'undefined' && CommTraining.enabled)
            ? CommTraining.getScoreModifier(category, value, isCorrect)
            : 1.0;
        // Oscillation dampener: reduce swing magnitude by 40% when bouncing
        // between two difficulties so the player settles into the right tier.
        const isOsc = this.isOscillating();
        const oscMod = isOsc ? 0.6 : 1.0;
        const delta = rawDelta * ctMod * oscMod;
        playerStats.skillScore = (playerStats.skillScore || 0) + delta;

        // Log this pick for community training (pick index = total answered so far + 1)
        if (typeof CommTraining !== 'undefined') {
            const pickIndex = (this.sessionMetrics.pickCount || 0) + 1;
            CommTraining.logPick(category, value, pickIndex, isCorrect);
        }
        this.sessionMetrics.pickCount = (this.sessionMetrics.pickCount || 0) + 1;
        this.answersSinceDifficultyChange++;

        if (isCorrect) {
            playerStats.correctStreak++;
            playerStats.wrongStreak = 0;
            playerStats.totalCorrect++;
            if (answerTimeMs) playerStats.streakAnswerTimes.push(answerTimeMs);
        } else {
            playerStats.wrongStreak++;
            playerStats.correctStreak = 0;
            playerStats.streakAnswerTimes = [];
            playerStats.totalWrong++;
        }

        // Real-time log entry
        const timeStr = answerTimeMs ? ` (${(answerTimeMs / 1000).toFixed(1)}s)` : '';
        const deltaStr = delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
        const entryType = isCorrect ? 'correct' : 'wrong';
        // Show progress toward next difficulty threshold
        const currentScore = playerStats.skillScore || 0;
        const nextThreshold = currentScore >= 0 ? this.thresholds.skillScoreUp : this.thresholds.skillScoreDown;
        const scoreStr = `${currentScore >= 0 ? '+' : ''}${currentScore.toFixed(1)}/${nextThreshold}`;
        const oscStr = isOsc ? ' [OSC -40%]' : '';
        this.logEvent(
            `P${playerNum} • ${category} ${value}${timeStr} — ${isCorrect ? 'CORRECT' : 'WRONG'} [${deltaStr} pts. ${scoreStr}]${oscStr}`,
            entryType
        );
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
            skillScore: 0,
            answerTimes: [], streakAnswerTimes: [], lastAnswer: ''
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
    // SKILL SCORE CALCULATION
    // ========================================

    // Returns the skill delta for one answer.
    // Correct:    base weight (from value) × speed multiplier (1.0–2.0).
    // Wrong:      −(base × 0.5)  — partial penalty.
    // No answer:  −(base × 1.25) — heavier penalty than wrong; player couldn't attempt it.
    scoreAnswer(value, isCorrect, answerTimeMs) {
        const base = this.valueWeights[value] ?? 1;
        if (!isCorrect) {
            // Wrong answer — deduct half the base weight
            return -(base * 0.5);
        }
        if (!answerTimeMs || answerTimeMs >= this.thresholds.slowAnswerMs) {
            // Too slow — no score awarded
            return 0;
        }
        // Speed multiplier: ranges from 1.0 (just under slowAnswerMs) to 2.0 (at fastAnswerMs or below)
        const fast = this.thresholds.fastAnswerMs;
        const slow = this.thresholds.slowAnswerMs;
        const speedRatio = Math.max(0, Math.min(1, (slow - answerTimeMs) / (slow - fast)));
        const speedMult = 1 + speedRatio; // 1.0–2.0
        return base * speedMult;
    },

    // Called when a question times out or is skipped with no answer submitted.
    // Penalises harder than a wrong answer — the player couldn't even attempt it.
    recordNoAnswer(category, value, playerNum) {
        if (!this.enabled) return;

        const base = this.valueWeights[value] ?? 1;
        const rawPenalty = -(base * 1.25);
        // Apply community training modifier (commonly-missed categories penalise less)
        const ctMod = (typeof CommTraining !== 'undefined' && CommTraining.enabled)
            ? CommTraining.getScoreModifier(category, value, false)
            : 1.0;
        // Oscillation dampener
        const isOsc = this.isOscillating();
        const oscMod = isOsc ? 0.6 : 1.0;
        const penalty = rawPenalty * ctMod * oscMod;

        const playerStats = this.getPlayerStats(playerNum);
        playerStats.totalAnswers++;
        playerStats.totalWrong++;
        playerStats.skillScore = (playerStats.skillScore || 0) + penalty;

        // Log this no-answer for community training
        if (typeof CommTraining !== 'undefined') {
            const pickIndex = (this.sessionMetrics.pickCount || 0) + 1;
            CommTraining.logPick(category, value, pickIndex, false);
        }
        this.sessionMetrics.pickCount = (this.sessionMetrics.pickCount || 0) + 1;
        this.answersSinceDifficultyChange++;

        // Count as a wrong for streak purposes — feeds both skillScoreDown and easyStreak checks
        playerStats.wrongStreak++;
        playerStats.correctStreak = 0;
        playerStats.streakAnswerTimes = [];

        // Per-value stats
        const valStats = this.getValueStats(value);
        valStats.total++;

        // Per-category stats
        const catStats = this.getCategoryStats(category);
        catStats.total++;

        // Log no-answer event
        const naScore = playerStats.skillScore || 0;
        const naThreshold = naScore >= 0 ? this.thresholds.skillScoreUp : this.thresholds.skillScoreDown;
        const naScoreStr = `${naScore >= 0 ? '+' : ''}${naScore.toFixed(1)}/${naThreshold}`;
        const penaltyStr = penalty >= 0 ? `+${penalty.toFixed(1)}` : penalty.toFixed(1);
        const oscStr = isOsc ? ' [OSC -40%]' : '';
        this.logEvent(`P${playerNum} • ${category} ${value} — NO ANSWER [${penaltyStr} pts. ${naScoreStr}]${oscStr}`, 'timeout');
        this.saveSessionMetrics();
        this.updateScoreLog();
        this.evaluateDifficulty(playerNum);
    },

    // ========================================
    // DIFFICULTY EVALUATION
    // ========================================

    evaluateDifficulty(playerNum) {
        const stats = this.getPlayerStats(playerNum);
        const score = stats.skillScore || 0;
        let newLevel = this.difficultyLevel;

        if (score >= this.thresholds.skillScoreUp) {
            newLevel = Math.min(3, this.difficultyLevel + 1);
        } else if (score <= this.thresholds.skillScoreDown || stats.wrongStreak >= this.thresholds.easyStreak) {
            newLevel = Math.max(1, this.difficultyLevel - 1);
        }

        if (newLevel !== this.difficultyLevel) {
            // setDifficulty calls resetAllPlayerStreaks(), which covers this player too.
            this.setDifficulty(newLevel);
        }
    },

    // Reset every player's streak counters so a level change can't be immediately
    // re-triggered by another player whose independent streak is already at the threshold.
    resetAllPlayerStreaks() {
        const players = this.sessionMetrics.players || {};
        Object.values(players).forEach(p => {
            p.correctStreak = 0;
            p.wrongStreak = 0;
            p.streakAnswerTimes = [];
            p.skillScore = 0; // Reset score window after each level change
        });
    },

    setDifficulty(level) {
        const oldLevel = this.difficultyLevel;
        this.difficultyLevel = Math.max(1, Math.min(3, level));
        localStorage.setItem('mj_ai_sbmm_difficulty', this.difficultyLevel.toString());

        if (oldLevel !== this.difficultyLevel) {
            this.difficultyChangeCount++;
            this.difficultyHistory.push(this.difficultyLevel);
            if (this.difficultyHistory.length > 5) this.difficultyHistory.shift();
            this.answersSinceDifficultyChange = 0;
        }

        const label = ['', 'Normal', 'Hard', 'Expert'][this.difficultyLevel];
        console.log('[AI-SBMM] Difficulty adjusted to:', this.difficultyLevel);
        this.logEvent(`⚡ Difficulty → ${label} (Level ${this.difficultyLevel})`, 'difficulty');
        // Reset all players' streaks/scores so no second level change can fire immediately.
        // (JS is single-threaded, so this is sufficient — no pre-stamp needed.)
        this.resetAllPlayerStreaks();
        this.updateScoreLog();

        const oldLabel = ['', 'Normal', 'Hard', 'Expert'][oldLevel];
        if (this.difficultyLevel < oldLevel) {
            this._showBoardUpdateModal(`Difficulty lowered to ${label}`, 'Restoring original questions...');
        } else if (this.difficultyLevel > oldLevel) {
            const cached = this.generatedQuestions[this.difficultyLevel];
            if (cached) {
                this._showBoardUpdateModal(`Difficulty raised to ${label}`, 'Restoring cached questions...');
            } else {
                this._showBoardUpdateModal(`Difficulty raised to ${label}`, 'Generating new questions...');
            }
        }
        this.applyDifficultyToQuestions();
    },

    // Detects if the player is oscillating between two difficulty levels.
    // When true, all skill-point deltas are reduced by 40% to dampen swings.
    isOscillating() {
        if (this.difficultyChangeCount < 3) return false;
        const h = this.difficultyHistory;
        if (h.length < 3) return false;

        // Last 3 changes must alternate between exactly 2 levels (e.g., 1→2→1 or 2→1→2)
        const recent = h.slice(-3);
        const unique = [...new Set(recent)];
        if (unique.length !== 2) return false;
        if (recent[0] !== recent[2]) return false;

        // Only penalize while we're still early in the current difficulty stint
        return this.answersSinceDifficultyChange <= 2;
    },

    // ========================================
    // QUESTION MODIFICATION
    // ========================================

    applyDifficultyToQuestions() {
        if (!this.enabled) return;

        // Ensure we have the original question set captured
        if (!this.originalQuestions && typeof allQuestions !== 'undefined') {
            this.originalQuestions = JSON.parse(JSON.stringify(allQuestions));
        }
        if (!this.originalQuestions) return;

        // Level 1 = Original questions (restore from snapshot)
        if (this.difficultyLevel === 1) {
            let restored = 0;
            Object.keys(this.originalQuestions).forEach(cat => {
                if (!allQuestions[cat]) return;
                Object.keys(this.originalQuestions[cat]).forEach(val => {
                    if (!allQuestions[cat][val]) return;
                    allQuestions[cat][val] = JSON.parse(JSON.stringify(this.originalQuestions[cat][val]));
                    restored++;
                });
            });
            console.log(`[AI-SBMM] Restored original Normal questions: ${restored} clues.`);
            this.logEvent(`Restored original Normal questions (${restored} clues)`, 'system');
            this._hideBoardUpdateModal(1200);
            return;
        }

        // Level 2/3: use cached generated questions if we already fetched them
        const cached = this.generatedQuestions[this.difficultyLevel];
        if (cached) {
            this._applyQuestionSet(cached, true);
            this._hideBoardUpdateModal(1200);
            return;
        }

        // First time at this difficulty — fetch from Gemini immediately (bypass cooldown)
        this.requestGeminiQuestionUpdate(1, true);
    },

    // Shared validation + merge logic used by both Gemini responses and cache restores
    _applyQuestionSet(questions, fromCache = false) {
        let replaced = 0;
        let skipped = 0;

        Object.keys(questions).forEach(cat => {
            if (!allQuestions[cat]) return;
            Object.keys(questions[cat]).forEach(val => {
                if (!allQuestions[cat][val]) return;
                const entry = questions[cat][val];

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

        const label = ['', 'Normal', 'Hard', 'Expert'][this.difficultyLevel];
        if (fromCache) {
            console.log(`[AI-SBMM] Restored cached ${label} questions: ${replaced} replaced, ${skipped} skipped.`);
            this.logEvent(`Restored cached ${label} questions (${replaced} clues)`, 'system');
        } else {
            console.log(`[AI-SBMM] Questions updated: ${replaced} replaced, ${skipped} skipped.`);
            this.logEvent(`Gemini refreshed board: ${replaced} new clues (${skipped} skipped)`, 'system');
        }

        return { replaced, skipped };
    },

    // ========================================
    // GEMINI API INTEGRATION (via Vercel proxy)
    // ========================================

    async requestGeminiQuestionUpdate(attempt = 1, force = false) {
        const now = Date.now();
        if (!force && now - this.lastAnalysisTime < this.analysisCooldown) {
            this._hideBoardUpdateModal();
            return; // Rate limited
        }
        this.lastAnalysisTime = now;

        const requestedLevel = this.difficultyLevel;

        // Snapshot of the current board questions so Gemini can avoid duplicates
        let currentQuestions = null;
        if (typeof allQuestions !== 'undefined') {
            try {
                currentQuestions = JSON.parse(JSON.stringify(allQuestions));
            } catch (_) { /* non-fatal */ }
        }

        // Split into 2 batches of 3 categories to stay under Vercel's 10s timeout
        const batches = [
            ['People', 'Powers', 'Artifacts'],
            ['Media', 'Teams', 'Places']
        ];

        let mergedQuestions = {};
        let anySuccess = false;

        for (const batchCats of batches) {
            const batchResult = await this._fetchBatch(batchCats, currentQuestions);
            if (batchResult) {
                Object.assign(mergedQuestions, batchResult);
                anySuccess = true;
            }
        }

        if (anySuccess) {
            const result = this._applyQuestionSet(mergedQuestions);
            if (result && result.replaced > 0) {
                this.generatedQuestions[requestedLevel] = JSON.parse(JSON.stringify(mergedQuestions));
            }
            this._indicatorSuccess();
        } else {
            this._indicatorFail();
        }
        this._hideBoardUpdateModal(1200);
    },

    async _fetchBatch(categories, currentQuestions, attempt = 1) {
        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    difficultyLevel: this.difficultyLevel,
                    metricsSummary: this.getMetricsSummary(),
                    existingQuestions: currentQuestions,
                    categories: categories
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error(
                    '[AI-SBMM] Batch error (' + categories.join(',') + '):', response.status,
                    '|', errData.error || ''
                );

                // Retry once on 502/503/504
                if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt === 1) {
                    console.log('[AI-SBMM] Retrying batch (' + categories.join(',') + ') after ' + response.status + '...');
                    await new Promise(r => setTimeout(r, 3000));
                    return this._fetchBatch(categories, currentQuestions, attempt + 1);
                }
                return null;
            }

            const data = await response.json();

            // NEW: Use server-parsed questions when available
            if (data.questions && typeof data.questions === 'object') {
                return data.questions;
            }

            // FALLBACK: Client-side parsing with full recovery chain
            const text = data.text || '';
            const parsed = this.parseGeminiResponseText(text);
            return parsed ? parsed.questions : null;
        } catch (err) {
            console.error('[AI-SBMM] Batch request failed (' + categories.join(',') + '):', err);
            return null;
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

    /**
     * Extract a question board object from raw Gemini text.
     * Returns { questions, usedRepair } or null if all recovery fails.
     */
    parseGeminiResponseText(text) {
        let newQuestions = null;
        let usedRepair = false;

        // 1) Try normal extraction + parse
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/) || [null, text];
        let jsonStr = jsonMatch[1].trim();

        try {
            newQuestions = JSON.parse(jsonStr);
        } catch (err) {
            console.warn('[AI-SBMM] Initial JSON parse failed, attempting repair...');
        }

        // 2) Repair truncated JSON — close open strings / objects / arrays
        if (!newQuestions) {
            const repaired = this._repairTruncatedJson(jsonStr);
            if (repaired) {
                try {
                    newQuestions = JSON.parse(repaired);
                    usedRepair = true;
                    console.log('[AI-SBMM] Repaired truncated JSON successfully');
                } catch (err2) {
                    console.warn('[AI-SBMM] JSON repair failed:', err2.message);
                }
            }
        }

        // 3) Last resort: regex-extract every complete entry and rebuild partial board
        if (!newQuestions) {
            const extracted = this._extractPartialQuestions(jsonStr);
            if (extracted && Object.keys(extracted).length > 0) {
                newQuestions = extracted;
                usedRepair = true;
                console.log('[AI-SBMM] Extracted partial questions via regex');
            }
        }

        if (!newQuestions) return null;
        return { questions: newQuestions, usedRepair };
    },

    applyGeminiResponse(text, requestedLevel = this.difficultyLevel) {
        const parsed = this.parseGeminiResponseText(text);
        if (!parsed) {
            console.error('[AI-SBMM] Failed to parse Gemini response — all recovery attempts exhausted');
            this.logEvent('Gemini update failed — keeping current board', 'system');
            this._indicatorFail();
            return;
        }

        const result = this._applyQuestionSet(parsed.questions);

        // Cache the generated questions so we don't hit Gemini again
        // when the player oscillates between difficulty levels.
        if (result && result.replaced > 0) {
            this.generatedQuestions[requestedLevel] = JSON.parse(JSON.stringify(parsed.questions));
        }

        if (parsed.usedRepair) {
            this.logEvent('Gemini returned partial data — applied ' + result.replaced + ' recovered clues', 'system');
        }
        this._indicatorSuccess();
    },

    _repairTruncatedJson(str) {
        if (!str || !str.trim()) return null;
        let s = str.trim();
        let inString = false;
        let escape = false;
        const stack = [];
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (inString) {
                if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === '{' || ch === '[') {
                stack.push(ch);
                continue;
            }
            if (ch === '}') {
                if (stack.length && stack[stack.length - 1] === '{') stack.pop();
                continue;
            }
            if (ch === ']') {
                if (stack.length && stack[stack.length - 1] === '[') stack.pop();
                continue;
            }
        }
        if (inString) s += '"';
        while (stack.length) {
            const opener = stack.pop();
            s += (opener === '{') ? '}' : ']';
        }
        // Strip trailing comma before closure
        s = s.replace(/,\s*([}\]])/g, '$1');
        try {
            JSON.parse(s);
            return s;
        } catch (_) {
            return null;
        }
    },

    _extractPartialQuestions(str) {
        const result = {};
        const categories = ['People', 'Powers', 'Artifacts', 'Media', 'Teams', 'Places'];
        const values = ['$200', '$400', '$600', '$800', '$1000'];
        categories.forEach(c => result[c] = {});
        // Match complete question/answer objects: {"question":"...","answer":["..."]}
        const entryRe = /"\$?\d{3}":\s*\{\s*"question"\s*:\s*"([^"]*)"\s*,\s*"answer"\s*:\s*(\[[^\]]*\])\s*\}/g;
        let m;
        while ((m = entryRe.exec(str)) !== null) {
            const val = m[0].match(/^"(\$\d{3})"/);
            if (!val) continue;
            const valueKey = val[1];
            const question = m[1];
            let answer;
            try {
                answer = JSON.parse(m[2]);
            } catch (_) {
                continue;
            }
            if (!question || !Array.isArray(answer) || answer.length === 0) continue;
            // Find which category this value belongs to by looking backward in the string
            const before = str.slice(0, m.index);
            const catMatch = before.match(/"(People|Powers|Artifacts|Media|Teams|Places)"\s*:\s*\{[^}]*$/);
            const cat = catMatch ? catMatch[1] : null;
            if (cat && result[cat] && values.includes(valueKey)) {
                result[cat][valueKey] = { question, answer };
            }
        }
        return result;
    },

    // ========================================
    // REAL-TIME SCORING LOG  (console-based)
    // Press Ctrl+S in-game to print a full snapshot.
    // ========================================

    logEvent(message, type = 'system') {
        // Store in memory ring-buffer
        this.logEntries.unshift({ message, type, time: Date.now() });
        if (this.logEntries.length > this.logMaxEntries) {
            this.logEntries.length = this.logMaxEntries;
        }

        // Write to console with colour-coded prefix
        const css = {
            correct:    'color:#00cc66;font-weight:bold',
            wrong:      'color:#ff4444;font-weight:bold',
            timeout:    'color:#ff8800;font-weight:bold',
            difficulty: 'color:#ffaa00;font-weight:bold',
            system:     'color:#888;font-style:italic',
        }[type] || 'color:#ccc';
        console.log(`%c[AI-SBMM] ${message}`, css);
    },

    // no-op stubs so callers don't need to change
    updateScoreLog() {},
    injectScoreLog()  {},

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
        // keep CSS class name consistent (tab card uses same id)
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
        this.generatedQuestions = { 2: null, 3: null };
        this.difficultyChangeCount = 0;
        this.difficultyHistory = [];
        this.answersSinceDifficultyChange = 0;
        this.logEntries = [];
        this.logEvent('New game started — Difficulty reset to Normal', 'system');
        console.log('[AI-SBMM] Reset for new game — Difficulty: 1');
        // Clear the community training pick log for the new match
        if (typeof CommTraining !== 'undefined') CommTraining.clearMatchLog();
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AISBMM.init());
} else {
    AISBMM.init();
}
