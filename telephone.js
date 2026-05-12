/*
============================================================
 MARVEL JEOPARDY - TELEPHONE MINIGAME
 Pre-game word-chain for 5-8 players to decide turn order.

 Flow:
   1. Host calls Telephone.start() → picks seed word + shuffled
      player order → writes to Firebase via MultiplayerManager
   2. Each player's turn: they see the previous player's word
      and must enter a synonym within 10 seconds
   3. Host calls Gemini to score every (given → response) pair
   4. Players ranked by score (ties broken by speed)
   5. Highest scorer goes first in the Jeopardy game
============================================================
*/

// Helper: Firebase may return stored arrays as plain objects {"0":v,"1":v,...}; normalise to a real array.
function _toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.keys(val).sort((a, b) => +a - +b).map(k => val[k]);
}

const Telephone = {

    // ── Word bank ──────────────────────────────────────────────────────────
    WORDS: [
        'cat', 'fish', 'fire', 'tree', 'ocean', 'hero', 'star', 'rock',
        'king', 'bird', 'moon', 'snow', 'rain', 'gold', 'fast', 'dark',
        'warm', 'blue', 'jump', 'loud', 'sword', 'iron', 'storm', 'cloud',
        'wolf', 'bear', 'mountain', 'river', 'desert', 'forest',
        'grandma', 'mirror', 'castle', 'shadow', 'thunder', 'lightning',
        'diamond', 'crystal', 'flame', 'arrow', 'shield', 'crown',
        'galaxy', 'portal', 'warrior', 'legend', 'chaos', 'destiny'
    ],

    // ── Internal state ─────────────────────────────────────────────────────
    _submitCallback: null,
    _timerInterval: null,
    _hostTimeoutId: null,
    _scoringInProgress: false,
    _lastTelStageHandled: null,
    _myPlayerNumber: null,
    _isHost: false,
    _injected: false,
    _myTurnActive: false,

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Call once per page load to inject overlay HTML.
     */
    injectOverlay() {
        if (this._injected) return;
        this._injected = true;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
<div class="question-overlay telephone-overlay" id="telephoneOverlay" style="display:none;">
    <div class="question-card telephone-card">

        <!-- Waiting for game to initialise -->
        <div id="telWaiting" style="display:none;">
            <h2 class="guess-title tel-heading">Telephone!</h2>
            <p id="telWaitingMsg" class="guess-instructions tel-waiting-msg">Waiting...</p>
            <div class="preloader-spinner" style="margin:24px auto;"></div>
        </div>

        <!-- Active input turn -->
        <div id="telInput" style="display:none;">
            <h2 class="guess-title tel-heading">Your Turn!</h2>
            <p class="guess-instructions" style="margin-bottom:6px;">The word is:</p>
            <div class="telephone-word" id="telWord">—</div>
            <p class="guess-instructions tel-hint">Give a word that means the same thing!</p>
            <div class="telephone-timer-wrap">
                <div class="telephone-timer" id="telTimer">10</div>
                <svg class="timer-ring" viewBox="0 0 54 54">
                    <circle class="timer-ring-bg" cx="27" cy="27" r="24"/>
                    <circle class="timer-ring-fill" id="telTimerRing" cx="27" cy="27" r="24"
                            stroke-dasharray="150.796" stroke-dashoffset="0"/>
                </svg>
            </div>
            <form id="telForm" class="guess-form" autocomplete="off">
                <input type="text" id="telAnswer" class="question-input"
                       placeholder="Type your synonym…" maxlength="40" autocomplete="off" spellcheck="false">
                <button type="submit" class="submit-btn tel-submit-btn">Submit</button>
            </form>
        </div>

        <!-- Scoring in progress (shown to all while host calls Gemini) -->
        <div id="telScoring" style="display:none;">
            <h2 class="guess-title tel-heading">Scoring...</h2>
            <p class="guess-instructions">Consulting the multiverse…</p>
            <div class="preloader-spinner" style="margin:24px auto;"></div>
        </div>

        <!-- Results -->
        <div id="telResults" style="display:none;">
            <h2 class="guess-title tel-heading">Results!</h2>
            <p class="guess-instructions tel-results-sub">Turn order has been decided.</p>
            <div id="telResultsList" class="telephone-results-list"></div>
            <div id="telHostControls" style="display:none; margin-top:20px;">
                <button class="submit-btn" id="telStartBtn">Start Game!</button>
            </div>
            <div id="telGuestWait" style="display:none; margin-top:20px;">
                <p class="guess-instructions" style="color:#888;">Waiting for host…</p>
                <div class="preloader-spinner" style="margin:10px auto;"></div>
            </div>
        </div>

    </div>
</div>

<!-- "No… I don't think so…" modal (appended separately) -->
`;
        document.body.appendChild(wrapper.firstElementChild);

        // Form submit handler
        document.getElementById('telForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const word = document.getElementById('telAnswer').value.trim();
            if (word && this._submitCallback) {
                this._submitCallback(word);
            }
        });

        // Host start button
        document.getElementById('telStartBtn').addEventListener('click', async () => {
            document.getElementById('telStartBtn').disabled = true;
            await MultiplayerManager.completeTelephone();
        });
    },

    /**
     * Host calls this once (from the game page) to kick off the round.
     * @param {number} playerCount
     * @param {number} myPlayerNumber
     * @param {boolean} isHost
     * @param {boolean} [debugMode=false]  - auto-fill bots for slots 2+
     */
    async start(playerCount, myPlayerNumber, isHost, debugMode = false) {
        this._myPlayerNumber = myPlayerNumber;
        this._isHost = isHost;

        // Pick seed word
        const seedWord = this.WORDS[Math.floor(Math.random() * this.WORDS.length)];

        // Build shuffled player order
        const order = [];
        for (let i = 1; i <= playerCount; i++) order.push(i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        await MultiplayerManager.initTelephone(playerCount, seedWord, order);

        if (debugMode) {
            // In debug mode, auto-play bot slots (everyone except player 1)
            this._scheduleBots(order, myPlayerNumber);
        }
    },

    /**
     * Main state handler — call every time gameState.telephone changes.
     */
    onStateUpdate(telState, gameState, myPlayerNumber, isHost) {
        if (!telState || !telState.stage) return;
        this._myPlayerNumber = myPlayerNumber;
        this._isHost = isHost;

        this._show();

        switch (telState.stage) {
            case 'waiting':
                this._section('telWaiting');
                this._setText('telWaitingMsg', 'Waiting for host to start…');
                break;

            case 'asking':
                this._handleAsking(telState, gameState, myPlayerNumber, isHost);
                break;

            case 'scoring':
                this._section('telScoring');
                break;

            case 'results':
                this._showResults(telState, gameState, myPlayerNumber, isHost);
                break;

            case 'done':
                this._stopTimer();
                this._hide();
                break;
        }
    },

    // ── Private helpers ────────────────────────────────────────────────────

    _handleAsking(telState, gameState, myPlayerNumber, isHost) {
        const playerOrder = _toArray(telState.playerOrder);
        const currentIndex = telState.currentIndex ?? 0;

        // Guard: all submitted? Host should score.
        if (isHost && !this._scoringInProgress) {
            const allDone = playerOrder.length > 0 && playerOrder.every(pn =>
                telState.submittedWords && telState.submittedWords[pn] !== undefined
            );
            if (allDone) {
                this._scoreAll(telState, gameState);
                return;
            }
        }

        const currentPlayerNum = playerOrder[currentIndex];
        if (currentPlayerNum === undefined) return;

        const alreadySubmitted =
            telState.submittedWords && telState.submittedWords[myPlayerNumber] !== undefined;

        if (currentPlayerNum === myPlayerNumber && !alreadySubmitted) {
            // It's MY active turn
            const wordShown = (telState.shownWords && telState.shownWords[myPlayerNumber]) || telState.seedWord;
            this._showMyTurn(wordShown, myPlayerNumber);
        } else {
            // Waiting
            this._section('telWaiting');
            if (alreadySubmitted) {
                this._setText('telWaitingMsg', 'Your answer is in — waiting for others…');
            } else {
                const name = (gameState.playerNames && gameState.playerNames[currentPlayerNum])
                    || `Player ${currentPlayerNum}`;
                this._setText('telWaitingMsg', `${name} is thinking…`);
            }

            // Host: watch for missing submission and advance when done
            if (isHost) {
                this._watchCurrentPlayer(telState, currentPlayerNum, currentIndex);
            }
        }
    },

    _showMyTurn(wordShown, myPlayerNumber) {
        // Guard: if already showing the input, don't reset it (prevents clearing mid-type)
        if (this._myTurnActive) return;
        this._myTurnActive = true;

        this._stopTimer();
        this._section('telInput');
        document.getElementById('telWord').textContent = wordShown.toUpperCase();
        const answerEl = document.getElementById('telAnswer');
        answerEl.value = '';
        answerEl.focus();

        const startTime = Date.now();

        this._submitCallback = async (word) => {
            this._myTurnActive = false;
            this._submitCallback = null;
            this._stopTimer();
            const elapsed = (Date.now() - startTime) / 1000;
            await MultiplayerManager.submitTelephoneWord(myPlayerNumber, word, elapsed);
            this._section('telWaiting');
            this._setText('telWaitingMsg', 'Your answer is in — waiting for others…');
        };

        // Start 10-second countdown
        let secs = 10;
        const timerEl = document.getElementById('telTimer');
        const ringEl = document.getElementById('telTimerRing');
        const circumference = 150.796;

        const tick = () => {
            secs--;
            if (timerEl) {
                timerEl.textContent = secs;
                timerEl.className = 'telephone-timer' + (secs <= 3 ? ' urgent' : '');
            }
            if (ringEl) {
                const offset = circumference * (1 - secs / 10);
                ringEl.style.strokeDashoffset = offset;
            }
            if (secs <= 0) {
                this._stopTimer();
                this._myTurnActive = false;
                // Auto-timeout
                if (this._submitCallback) {
                    this._submitCallback = null;
                    MultiplayerManager.submitTelephoneWord(myPlayerNumber, null, 10.0);
                    this._section('telWaiting');
                    this._setText('telWaitingMsg', "Time's up! Waiting for others…");
                }
            }
        };

        this._timerInterval = setInterval(tick, 1000);
    },

    // Host: if current player hasn't submitted within ~12s, force-submit null
    _watchCurrentPlayer(telState, currentPlayerNum, currentIndex) {
        if (this._hostTimeoutId) clearTimeout(this._hostTimeoutId);
        if (telState.submittedWords && telState.submittedWords[currentPlayerNum] !== undefined) {
            // Already submitted — advance if not last
            const playerOrder = _toArray(telState.playerOrder);
            if (currentIndex < playerOrder.length - 1) {
                const nextPlayer = playerOrder[currentIndex + 1];
                const lastWord = telState.submittedWords[currentPlayerNum];
                const actualWord = (lastWord === '__timeout__' || !lastWord)
                    ? telState.shownWords[currentPlayerNum]
                    : lastWord;
                MultiplayerManager.advanceTelephone(currentIndex + 1, nextPlayer, actualWord);
            }
            return;
        }

        this._hostTimeoutId = setTimeout(async () => {
            const snap = await MultiplayerManager.roomRef
                .child('gameState/telephone')
                .once('value');
            const fresh = snap.val();
            if (fresh && fresh.submittedWords && fresh.submittedWords[currentPlayerNum] === undefined) {
                await MultiplayerManager.submitTelephoneWord(currentPlayerNum, null, 10.0);
            }
        }, 12000);
    },

    // Host: score all submissions via Gemini
    async _scoreAll(telState, gameState) {
        if (this._scoringInProgress) return;
        this._scoringInProgress = true;

        await MultiplayerManager.setTelephoneStage('scoring');

        const playerOrder = _toArray(telState.playerOrder);
        const pairs = playerOrder.map(pn => ({
            playerNumber: pn,
            given: (telState.shownWords && telState.shownWords[pn]) || telState.seedWord,
            response: (telState.submittedWords && telState.submittedWords[pn] !== '__timeout__')
                ? (telState.submittedWords[pn] || null)
                : null
        }));

        let scores = {};

        try {
            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'telephone', pairs })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            let rawArr = data.scores;

            if (!Array.isArray(rawArr)) {
                try { rawArr = JSON.parse(data.text || '[]'); } catch (_) { rawArr = []; }
            }

            pairs.forEach((pair, i) => {
                const raw = rawArr[i] !== undefined ? Number(rawArr[i]) : 0;
                scores[pair.playerNumber] = pair.response === null
                    ? 0
                    : Math.max(0, Math.min(100, Math.round(raw)));
            });
        } catch (err) {
            console.warn('[Telephone] Gemini scoring failed, using random fallback:', err);
            pairs.forEach(pair => { scores[pair.playerNumber] = Math.floor(Math.random() * 60) + 20; });
        }

        // Sort: highest score first; ties won by fastest response
        const times = telState.times || {};
        const finalOrder = [...playerOrder].sort((a, b) => {
            if (scores[b] !== scores[a]) return scores[b] - scores[a];
            return (times[a] ?? 10) - (times[b] ?? 10);
        });

        try {
            await MultiplayerManager.setTelephoneResults(scores, finalOrder);
        } finally {
            this._scoringInProgress = false;
        }
    },

    _showResults(telState, gameState, myPlayerNumber, isHost) {
        this._section('telResults');
        this._stopTimer();

        const finalOrder = _toArray(telState.finalOrder);
        const names = gameState.playerNames || {};
        const scores = telState.scores || {};
        const submitted = telState.submittedWords || {};
        const shown = telState.shownWords || {};

        const listEl = document.getElementById('telResultsList');
        listEl.innerHTML = '';

        const RANK_LABEL = ['1st', '2nd', '3rd'];

        finalOrder.forEach((pn, idx) => {
            const score = scores[pn] ?? 0;
            const isMe = pn === myPlayerNumber;
            const rawWord = submitted[pn];
            const isTimeout = rawWord === '__timeout__' || rawWord === null || rawWord === undefined;
            const word = isTimeout ? null : rawWord;
            const givenWord = shown[pn] || telState.seedWord || '?';

            const div = document.createElement('div');
            div.className = 'telephone-result-item' + (isMe ? ' result-me' : '');

            const badge = idx < 3
                ? `<span class="result-rank-num rank-top">${RANK_LABEL[idx]}</span>`
                : `<span class="result-rank-num">#${idx + 1}</span>`;

            div.innerHTML = `
                <span class="result-medal">${badge}</span>
                <div class="result-detail">
                    <span class="result-name">${_escapeHtml(names[pn] || `Player ${pn}`)}</span>
                    <span class="result-chain">"${_escapeHtml(givenWord)}" → "${word ? _escapeHtml(word) : '???'}"</span>
                </div>
                <span class="result-score-badge">${score}/100</span>
            `;
            listEl.appendChild(div);

            // "no… i don't think so…" for this player if they timed out or scored very low
            if (isMe && (score <= 8 || isTimeout)) {
                setTimeout(() => this._showNoModal(), 600);
            }
        });

        if (isHost) {
            document.getElementById('telHostControls').style.display = 'block';
            document.getElementById('telGuestWait').style.display = 'none';
        } else {
            document.getElementById('telHostControls').style.display = 'none';
            document.getElementById('telGuestWait').style.display = 'block';
        }
    },

    _showNoModal() {
        const existing = document.getElementById('telNoModal');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'telNoModal';
        div.className = 'question-overlay';
        div.style.cssText = 'display:flex; z-index:200000;';
        div.innerHTML = `
            <div class="question-card tel-no-modal-card">
                <h2 class="guess-title tel-no-modal-heading">
                    No... I don&rsquo;t think so...
                </h2>
                <p class="guess-instructions" style="margin:16px 0;">
                    That response didn&rsquo;t quite make the cut. Better luck in the actual game!
                </p>
                <button class="submit-btn" onclick="document.getElementById('telNoModal').remove()">
                    Fair enough
                </button>
            </div>`;
        document.body.appendChild(div);
    },

    // Debug mode: auto-play all "bot" player slots (any slot ≠ real host = player 1)
    _scheduleBots(playerOrder, realPlayerNum) {
        playerOrder.forEach((pn, idx) => {
            if (pn === realPlayerNum) return; // real player handles their own turn

            // Stagger bot submissions so they appear to wait their turn
            const delayMs = idx * 2500 + 1500 + Math.random() * 500;

            setTimeout(async () => {
                // Check if this bot should submit (only when it's their turn in Firebase)
                const snap = await MultiplayerManager.roomRef
                    .child('gameState/telephone')
                    .once('value');
                const telState = snap.val();
                if (!telState || telState.submittedWords?.[pn] !== undefined) return; // already done or game changed

                const botWord = this.WORDS[Math.floor(Math.random() * this.WORDS.length)];
                await MultiplayerManager.submitTelephoneWord(pn, botWord, 1.0 + Math.random() * 3);
            }, delayMs);
        });
    },

    // ── UI helpers ─────────────────────────────────────────────────────────

    _show() {
        const el = document.getElementById('telephoneOverlay');
        if (el) el.style.display = 'flex';
    },

    _hide() {
        this._myTurnActive = false;
        const el = document.getElementById('telephoneOverlay');
        if (el) el.style.display = 'none';
    },

    _section(id) {
        ['telWaiting', 'telInput', 'telScoring', 'telResults'].forEach(s => {
            const el = document.getElementById(s);
            if (el) el.style.display = s === id ? 'block' : 'none';
        });
    },

    _setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
        if (this._hostTimeoutId) {
            clearTimeout(this._hostTimeoutId);
            this._hostTimeoutId = null;
        }
    }
};

// Tiny helper used inside results rendering (mirrors lobby escapeHtml)
function _escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

window.Telephone = Telephone;
