/*
============================================================
 MARVEL JEOPARDY - MULTIPLAYER MANAGER
 Real-time multiplayer using Firebase Realtime Database
============================================================
*/

// Multiplayer state
const MultiplayerManager = {
    db: null,
    roomRef: null,
    roomCode: null,
    playerId: null,
    playerNumber: null,
    isHost: false,
    gameRef: null,
    listeners: [],
    onStateChange: null,
    onPlayerJoin: null,
    onPlayerLeave: null,
    onGameStart: null,
    onError: null,

    // Initialize Firebase
    init() {
        if (!isFirebaseConfigured()) {
            console.error('Firebase not configured. Please update firebase-config.js');
            return false;
        }

        // Initialize Firebase app if not already done
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        this.db = firebase.database();
        this.playerId = this.generatePlayerId();
        
        // Store player ID in session
        sessionStorage.setItem('mp_playerId', this.playerId);
        
        return true;
    },

    // Generate unique player ID
    generatePlayerId() {
        const stored = sessionStorage.getItem('mp_playerId');
        if (stored) return stored;
        return 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    },

    // Generate room code
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },

    // Create a new game room
    async createRoom(playerCount, playerName) {
        if (!this.db) {
            if (!this.init()) return null;
        }

        this.roomCode = this.generateRoomCode();
        this.isHost = true;
        this.playerNumber = 1;

        const roomData = {
            code: this.roomCode,
            hostId: this.playerId,
            playerCount: playerCount,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            status: 'waiting', // waiting, playing, finished
            players: {
                1: {
                    id: this.playerId,
                    name: playerName,
                    connected: true,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                }
            },
            gameState: {
                playerNames: { 1: playerName },
                playerScores: this.initScores(playerCount),
                usedCells: [],
                dailyDouble: this.generateDailyDouble(),
                currentTurn: 1,
                gameStarted: false,
                targetNumber: Math.floor(Math.random() * 50) + 1,
                guesses: {},
                currentQuestion: null,
                dailyDoubleWager: null,
                feedback: null,
                audioState: 'overtime' // Synced audio state: 'match' or 'overtime'
            }
        };

        // Initialize player names for all slots
        for (let i = 2; i <= playerCount; i++) {
            roomData.gameState.playerNames[i] = `Player ${i}`;
        }

        try {
            this.roomRef = this.db.ref('rooms/' + this.roomCode);
            await this.roomRef.set(roomData);
            
            // Set up disconnect handling
            this.setupDisconnectHandling();
            
            // Listen for room changes
            this.setupRoomListeners();
            
            // Store room info
            sessionStorage.setItem('mp_roomCode', this.roomCode);
            sessionStorage.setItem('mp_playerNumber', '1');
            sessionStorage.setItem('mp_isHost', 'true');
            
            return this.roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            if (this.onError) this.onError(error.message);
            return null;
        }
    },

    // Join an existing room
    async joinRoom(roomCode, playerName) {
        if (!this.db) {
            if (!this.init()) return null;
        }

        this.roomCode = roomCode.toUpperCase();
        this.isHost = false;

        try {
            this.roomRef = this.db.ref('rooms/' + this.roomCode);
            const snapshot = await this.roomRef.once('value');
            
            if (!snapshot.exists()) {
                throw new Error('Room not found');
            }

            const roomData = snapshot.val();

            if (roomData.status !== 'waiting') {
                throw new Error('Game already in progress');
            }

            // Find available player slot
            const players = roomData.players || {};
            let availableSlot = null;
            
            for (let i = 1; i <= roomData.playerCount; i++) {
                if (!players[i] || !players[i].connected) {
                    availableSlot = i;
                    break;
                }
            }

            if (!availableSlot) {
                throw new Error('Room is full');
            }

            this.playerNumber = availableSlot;

            // Join the room
            await this.roomRef.child('players/' + availableSlot).set({
                id: this.playerId,
                name: playerName,
                connected: true,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });

            // Update game state player name
            await this.roomRef.child('gameState/playerNames/' + availableSlot).set(playerName);

            // Set up disconnect handling
            this.setupDisconnectHandling();

            // Listen for room changes
            this.setupRoomListeners();

            // Store room info
            sessionStorage.setItem('mp_roomCode', this.roomCode);
            sessionStorage.setItem('mp_playerNumber', String(availableSlot));
            sessionStorage.setItem('mp_isHost', 'false');

            return {
                roomCode: this.roomCode,
                playerNumber: this.playerNumber,
                playerCount: roomData.playerCount
            };
        } catch (error) {
            console.error('Error joining room:', error);
            if (this.onError) this.onError(error.message);
            return null;
        }
    },

    // Rejoin a room (after page refresh)
    async rejoinRoom() {
        const roomCode = sessionStorage.getItem('mp_roomCode');
        const playerNumber = sessionStorage.getItem('mp_playerNumber');
        const playerId = sessionStorage.getItem('mp_playerId');

        if (!roomCode || !playerNumber || !playerId) {
            return false;
        }

        if (!this.db) {
            if (!this.init()) return false;
        }

        this.roomCode = roomCode;
        this.playerNumber = parseInt(playerNumber);
        this.playerId = playerId;
        this.roomRef = this.db.ref('rooms/' + this.roomCode);

        try {
            const snapshot = await this.roomRef.once('value');
            if (!snapshot.exists()) {
                this.clearSession();
                return false;
            }

            const roomData = snapshot.val();
            this.isHost = roomData.hostId === this.playerId;

            // Update connection status
            await this.roomRef.child('players/' + this.playerNumber).update({
                connected: true,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });

            // Set up disconnect handling
            this.setupDisconnectHandling();

            // Listen for room changes
            this.setupRoomListeners();

            return true;
        } catch (error) {
            console.error('Error rejoining room:', error);
            this.clearSession();
            return false;
        }
    },

    // Set up disconnect handling
    setupDisconnectHandling() {
        if (!this.roomRef || !this.playerNumber) return;

        const playerRef = this.roomRef.child('players/' + this.playerNumber);
        
        // On disconnect, mark as disconnected
        playerRef.onDisconnect().update({
            connected: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Update presence periodically
        this.presenceInterval = setInterval(() => {
            playerRef.update({
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }, 30000);
    },

    // Set up room listeners
    setupRoomListeners() {
        if (!this.roomRef) return;

        // Listen for game state changes
        const gameStateListener = this.roomRef.child('gameState').on('value', (snapshot) => {
            if (snapshot.exists() && this.onStateChange) {
                this.onStateChange(snapshot.val());
            }
        });
        this.listeners.push({ ref: this.roomRef.child('gameState'), event: 'value', callback: gameStateListener });

        // Listen for player changes
        const playersListener = this.roomRef.child('players').on('value', (snapshot) => {
            if (snapshot.exists()) {
                const players = snapshot.val();
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(players);
                }
            }
        });
        this.listeners.push({ ref: this.roomRef.child('players'), event: 'value', callback: playersListener });

        // Listen for room status changes
        const statusListener = this.roomRef.child('status').on('value', (snapshot) => {
            if (snapshot.exists()) {
                const status = snapshot.val();
                if (status === 'playing' && this.onGameStart) {
                    this.onGameStart();
                }
            }
        });
        this.listeners.push({ ref: this.roomRef.child('status'), event: 'value', callback: statusListener });
    },

    // Update game state (host only or specific updates)
    async updateGameState(updates) {
        if (!this.roomRef) return false;

        try {
            await this.roomRef.child('gameState').update(updates);
            return true;
        } catch (error) {
            console.error('Error updating game state:', error);
            return false;
        }
    },

    // Update synced audio state for all players
    async updateAudioState(trackName) {
        if (!this.roomRef) return false;

        try {
            await this.roomRef.child('gameState/audioState').set(trackName);
            return true;
        } catch (error) {
            console.error('Error updating audio state:', error);
            return false;
        }
    },

    // Submit guess (any player)
    async submitGuess(playerNumber, guess) {
        if (!this.roomRef) return false;

        try {
            await this.roomRef.child('gameState/guesses/' + playerNumber).set(guess);
            return true;
        } catch (error) {
            console.error('Error submitting guess:', error);
            return false;
        }
    },

    // Start the game (host only)
    async startGame() {
        if (!this.isHost || !this.roomRef) return false;

        try {
            // Check all players are connected
            const snapshot = await this.roomRef.child('players').once('value');
            const players = snapshot.val();
            const roomSnapshot = await this.roomRef.child('playerCount').once('value');
            const playerCount = roomSnapshot.val();

            let connectedCount = 0;
            for (let i = 1; i <= playerCount; i++) {
                if (players[i] && players[i].connected) {
                    connectedCount++;
                }
            }

            if (connectedCount < playerCount) {
                throw new Error(`Waiting for ${playerCount - connectedCount} more player(s)`);
            }

            // Determine who goes first based on guesses
            const guessesSnapshot = await this.roomRef.child('gameState/guesses').once('value');
            const guesses = guessesSnapshot.val() || {};
            const targetSnapshot = await this.roomRef.child('gameState/targetNumber').once('value');
            const target = targetSnapshot.val();

            let minDiff = Infinity;
            let firstPlayer = 1;

            for (let i = 1; i <= playerCount; i++) {
                if (guesses[i] !== undefined) {
                    const diff = Math.abs(target - guesses[i]);
                    if (diff < minDiff) {
                        minDiff = diff;
                        firstPlayer = i;
                    }
                }
            }

            await this.roomRef.update({
                status: 'playing'
            });

            await this.roomRef.child('gameState').update({
                currentTurn: firstPlayer,
                gameStarted: true,
                audioState: 'match' // Switch to match music when game starts
            });

            return true;
        } catch (error) {
            console.error('Error starting game:', error);
            if (this.onError) this.onError(error.message);
            return false;
        }
    },

    // Select a cell (current player's turn only)
    async selectCell(category, value, isDailyDouble) {
        if (!this.roomRef) return false;
        
        try {
            const updates = {
                category: category,
                value: value,
                isDailyDouble: isDailyDouble,
                questionText: allQuestions[category][value].question,
                answeredBy: null,
                waitingForAnswer: true
            };
            
            await this.roomRef.child('gameState/currentQuestion').set(updates);
            
            // Update audio state for all players if daily double
            if (isDailyDouble) {
                await this.roomRef.child('gameState/audioState').set('overtime');
            }
            
            return true;
        } catch (error) {
            console.error('Error selecting cell:', error);
            return false;
        }
    },

    // Submit Daily Double wager
    async submitDDWager(wager) {
        if (!this.roomRef) return false;

        try {
            await this.roomRef.child('gameState/dailyDoubleWager').set(wager);
            return true;
        } catch (error) {
            console.error('Error submitting wager:', error);
            return false;
        }
    },

    // Submit answer
    async submitAnswer(answer, isCorrect, points, missingPhrasing = false, correctAnswerFormatted = '') {
        if (!this.roomRef) return false;

        try {
            const snapshot = await this.roomRef.child('gameState').once('value');
            const gameState = snapshot.val();
            const currentTurn = gameState.currentTurn;
            const playerCount = Object.keys(gameState.playerNames).length;
            const currentQuestion = gameState.currentQuestion;

            // Calculate new score
            const currentScore = gameState.playerScores[currentTurn] || 0;
            const newScore = isCorrect ? currentScore + points : currentScore - points;

            // Add cell to used cells
            const cellKey = `${currentQuestion.category}|${currentQuestion.value}`;
            const usedCells = gameState.usedCells || [];
            usedCells.push(cellKey);

            // Next turn
            const nextTurn = (currentTurn % playerCount) + 1;

            // Update state
            await this.roomRef.child('gameState').update({
                [`playerScores/${currentTurn}`]: newScore,
                usedCells: usedCells,
                currentTurn: nextTurn,
                currentQuestion: null,
                dailyDoubleWager: null,
                feedback: {
                    isCorrect: isCorrect,
                    correctAnswer: allQuestions[currentQuestion.category][currentQuestion.value].answer[0],
                    correctAnswerFormatted: correctAnswerFormatted || allQuestions[currentQuestion.category][currentQuestion.value].answer[0],
                    userAnswer: answer,
                    points: points,
                    player: currentTurn,
                    missingPhrasing: missingPhrasing
                }
            });

            // Check for game over
            if (usedCells.length >= 30) {
                await this.roomRef.child('gameState/stage').set('final_jeopardy');
            }

            return true;
        } catch (error) {
            console.error('Error submitting answer:', error);
            return false;
        }
    },

    // Clear feedback and resume match music
    async clearFeedback() {
        if (!this.roomRef) return;
        await this.roomRef.child('gameState').update({
            feedback: null,
            audioState: 'match' // Resume match music for all players
        });
    },

    // Final Jeopardy: Submit wager
    async submitFinalWager(playerNumber, wager) {
        if (!this.roomRef) return false;

        try {
            await this.roomRef.child(`gameState/finalWagers/${playerNumber}`).set(wager);
            return true;
        } catch (error) {
            console.error('Error submitting final wager:', error);
            return false;
        }
    },

    // Final Jeopardy: Submit answer
    async submitFinalAnswer(playerNumber, answer) {
        if (!this.roomRef) return false;

        try {
            await this.roomRef.child(`gameState/finalAnswers/${playerNumber}`).set(answer);
            return true;
        } catch (error) {
            console.error('Error submitting final answer:', error);
            return false;
        }
    },

    // Calculate final results (host only)
    async calculateFinalResults() {
        if (!this.isHost || !this.roomRef) return false;

        try {
            const snapshot = await this.roomRef.child('gameState').once('value');
            const gameState = snapshot.val();
            
            const playerCount = Object.keys(gameState.playerNames).length;
            const finalResults = {};

            for (let i = 1; i <= playerCount; i++) {
                const answer = (gameState.finalAnswers?.[i] || '').toLowerCase().trim();
                const wager = gameState.finalWagers?.[i] || 0;
                const isCorrect = finalJeopardyQuestion.answers.some(a => answer === a.toLowerCase());
                
                const currentScore = gameState.playerScores[i] || 0;
                const newScore = isCorrect ? currentScore + wager : currentScore - wager;

                finalResults[i] = {
                    answer: gameState.finalAnswers?.[i] || '',
                    isCorrect: isCorrect,
                    wager: wager,
                    finalScore: newScore
                };

                await this.roomRef.child(`gameState/playerScores/${i}`).set(newScore);
            }

            await this.roomRef.child('gameState/finalResults').set(finalResults);
            await this.roomRef.child('gameState/stage').set('results');
            await this.roomRef.child('status').set('finished');

            return true;
        } catch (error) {
            console.error('Error calculating results:', error);
            return false;
        }
    },

    // Leave room
    async leaveRoom() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
        }

        // Remove listeners
        this.listeners.forEach(({ ref, event, callback }) => {
            ref.off(event, callback);
        });
        this.listeners = [];

        if (this.roomRef && this.playerNumber) {
            await this.roomRef.child('players/' + this.playerNumber).update({
                connected: false
            });
        }

        this.clearSession();
    },

    // Clear session data
    clearSession() {
        sessionStorage.removeItem('mp_roomCode');
        sessionStorage.removeItem('mp_playerNumber');
        sessionStorage.removeItem('mp_isHost');
        this.roomCode = null;
        this.playerNumber = null;
        this.isHost = false;
        this.roomRef = null;
    },

    // Helper functions
    initScores(playerCount) {
        const scores = {};
        for (let i = 1; i <= playerCount; i++) {
            scores[i] = 0;
        }
        return scores;
    },

    generateDailyDouble() {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const val = values[Math.floor(Math.random() * values.length)];
        return `${cat}|${val}`;
    },

    // Get current room state
    async getRoomState() {
        if (!this.roomRef) return null;
        
        try {
            const snapshot = await this.roomRef.once('value');
            return snapshot.val();
        } catch (error) {
            console.error('Error getting room state:', error);
            return null;
        }
    },

    // Check if it's this player's turn
    isMyTurn(gameState) {
        return gameState && gameState.currentTurn === this.playerNumber;
    }
};

// Export for use in other files
window.MultiplayerManager = MultiplayerManager;
