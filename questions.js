/*
============================================================
 MARVEL JEOPARDY - QUESTIONS DATA & GAME STATE MANAGEMENT
 For GitHub Pages (Static Site)
============================================================
*/

const allQuestions = {
    "People": {
        "$200": {
            question: "This star-spangled super-soldier from Brooklyn leads the Avengers in most MCU films",
            answer: ["captain america", "steve rogers"]
        },
        "$400": {
            question: "T'Challa is the birth name of this Wakandan king who fights as a Marvel superhero",
            answer: ["black panther"]
        },
        "$600": {
            question: "Trained by the Ancient One, this former neurosurgeon now holds the title of Sorcerer Supreme",
            answer: ["doctor strange", "stephen strange"]
        },
        "$800": {
            question: "Twin sister of Pietro, this Sokovian-born mutant is the true identity behind the Scarlet Witch",
            answer: ["wanda maximoff", "wanda"]
        },
        "$1000": {
            question: "In Marvel comics, this master of magnetism raised Wanda and Pietro Maximoff as his own children",
            answer: ["magneto", "erik lehnsherr"]
        }
    },
    "Powers": {
        "$200": {
            question: "Weapon X forcibly bonded this virtually indestructible metal to Wolverine's entire skeleton",
            answer: ["adamantium"]
        },
        "$400": {
            question: "As the God of Thunder, this Asgardian Avenger commands lightning and wields an enchanted hammer",
            answer: ["thor"]
        },
        "$600": {
            question: "Captain Marvel's extraordinary powers were unlocked by exposure to energy from this blue Infinity Stone",
            answer: ["the tesseract", "space stone", "tesseract"]
        },
        "$800": {
            question: "Jean Grey's most devastating ability manifests as this ancient cosmic force that nearly destroys the X-Men",
            answer: ["telekinesis", "telepathy", "phoenix force"]
        },
        "$1000": {
            question: "Dormammu rules this dark realm from which Doctor Strange must never draw too much power",
            answer: ["the dark dimension", "dark dimension"]
        }
    },
    "Artifacts": {
        "$200": {
            question: "Doctor Strange wears this ancient relic — a containment vessel for the Time Stone — around his neck",
            answer: ["eye of agamotto"]
        },
        "$400": {
            question: "Embedded in Vision's forehead, this yellow Infinity Stone grants him consciousness and mental powers",
            answer: ["mind stone", "the mind stone"]
        },
        "$600": {
            question: "Only those deemed worthy by Odin's enchantment may lift this legendary hammer of Thor",
            answer: ["mjolnir"]
        },
        "$800": {
            question: "Captain America's iconic round shield is forged from this ultra-rare vibration-absorbing Wakandan metal",
            answer: ["vibranium"]
        },
        "$1000": {
            question: "This ancient tome of chaos magic appears in both the MCU and comics as an artifact that corrupts every reader",
            answer: ["the darkhold", "darkhold"]
        }
    },
    "Media": {
        "$200": {
            question: "Spider-Man first swung into the MCU as a supporting character in this airport-battle 2016 Marvel film",
            answer: ["captain america: civil war", "civil war"]
        },
        "$400": {
            question: "A post-credits scene in this 2012 Marvel ensemble film gave audiences their first look at Thanos",
            answer: ["the avengers", "avengers 1", "avengers"]
        },
        "$600": {
            question: "In this Disney+ series, Wanda Maximoff controls an entire New Jersey town inside a decades-spanning sitcom illusion",
            answer: ["wandavision"]
        },
        "$800": {
            question: "Sam Raimi directed this 2022 MCU sequel in which Doctor Strange and America Chavez journey through alternate realities",
            answer: ["doctor strange in the multiverse of madness", "multiverse of madness"]
        },
        "$1000": {
            question: "This 2018 MCU film was the first superhero movie nominated for Best Picture at the Academy Awards, winning three Oscars",
            answer: ["black panther"]
        }
    },
    "Teams": {
        "$200": {
            question: "Wolverine, Storm, Cyclops, and Jean Grey are all longtime members of this Charles Xavier-founded mutant team",
            answer: ["x-men", "x men", "xmen"]
        },
        "$400": {
            question: "Star-Lord, Gamora, Drax, Rocket Raccoon, and Groot form the core roster of this ragtag intergalactic team",
            answer: ["guardians of the galaxy", "guardians"]
        },
        "$600": {
            question: "Nick Fury, Black Widow, and Hawkeye all operate within this secret government intelligence and espionage organization",
            answer: ["s.h.i.e.l.d.", "shield", "s.h.i.e.l.d"]
        },
        "$800": {
            question: "Corvus Glaive, Proxima Midnight, Ebony Maw, and Cull Obsidian make up this elite team of children of Thanos",
            answer: ["black order", "the black order"]
        },
        "$1000": {
            question: "Deadpool assembled Domino, Bedlam, Shatterstar, and others into this ill-fated mutant strike team in his 2018 sequel",
            answer: ["x-force", "x force", "xforce"]
        }
    },
    "Places": {
        "$200": {
            question: "Hidden behind holographic mountains in Africa, this vibranium-rich nation is the home of Black Panther",
            answer: ["wakanda"]
        },
        "$400": {
            question: "Your friendly neighborhood Spider-Man calls this East Coast metropolis — the city that never sleeps — his home",
            answer: ["new york", "nyc", "new york city"]
        },
        "$600": {
            question: "The Bifrost bridge connects this gleaming golden realm of Thor and Odin to the other Nine Realms",
            answer: ["asgard"]
        },
        "$800": {
            question: "Doctor Strange's New York Sanctum Sanctorum stands at this specific street address in Greenwich Village",
            answer: ["177a bleecker street", "bleecker street", "new york"]
        },
        "$1000": {
            question: "In the recent Krakoa Era of Marvel comics, mutants established their own sovereign nation on this sentient living island",
            answer: ["krakoa"]
        }
    }
};

