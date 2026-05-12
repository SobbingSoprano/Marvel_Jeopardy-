/*
============================================================
 MARVEL JEOPARDY - COMMUNITY TRAINING
 Aggregates anonymised match interaction data via Firebase
 and nudges AI-SBMM scoring weights as the community plays.

 Data collected per completed match (only when opted in):
   • Category picked at each board position
   • Point value picked at each board position
   • Whether each answer was correct
   • Whether the pick was in the first or second half of the match

 NO personally-identifiable information is ever stored.
 Data is only submitted for fully completed matches
 (all 30 cards cleared → Final Jeopardy → winner declared).
============================================================
*/

const CommTraining = {
    enabled: false,

    // Cached community weights (recomputed from Firebase aggregate stats).
    // null = not yet loaded, or insufficient data (<5 matches in pool).
    weights: null,
    weightsFetchedAt: 0,
    weightsCacheTtl: 5 * 60 * 1000,  // 5 minutes

    // Per-match pick log — persisted in sessionStorage so it
    // survives the page transition to final_jeopardy.html.
    matchLog: { picks: [] },

    // Lazily-initialised Firebase Database reference.
    _db: null,
    DB_PATH: 'community_training',

    // =========================================================
    // INIT & TOGGLE
    // =========================================================

    init() {
        this.enabled = localStorage.getItem('mj_ct_enabled') === '1';
        this._loadMatchLog();

        // Sync CT button visibility once both AISBMM and the DOM are ready.
        // community-training.js always loads after ai-sbmm.js, so AISBMM is
        // defined before this runs. Both are deferred to DOMContentLoaded so
        // we can safely read AISBMM.enabled and query the DOM here.
        this._syncVisibility();

        if (this.enabled) {
            this._tryFetchWeights();
            console.log('%c[CommTraining] Community Training active — pooling match data for SBMM weight nudges.', 'color:#00aaff');
        } else {
            console.log('%c[CommTraining] Community Training inactive. Toggle on index page to opt in.', 'color:#555');
        }
    },

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('mj_ct_enabled', this.enabled ? '1' : '0');
        if (this.enabled) {
            this._tryFetchWeights();
            console.log('%c[CommTraining] Enabled — community pool will nudge SBMM weights.', 'color:#00aaff');
        } else {
            console.log('%c[CommTraining] Disabled.', 'color:#555');
        }
        this.updateToggleButton();
        return this.enabled;
    },

    // Called by AISBMM when AI-SBMM itself is disabled
    // (CT requires SBMM — if SBMM goes off, CT follows).
    disableWithSbmm() {
        if (!this.enabled) return;
        this.enabled = false;
        localStorage.setItem('mj_ct_enabled', '0');
        console.log('%c[CommTraining] Auto-disabled (AI-SBMM turned off).', 'color:#555');
        this.updateToggleButton();
    },

    // =========================================================
    // FIREBASE
    // =========================================================

    _ensureFirebase() {
        if (this._db) return true;
        if (typeof firebase === 'undefined') return false;
        if (typeof isFirebaseConfigured === 'undefined' || !isFirebaseConfigured()) return false;
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        this._db = firebase.database();
        return true;
    },

    // Try sessionStorage cache first; fall back to a live Firebase fetch.
    _tryFetchWeights() {
        const cached = sessionStorage.getItem('mj_ct_weights');
        if (cached) {
            try {
                const { weights, fetchedAt } = JSON.parse(cached);
                if ((Date.now() - fetchedAt) < this.weightsCacheTtl) {
                    this.weights   = weights;
                    this.weightsFetchedAt = fetchedAt;
                    return;   // served from cache — no network trip needed
                }
            } catch (_) { /* corrupt cache — fall through */ }
        }
        this.fetchWeights();
    },

    async fetchWeights() {
        if (!this._ensureFirebase()) return;
        try {
            const snap = await this._db.ref(this.DB_PATH + '/stats').once('value');
            const data = snap.val();
            if (data) {
                this.weights          = this._computeWeights(data);
                this.weightsFetchedAt = Date.now();
                // Push to sessionStorage so game pages can apply weights
                // without needing the Firebase SDK themselves.
                sessionStorage.setItem('mj_ct_weights', JSON.stringify({
                    weights:   this.weights,
                    fetchedAt: this.weightsFetchedAt,
                }));
                const mc = data.matchCount || 0;
                console.log(`[CommTraining] Weights loaded (${mc} match${mc !== 1 ? 'es' : ''} in community pool)`);
            }
        } catch (err) {
            console.warn('[CommTraining] Failed to fetch weights:', err);
        }
    },

    // Build category/value modifier tables from raw Firebase stats.
    _computeWeights(data) {
        const { categories = {}, values = {}, matchCount = 0 } = data;

        // Need at least 5 finished matches before the numbers are meaningful.
        if (matchCount < 5) return null;

        const catMods = {};
        const valMods = {};

        // Helper: given a raw stats table, compute pick/miss modifiers per key.
        // Modifier range is deliberately small (±0.20 max) so community data
        // nudges the scoring rather than dominating it.
        const buildMods = (table, mods) => {
            const entries = Object.entries(table);
            if (!entries.length) return;

            const avgPicks = entries.reduce((s, [, v]) => s + (v.totalPicks || 0), 0) / entries.length;
            const avgMiss  = entries.reduce((s, [, v]) => {
                const n = v.total || 0;
                return s + (n > 0 ? (n - (v.correct || 0)) / n : 0);
            }, 0) / entries.length;

            entries.forEach(([key, v]) => {
                const pickRatio = avgPicks > 0 ? (v.totalPicks || 0) / avgPicks : 1;
                const myMiss    = (v.total || 0) > 0
                    ? ((v.total - (v.correct || 0)) / v.total)
                    : avgMiss;
                const missRatio = avgMiss > 0 ? myMiss / avgMiss : 1;

                // Popular pick (ratio > 1) → slight reduction on correct points reward.
                // Rare pick   (ratio < 1) → slight bonus.  Cap: ±0.20.
                const pickMod = Math.max(-0.20, Math.min(0.20, (1 - pickRatio) * 0.15));

                // Commonly missed  → lighter penalty  (already hard enough).
                // Rarely missed    → heavier penalty  (players should know this).
                const missMod = Math.max(-0.20, Math.min(0.20, (1 - missRatio) * 0.15));

                mods[key] = { pickMod, missMod };
            });
        };

        buildMods(categories, catMods);
        buildMods(values,     valMods);
        return { catMods, valMods };
    },

    // =========================================================
    // SCORE MODIFIER — called by ai-sbmm.js
    // =========================================================

    // Returns a multiplier close to 1.0 applied to the raw SBMM delta.
    //   isCorrect = true  → uses pickMod (rewards rarer category picks more)
    //   isCorrect = false → uses missMod (eases penalty on commonly-missed Qs)
    getScoreModifier(category, value, isCorrect) {
        if (!this.enabled || !this.weights) return 1.0;

        const { catMods, valMods } = this.weights;
        const vKey = (value    || '').replace('$', '');              // "$200" → "200"
        const cKey = (category || '').replace(/[.#$[\]]/g, '_');    // sanitise for lookup

        const catW = catMods[cKey] || { pickMod: 0, missMod: 0 };
        const valW = valMods[vKey] || { pickMod: 0, missMod: 0 };

        // Average category and value modifiers; clamp total to ±0.20.
        const raw = isCorrect
            ? (catW.pickMod + valW.pickMod) / 2
            : (catW.missMod + valW.missMod) / 2;

        return 1.0 + Math.max(-0.20, Math.min(0.20, raw));
    },

    // =========================================================
    // MATCH LOGGING
    // =========================================================

    _loadMatchLog() {
        const saved = sessionStorage.getItem('mj_ct_matchlog');
        this.matchLog = saved ? JSON.parse(saved) : { picks: [] };
    },

    _saveMatchLog() {
        sessionStorage.setItem('mj_ct_matchlog', JSON.stringify(this.matchLog));
    },

    clearMatchLog() {
        this.matchLog = { picks: [] };
        sessionStorage.removeItem('mj_ct_matchlog');
    },

    // Called from AISBMM.recordAnswer / recordNoAnswer.
    // pickIndex = 1-based position in the match (1 = first card picked).
    logPick(category, value, pickIndex, isCorrect) {
        if (!this.enabled) return;
        const isEarly = pickIndex <= 15;   // first half of 30-card board
        this.matchLog.picks.push({ category, value, pickIndex, isEarly, isCorrect });
        this._saveMatchLog();
    },

    // =========================================================
    // FIREBASE WRITE — submit after a completed match
    // Called from final_jeopardy.html / final_jeopardy_mp.html
    // when the results screen is shown (winner determined).
    // =========================================================

    async submitMatchData() {
        if (!this.enabled) return;
        if (!this._ensureFirebase()) return;

        const picks = this.matchLog.picks;
        if (!picks.length) return;

        try {
            const statsRef = this._db.ref(this.DB_PATH + '/stats');
            const inc      = firebase.database.ServerValue.increment;
            const updates  = {};

            picks.forEach(({ category, value, isEarly, isCorrect }) => {
                // Sanitise keys for Firebase (no .$[]# characters)
                const cKey = (category || '').replace(/[.#$[\]]/g, '_');
                const vKey = (value    || '').replace('$', '');    // "$200" → "200"

                const cb = `categories/${cKey}`;
                const vb = `values/${vKey}`;

                updates[`${cb}/totalPicks`] = inc(1);
                updates[`${vb}/totalPicks`] = inc(1);
                updates[`${cb}/total`]      = inc(1);
                updates[`${vb}/total`]      = inc(1);

                if (isEarly) {
                    updates[`${cb}/earlyPicks`] = inc(1);
                    updates[`${vb}/earlyPicks`] = inc(1);
                }
                if (isCorrect) {
                    updates[`${cb}/correct`] = inc(1);
                    updates[`${vb}/correct`] = inc(1);
                }
            });

            updates['matchCount'] = inc(1);

            await statsRef.update(updates);
            console.log(`[CommTraining] Match data submitted — ${picks.length} interactions recorded`);

            // Clear log and invalidate weight cache so the next session
            // fetches fresh weights reflecting this match.
            this.clearMatchLog();
            this.weightsFetchedAt = 0;
            sessionStorage.removeItem('mj_ct_weights');
        } catch (err) {
            console.warn('[CommTraining] Failed to submit match data:', err);
        }
    },

    // =========================================================
    // UI
    // =========================================================

    // Mirror SBMM's active state onto the CT button visibility.
    setSbmmActive(active) {
        const el = document.getElementById('ct-toggle');
        if (!el) return;
        el.classList.toggle('ct-visible', active);
        // If SBMM is turned off, automatically opt out of CT too.
        if (!active && this.enabled) this.disableWithSbmm();
    },

    // Sync CT button visibility with the current SBMM state at page load.
    _syncVisibility() {
        const sbmmActive = typeof AISBMM !== 'undefined' && AISBMM.enabled;
        const el = document.getElementById('ct-toggle');
        if (el) el.classList.toggle('ct-visible', sbmmActive);
        if (!sbmmActive && this.enabled) this.disableWithSbmm();
    },

    updateToggleButton() {
        const btn = document.getElementById('ctBtn');
        if (btn) btn.classList.toggle('active', this.enabled);
    },
};

// Auto-init when DOM is ready (same pattern as AISBMM).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CommTraining.init());
} else {
    CommTraining.init();
}
