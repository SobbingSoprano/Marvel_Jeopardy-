/*
============================================================
 MARVEL JEOPARDY - QUESTIONS DATA & GAME STATE MANAGEMENT
 For GitHub Pages (Static Site)
============================================================
*/

const allQuestions = {
    "People": {
        "$200": {
            question: "Who is the leader of the Avengers in most MCU films?",
            answer: ["captain america", "steve rogers"]
        },
        "$400": {
            question: "What is the real name of Black Panther?",
            answer: ["t'challa", "t challa", "king t'challa"]
        },
        "$600": {
            question: "Which Marvel character is known as the Sorcerer Supreme?",
            answer: ["doctor strange", "stephen strange"]
        },
        "$800": {
            question: "What is the real name of the Scarlet Witch?",
            answer: ["wanda maximoff", "wanda"]
        },
        "$1000": {
            question: "Which mutant is known as the father of Wanda and Pietro in Marvel comics?",
            answer: ["magneto", "erik lehnsherr"]
        }
    },
    "Powers": {
        "$200": {
            question: "What metal is Wolverine's skeleton coated with?",
            answer: ["adamantium"]
        },
        "$400": {
            question: "Which Avenger can control lightning?",
            answer: ["thor"]
        },
        "$600": {
            question: "Which cosmic force grants Captain Marvel her abilities?",
            answer: ["the tesseract", "space stone", "energy from the tesseract"]
        },
        "$800": {
            question: "Which mutant power is Jean Grey most known for?",
            answer: ["telekinesis", "telepathy", "phoenix force"]
        },
        "$1000": {
            question: "What is the name of the dimension that gives Doctor Strange his magic?",
            answer: ["the dark dimension", "dark dimension"]
        }
    },
    "Artifacts": {
        "$200": {
            question: "Which magical item does Doctor Strange wear around his neck?",
            answer: ["eye of agamotto"]
        },
        "$400": {
            question: "Which infinity stone does Vision possess?",
            answer: ["mind stone", "the mind stone"]
        },
        "$600": {
            question: "What is Thor's hammer called?",
            answer: ["mjolnir"]
        },
        "$800": {
            question: "What metal is Captain America's shield made of?",
            answer: ["vibranium"]
        },
        "$1000": {
            question: "What ancient book contains forbidden magical knowledge in Doctor Strange?",
            answer: ["the darkhold", "darkhold"]
        }
    },
    "Media": {
        "$200": {
            question: "Which movie introduced Spider-Man to the MCU?",
            answer: ["captain america: civil war", "civil war"]
        },
        "$400": {
            question: "Which movie features the first appearance of Thanos?",
            answer: ["the avengers", "avengers 1", "avengers"]
        },
        "$600": {
            question: "Which Marvel show features Wanda creating alternate realities?",
            answer: ["wandavision"]
        },
        "$800": {
            question: "Which film marks the introduction of the multiverse in the MCU?",
            answer: ["doctor strange in the multiverse of madness", "multiverse of madness"]
        },
        "$1000": {
            question: "Which MCU movie won three Oscars, including Best Costume Design?",
            answer: ["black panther"]
        }
    },
    "Teams": {
        "$200": {
            question: "What superhero team is Wolverine most associated with?",
            answer: ["x-men", "x men", "xmen"]
        },
        "$400": {
            question: "Which team includes Rocket Raccoon and Groot?",
            answer: ["guardians of the galaxy", "guardians"]
        },
        "$600": {
            question: "What elite spy organization does Black Widow work for?",
            answer: ["s.h.i.e.l.d.", "shield", "s.h.i.e.l.d"]
        },
        "$800": {
            question: "What is the name of the villain team led by Thanos' children?",
            answer: ["black order", "the black order"]
        },
        "$1000": {
            question: "What team does Deadpool temporarily join in Deadpool 2?",
            answer: ["x-force", "x force", "xforce"]
        }
    },
    "Places": {
        "$200": {
            question: "What country is Black Panther's home?",
            answer: ["wakanda"]
        },
        "$400": {
            question: "What city is Spider-Man primarily associated with?",
            answer: ["new york", "nyc", "new york city"]
        },
        "$600": {
            question: "What is the name of Thor's home realm?",
            answer: ["asgard"]
        },
        "$800": {
            question: "Where is Doctor Strange's Sanctum located?",
            answer: ["177a bleecker street", "bleecker street", "new york"]
        },
        "$1000": {
            question: "What hidden mutant island appears in Marvel comics and the Krakoa era?",
            answer: ["krakoa"]
        }
    }
};

const finalJeopardyQuestion = {
    question: "What metal is the ONLY known substance capable of cutting through Vibranium?",
    answers: ["adamantium", "what is adamantium?", "adamantium metal"]
};

const categories = ["People", "Powers", "Artifacts", "Media", "Teams", "Places"];
const values = ["$200", "$400", "$600", "$800", "$1000"];

/*
============================================================
 GAME STATE MANAGEMENT (using localStorage)
============================================================
*/