const finalJeopardyQuestion = {
    question: "In Marvel canon, this is the only known metal tough enough to cut through vibranium",
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
        'what is', "what's", 'what are',
        'who is', "who's", 'who are',
        'where is', "where's", 'where are',
        'when is', "when's", 'when are',
        'how is', "how's", 'how are',
        'why is', 'why are'
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

        // Remove "what is/are", "who is/are", etc. prefixes
        normalized = normalized.replace(/^(what is|what are|who is|who are|what's|who's|where is|where are|when is|when are|how is|how are|why is|why are|where's|when's|how's)\s+/i, '');

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

    // Grammar-aware answer formatter for display in correct-answer modals
    formatAnswerGrammar(answer, category, allAnswers = []) {
        let text = answer.trim();
        if (!text) return text;

        const lower = text.toLowerCase();

        // Special-case: all-lowercase acronym with periods (e.g., s.h.i.e.l.d.)
        if (/^[a-z](\.[a-z])+\.?$/.test(text)) {
            return text.toUpperCase().replace(/\.$/, '') + (text.endsWith('.') ? '.' : '');
        }
        if (lower === 'x-men' || lower === 'x men' || lower === 'xmen') {
            return 'X-Men';
        }

        // Infer article from alternate answers if the canonical one lacks one
        const articlePattern = /^(the|a|an)\s+(.+)$/i;
        const hasArticle = articlePattern.test(text);
        let article = '';
        let rest = text;

        if (hasArticle) {
            const match = text.match(articlePattern);
            article = match[1].toLowerCase();
            rest = match[2];
        } else if (Array.isArray(allAnswers)) {
            for (const alt of allAnswers) {
                const altMatch = alt.trim().match(articlePattern);
                if (altMatch) {
                    article = altMatch[1].toLowerCase();
                    break;
                }
            }
        }

        // Fallback: multi-word answers in Artifacts/Powers/Teams/Places
        // usually read better with "the" (e.g., "the Infinity Gauntlet")
        if (!article && category !== 'People' && rest.split(/\s+/).length >= 2) {
            article = 'the';
        }

        const titleCased = this.toTitleCase(rest);
        if (article) {
            return `${article} ${titleCased}`;
        }
        return titleCased;
    },

    toTitleCase(str) {
        const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor',
            'on', 'at', 'to', 'from', 'by', 'in', 'of', 'with', 'as'];
        return str.split(/\s+/).map((word, i) => {
            if (word.includes('-')) {
                return word.split('-').map((part, j) => {
                    const isFirst = (i === 0 && j === 0);
                    const isSmall = smallWords.includes(part.toLowerCase());
                    if (isFirst || !isSmall) {
                        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
                    }
                    return part.toLowerCase();
                }).join('-');
            }
            if (i === 0 || !smallWords.includes(word.toLowerCase())) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.toLowerCase();
        }).join(' ');
    },

    // Get correct answer with suggested Jeopardy phrasing
    getCorrectAnswerFormatted(category, value) {
        const prefix = this.getSuggestedPrefix(category, value);
        const answer = this.getCorrectAnswer(category, value);
        const allAnswers = allQuestions[category]?.[value]?.answer || [];
        const formattedAnswer = this.formatAnswerGrammar(answer, category, allAnswers);
        return `${prefix} ${formattedAnswer}?`;
    },

    // Rotate through 4 placeholder examples each time a question overlay opens
    _placeholderIndex: 0,
    placeholderExamples: [
        'e.g., "Who is Captain America?"',
        'e.g., "What is the Infinity Gauntlet?"',
        'e.g., "Who are the Guardians of the Galaxy?"',
        'e.g., "What is Wakanda?"'
    ],
    getRandomPlaceholder(currentAnswers) {
        const total = this.placeholderExamples.length;
        // If answers are supplied, skip any placeholder that contains them
        if (Array.isArray(currentAnswers) && currentAnswers.length) {
            const lowerAnswers = currentAnswers.map(a => a.toLowerCase());
            for (let i = 0; i < total; i++) {
                const candidate = this.placeholderExamples[this._placeholderIndex % total];
                this._placeholderIndex++;
                const lowerCandidate = candidate.toLowerCase();
                if (!lowerAnswers.some(a => lowerCandidate.includes(a))) {
                    return candidate;
                }
            }
            // All examples somehow matched — fall back to a generic safe placeholder
            return 'e.g., "Who is this Marvel character?"';
        }
        const example = this.placeholderExamples[this._placeholderIndex % total];
        this._placeholderIndex++;
        return example;
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