const GameState = {
    // Initialize game state
    init(playerCount) {
        const state = {
            playerCount: playerCount,
            playerNames: {},
            playerScores: {},
            usedCells: [],
            dailyDouble: this.generateDailyDouble(),
            currentTurn: 1,
            gameStarted: false,
            targetNumber: Math.floor(Math.random() * 50) + 1,
            guesses: {}
        };
        
        for (let i = 1; i <= playerCount; i++) {
            state.playerNames[i] = `Player ${i}`;
            state.playerScores[i] = 0;
            state.guesses[i] = null;
        }
        
        this.save(state);
        return state;
    },
    
    // Generate random daily double
    generateDailyDouble() {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const val = values[Math.floor(Math.random() * values.length)];
        return `${cat}|${val}`;
    },
    
    // Save state to localStorage
    save(state) {
        localStorage.setItem('marvelJeopardyState', JSON.stringify(state));
    },
    
    // Load state from localStorage
    load() {
        const saved = localStorage.getItem('marvelJeopardyState');
        return saved ? JSON.parse(saved) : null;
    },
    
    // Clear game state
    clear() {
        localStorage.removeItem('marvelJeopardyState');
    },
    
    // Set player names
    setPlayerNames(names) {
        const state = this.load();
        if (state) {
            state.playerNames = names;
            this.save(state);
        }
        return state;
    },
    
    // Update score
    updateScore(playerNum, delta) {
        const state = this.load();
        if (state) {
            state.playerScores[playerNum] += delta;
            this.save(state);
        }
        return state;
    },
    
    // Mark cell as used
    markCellUsed(cellKey) {
        const state = this.load();
        if (state && !state.usedCells.includes(cellKey)) {
            state.usedCells.push(cellKey);
            this.save(state);
        }
        return state;
    },
    
    // Check if cell is used
    isCellUsed(cellKey) {
        const state = this.load();
        return state ? state.usedCells.includes(cellKey) : false;
    },
    
    // Check if daily double
    isDailyDouble(cellKey) {
        const state = this.load();
        return state ? state.dailyDouble === cellKey : false;
    },
    
    // Switch turn
    nextTurn() {
        const state = this.load();
        if (state) {
            state.currentTurn = (state.currentTurn % state.playerCount) + 1;
            this.save(state);
        }
        return state;
    },
    
    // Set current turn
    setCurrentTurn(playerNum) {
        const state = this.load();
        if (state) {
            state.currentTurn = playerNum;
            this.save(state);
        }
        return state;
    },
    
    // Start game
    startGame() {
        const state = this.load();
        if (state) {
            state.gameStarted = true;
            this.save(state);
        }
        return state;
    },
    
    // Submit guesses
    submitGuesses(guesses) {
        const state = this.load();
        if (state) {
            state.guesses = guesses;
            
            // Find winner (closest to target)
            let minDiff = Infinity;
            let winner = 1;
            
            for (let i = 1; i <= state.playerCount; i++) {
                const diff = Math.abs(state.targetNumber - state.guesses[i]);
                if (diff < minDiff) {
                    minDiff = diff;
                    winner = i;
                }
            }
            
            state.currentTurn = winner;
            state.gameStarted = true;
            this.save(state);
        }
        return state;
    },
    
    // Check if all cells are used (game over)
    isGameOver() {
        const state = this.load();
        return state ? state.usedCells.length >= 30 : false;
    },
    
    // Valid Jeopardy-style phrasing prefixes
    validPhrases: [
        'what is', "what's", 'who is', "who's",
        'where is', "where's", 'when is', "when's",
        'how is', "how's", 'why is'
    ],

    // Check if answer includes proper Jeopardy phrasing
    validatePhrasing(answer) {
        const lower = answer.toLowerCase().trim();
        return this.validPhrases.some(phrase => lower.startsWith(phrase + ' '));
    },

    // Get suggested phrasing prefix based on what the answer represents
    // In Jeopardy: people = "Who is", teams = "Who are", everything else = "What is"
    getSuggestedPrefix(category, value) {
        // People category = individuals
        if (category === 'People') return 'Who is';
        // Teams category = groups of people
        if (category === 'Teams') return 'Who are';
        // Places, Powers, Artifacts, Media = things/concepts/places/titles
        return 'What is';
    },

    // Normalize answer for flexible matching (preserves content after stripping prefix)
    normalizeAnswer(answer) {
        let normalized = answer.toLowerCase().trim();

        // Remove "what is", "who is", "what's", "who's" prefixes
        normalized = normalized.replace(/^(what is|who is|what's|who's|where is|when is|how is|why is|where's|when's|how's)\s+/i, '');

        // Remove leading articles "the", "a", "an"
        normalized = normalized.replace(/^(the|a|an)\s+/i, '');

        // Collapse multiple spaces to single space
        normalized = normalized.replace(/\s+/g, ' ');

        // Remove punctuation except apostrophes (for names like T'Challa)
        normalized = normalized.replace(/[^\w\s']/g, '');

        return normalized.trim();
    },

    // Levenshtein distance for fuzzy spelling matching
    // Returns how many single-character edits needed to transform a into b
    levenshtein(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                matrix[i][j] = b[i - 1] === a[j - 1]
                    ? matrix[i - 1][j - 1]
                    : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
        return matrix[b.length][a.length];
    },

    // Check if two strings are close enough (allows minor spelling mistakes)
    isFuzzyMatch(a, b) {
        const dist = this.levenshtein(a, b);
        const maxLen = Math.max(a.length, b.length);
        // Allow 1 edit for short answers, 2 for longer ones
        const threshold = maxLen <= 5 ? 1 : 2;
        return dist <= threshold;
    },

    // Check answer with flexible matching
    // Returns: { correct: boolean, missingPhrasing: boolean, contentMatch: boolean }
    checkAnswer(category, value, userAnswer) {
        const correctAnswers = allQuestions[category][value].answer;

        // First, check for proper Jeopardy phrasing
        const hasPhrasing = this.validatePhrasing(userAnswer);

        const normalizedUserAnswer = this.normalizeAnswer(userAnswer);

        const contentMatch = correctAnswers.some(ans => {
            const normalizedCorrect = this.normalizeAnswer(ans);

            // Exact match after normalization
            if (normalizedUserAnswer === normalizedCorrect) return true;

            // Fuzzy match: minor spelling mistakes allowed (1-2 chars off)
            if (this.isFuzzyMatch(normalizedUserAnswer, normalizedCorrect)) return true;

            // Check if user answer contains the correct answer (e.g. "captain america civil war" for "captain america")
            if (normalizedUserAnswer.includes(normalizedCorrect)) return true;

            return false;
        });

        return {
            correct: hasPhrasing && contentMatch,
            missingPhrasing: !hasPhrasing && contentMatch,
            contentMatch: contentMatch
        };
    },
    
    // Get question
    getQuestion(category, value) {
        return allQuestions[category][value].question;
    },
    
    // Get correct answer (first one for display)
    getCorrectAnswer(category, value) {
        return allQuestions[category][value].answer[0];
    },

    // Get correct answer with suggested Jeopardy phrasing
    getCorrectAnswerFormatted(category, value) {
        const prefix = this.getSuggestedPrefix(category, value);
        const answer = this.getCorrectAnswer(category, value);
        // Capitalize first letter of answer
        const formattedAnswer = answer.charAt(0).toUpperCase() + answer.slice(1);
        return `${prefix} ${formattedAnswer}?`;
    }
};

// Final Jeopardy state management
const FinalJeopardy = {
    init() {
        const gameState = GameState.load();
        if (!gameState) return null;
        
        const fjState = {
            stage: 'wager', // wager, question, results
            wagers: {},
            answers: {},
            results: {}
        };
        
        for (let i = 1; i <= gameState.playerCount; i++) {
            fjState.wagers[i] = 0;
            fjState.answers[i] = '';
            fjState.results[i] = false;
        }
        
        localStorage.setItem('finalJeopardyState', JSON.stringify(fjState));
        return fjState;
    },
    
    load() {
        const saved = localStorage.getItem('finalJeopardyState');
        return saved ? JSON.parse(saved) : null;
    },
    
    save(state) {
        localStorage.setItem('finalJeopardyState', JSON.stringify(state));
    },
    
    clear() {
        localStorage.removeItem('finalJeopardyState');
    },
    
    submitWagers(wagers) {
        const state = this.load();
        if (state) {
            state.wagers = wagers;
            state.stage = 'question';
            this.save(state);
        }
        return state;
    },
    
    submitAnswers(answers) {
        const state = this.load();
        const gameState = GameState.load();
        
        if (state && gameState) {
            state.answers = answers;
            
            // Check each answer with phrasing validation
            for (let i = 1; i <= gameState.playerCount; i++) {
                const userAnswer = answers[i].toLowerCase().trim();
                const hasPhrasing = GameState.validatePhrasing(answers[i]);
                
                const contentMatch = finalJeopardyQuestion.answers.some(
                    ans => userAnswer === ans.toLowerCase()
                );
                
                // Must have phrasing AND match content
                state.results[i] = hasPhrasing && contentMatch;
                
                // Update scores
                if (state.results[i]) {
                    gameState.playerScores[i] += state.wagers[i];
                } else {
                    gameState.playerScores[i] -= state.wagers[i];
                }
            }
            
            state.stage = 'results';
            this.save(state);
            GameState.save(gameState);
        }
        return { fjState: state, gameState: gameState };
    }
};

// Daily Double state
const DailyDouble = {
    save(data) {
        localStorage.setItem('dailyDoubleState', JSON.stringify(data));
    },
    
    load() {
        const saved = localStorage.getItem('dailyDoubleState');
        return saved ? JSON.parse(saved) : null;
    },
    
    clear() {
        localStorage.removeItem('dailyDoubleState');
    }
};
