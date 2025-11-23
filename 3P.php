<?php
session_start();

include "questions.php"; // This defines $allQuestions variable and functions

const NUM_PLAYERS = 3;

/* ============================================================
    INITIAL GAME SETUP
    ============================================================ */
if (!isset($_SESSION['3p_initialized'])) {

    $_SESSION['3p_initialized'] = true;
    $_SESSION['game_started'] = false;

    // 1–50 number guessing for turn order
    $_SESSION['target_number'] = rand(1, 50);
    // Initialize guesses for 3 players
    $_SESSION['guesses'] = [1 => null, 2 => null, 3 => null];

    // Player names
    $_SESSION['player_names'] = $_SESSION['player_names'] ?? [
        1 => "Player 1",
        2 => "Player 2",
        3 => "Player 3"
    ];

  
    $_SESSION['player_scores'] = [1 => 0, 2 => 0, 3 => 0];

    
    $_SESSION['used_cells'] = [];

   
    $categories = getCategoryList();
    $values = getValueList();
    $_SESSION['daily_double'] =
        $categories[array_rand($categories)] . "|" .
        $values[array_rand($values)];

  
    $_SESSION['question_map'] = getRandomizedQuestionMap($allQuestions);
}


session_write_close(); 


if (isset($_GET['reset'])) {
    session_start();
    session_unset();
    session_destroy();
    // Clear session cookie
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }
    header("Location: 3P.php");
    exit();
}

/* ============================================================
    HANDLE NUMBER GUESSING (BEFORE GAME STARTS)
    ============================================================ */
if (isset($_POST['all_guesses'])) {
    session_start();
    $allValid = true;
    for ($i = 1; $i <= NUM_PLAYERS; $i++) {
        $guess = isset($_POST['guess'][$i]) ? (int) $_POST['guess'][$i] : null;
        if ($guess === null || $guess < 1 || $guess > 50) {
            $allValid = false;
            break;
        }
        $_SESSION['guesses'][$i] = $guess;
    }
    if ($allValid) {
        $target = $_SESSION['target_number'];
        $diffs = [];
        foreach ($_SESSION['guesses'] as $i => $v) {
            $diffs[$i] = abs($target - $v);
        }
        
     
        $winner = array_search(min($diffs), $diffs);
        
        
        $minDiff = min($diffs);
        $tiedPlayers = array_keys(array_filter($diffs, fn($diff) => $diff === $minDiff));
        $winner = min($tiedPlayers);
        
        $_SESSION['current_turn'] = $winner;
        $_SESSION['game_started'] = true;
    }
    session_write_close();
    header("Location: 3P.php");
    exit();
}

/* ============================================================
    HANDLE DAILY DOUBLE WAGER SUBMISSION
    ============================================================ */
if (isset($_POST['wager']) && isset($_POST['category']) && isset($_POST['value'])) {
    session_start();
    $wager = max(5, (int) $_POST['wager']); // Minimum wager of $5
    
    $currentPlayerScore = $_SESSION['player_scores'][$_SESSION['current_turn']] ?? 0;
    $cardValue = (int) str_replace('$', '', $_POST['value']);
    $maxWager = $currentPlayerScore > 0 ? $currentPlayerScore : $cardValue;
    
    $wager = min($wager, $maxWager); // Cap wager at max
    
    $_SESSION['daily_double_wager'] = $wager;
    $_SESSION['daily_double_player'] = $_SESSION['current_turn'];
    $_SESSION['daily_double_start_time'] = time();

    session_write_close();
    header('Location: 3P.php?daily_double=1&category=' . urlencode($_POST['category']) . '&value=' . urlencode($_POST['value']));
    exit;
}


if (isset($_POST['answer']) && isset($_POST['category']) && isset($_POST['value'])) {
    session_start();
    
    $isDailyDouble = isset($_POST['daily_double']) && $_POST['daily_double'] === '1';
    $category = $_POST['category'];
    $value = $_POST['value'];
    $questionText = $_POST['question'];
    
    $activePlayer = $isDailyDouble ? ($_SESSION['daily_double_player'] ?? $_SESSION['current_turn']) : $_SESSION['current_turn']; 

    
    $pointValue = (int) str_replace('$', '', $value); // Base value
    $wager = $isDailyDouble ? ($_SESSION['daily_double_wager'] ?? $pointValue) : $pointValue;
    $pointValue = $isDailyDouble ? $wager : $pointValue;

    $correctAnswers = getCorrectAnswers($allQuestions, $category, $value, $questionText);
    $answer = trim(strtolower($_POST['answer']));
    $correct = array_map('strtolower', $correctAnswers);
    $isCorrect = in_array($answer, $correct);

   
    $_SESSION['player_scores'][$activePlayer] += $isCorrect ? $pointValue : -$pointValue;

    // Mark cell as used
    $cellKey = $category . '|' . $value;
    $_SESSION['used_cells'][$cellKey] = true;

    // Turn Rotation & Feedback Storage
    if ($isCorrect) {
        // Player answered correctly, they keep the turn
        $_SESSION['current_turn'] = $activePlayer; 
        
        // Store feedback ONLY if correct
        $_SESSION['last_feedback'] = [
            'is_correct' => true,
            'correct_answer' => $correctAnswers[0] ?? 'N/A',
            'user_answer' => $_POST['answer'],
            'player_id' => $activePlayer,
            'player_name' => $_SESSION['player_names'][$activePlayer],
            'points' => $pointValue,
            'category' => $category,
            'value' => $value
        ];
        
    } else {
        // Player was wrong, rotate turn: 1 -> 2 -> 3 -> 1
        $_SESSION['current_turn'] = ($activePlayer % NUM_PLAYERS) + 1;
       
    }

    
    if ($isDailyDouble) {
        unset($_SESSION['daily_double_wager']);
        unset($_SESSION['daily_double_player']);
        unset($_SESSION['daily_double_start_time']);
    }

    // Check for Final Jeopardy (30 cells total)
    if (count($_SESSION['used_cells']) >= 30) {
        session_write_close();
        header('Location: final_jeopardy.php');
        exit;
    }

    session_write_close();
    
    
    if ($isCorrect) {
        header('Location: 3P.php?feedback=1');
    } else {
        header('Location: 3P.php');
    }
    exit;
}

/* ============================================================
    HANDLE CELL CLICK (Determine which overlay to show)
    ============================================================ */
if (isset($_GET['category']) && isset($_GET['value']) && ($_SESSION['game_started'] ?? false)) {
    session_start();
    $category = $_GET['category'];
    $value = $_GET['value'];
    $cellKey = $category . '|' . $value;

    // 1. Check if the cell is already used
    if (isset($_SESSION['used_cells'][$cellKey])) {
        session_write_close();
        header("Location: 3P.php");
        exit;
    }

    // 2. Check for Daily Double
    if ($cellKey === ($_SESSION['daily_double'] ?? '')) {
        session_write_close();
        // Redirect to the wager screen
        header("Location: 3P.php?show_wager=1&category=" . urlencode($category) . "&value=" . urlencode($value));
        exit;
    }
    
    // 3. Standard Question (Execution continues to display logic below)
    session_write_close();
}


session_start();
$gameStarted = $_SESSION['game_started'] ?? false;
$guesses = $_SESSION['guesses'] ?? [1 => null, 2 => null, 3 => null];
$targetNumber = $_SESSION['target_number'] ?? 0;
$dailyDoubleKey = $_SESSION['daily_double'] ?? '';
$playerNames = $_SESSION['player_names'] ?? [1 => "Player 1", 2 => "Player 2", 3 => "Player 3"];
$playerScores = $_SESSION['player_scores'] ?? [1 => 0, 2 => 0, 3 => 0];
$currentTurn = $_SESSION['current_turn'] ?? null;

// --- Feedback Display ---
$showFeedback = isset($_GET['feedback']) && isset($_SESSION['last_feedback']);
$feedbackData = $showFeedback ? $_SESSION['last_feedback'] : null;

// --- Daily Double Wager Display ---
$showDailyDoubleWager = isset($_GET['show_wager']) && isset($_GET['category']) && isset($_GET['value']);
$dailyDoubleCategory = $showDailyDoubleWager ? htmlspecialchars($_GET['category']) : '';
$dailyDoubleValue = $showDailyDoubleWager ? htmlspecialchars($_GET['value']) : '';
$maxWager = 0;
if ($showDailyDoubleWager) {
    $currentPlayerScore = $playerScores[$currentTurn] ?? 0;
    $cardValue = (int) str_replace('$', '', $dailyDoubleValue);
    $maxWager = $currentPlayerScore > 0 ? $currentPlayerScore : $cardValue;
}

// --- Daily Double Question Display ---
$showDailyDoubleQuestion = isset($_GET['daily_double']) && isset($_GET['category']) && isset($_GET['value']);
$ddCategory = $showDailyDoubleQuestion ? htmlspecialchars($_GET['category']) : '';
$ddValue = $showDailyDoubleQuestion ? htmlspecialchars($_GET['value']) : '';
$ddQuestion = '';
if ($showDailyDoubleQuestion) {
    $ddQuestion = $_SESSION['question_map'][$ddCategory][$ddValue] ?? '';
}

// --- Standard Question Display ---
$showForm = isset($_GET['category']) && isset($_GET['value']) && $gameStarted && !$showDailyDoubleWager && !$showDailyDoubleQuestion;
$category = $showForm ? htmlspecialchars($_GET['category']) : '';
$value = $showForm ? htmlspecialchars($_GET['value']) : '';
$selectedQuestion = '';
if ($showForm) {
    $selectedQuestion = $_SESSION['question_map'][$category][$value] ?? '';
}

session_write_close();
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marvel Jeopardy! - 3 Players</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bungee&family=Monoton&family=Six+Caps&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="marvel.css">
</head>

<body class="game-page three-player-layout">
    <div class="preloader preloader-gamepage">
        <div class="preloader-logo">
            <span class="preloader-marvel">MARVEL</span>
            <span class="preloader-jeopardy">Jeopardy!</span>
        </div>
        <div class="preloader-spinner"></div>
    </div>

    <div class="title">
        <a href="3P.php?reset=1" class="title-wrapper"
            onclick="return confirm('Are you sure you want to reset the game?');">
            <span class="title-marvel">MARVEL</span>
            <span class="title-jeopardy">Jeopardy!</span>
        </a>
    </div>

    <?php if (!$showDailyDoubleWager && !$showDailyDoubleQuestion): ?>
        <audio class="audio-player game-audio" controls loop autoplay>
            <source src="Assets/Sounds/krakoa match.wav" type="audio/wav">
            Your browser does not support the audio element.
        </audio>
    <?php endif; ?>

    <?php if (!$gameStarted): ?>
        <div class="question-overlay">
            <div class="question-card number-guess-card">
                <h2 class="guess-title">Who Goes First? (3 Players)</h2>
                <p class="guess-instructions">Each player picks a number between 1-50. Closest to the target wins!</p>
                <form method="POST" action="3P.php" class="guess-form" style="width:100%;">
                    <div class="guess-container">
                        <?php for ($i = 1; $i <= NUM_PLAYERS; $i++): ?>
                            <div class="player-guess-section">
                                <h3><?= htmlspecialchars($playerNames[$i]) ?></h3>
                                <label for="guess<?= $i ?>">Pick a number (1-50):</label>
                                <input type="number" id="guess<?= $i ?>" name="guess[<?= $i ?>]" min="1" max="50" required
                                    value="<?= isset($guesses[$i]) ? $guesses[$i] : '' ?>">
                            </div>
                        <?php endfor; ?>
                    </div>
                    <div style="text-align:center; margin-top:2em;">
                        <button type="submit" name="all_guesses" class="cancel-btn">Submit All Guesses</button>
                        <a href="index.html" class="cancel-btn" style="margin-top:1em;">Back to Homepage</a>
                    </div>
                </form>
                <?php if (!in_array(null, $guesses)): ?>
                    <div class="guess-results">
                        <h3>Results:</h3>
                        <p>Target Number: <strong><?= $targetNumber ?></strong></p>
                        <?php for ($i = 1; $i <= NUM_PLAYERS; $i++): ?>
                            <p><?= htmlspecialchars($playerNames[$i]) ?> guessed: <strong><?= $guesses[$i] ?></strong> (off by
                                <?= abs($targetNumber - $guesses[$i]) ?>)
                            </p>
                        <?php endfor; ?>
                        <p class="winner-announce"><?= htmlspecialchars($playerNames[$currentTurn]) ?> goes first!</p>
                        <a href="3P.php" class="submit-btn">Start Game</a>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($showDailyDoubleWager && $gameStarted): ?>
        <div class="question-overlay">
            <audio class="daily-double-audio" autoplay loop>
                <source src="Assets/Sounds/krakoa overtime.wav" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
            <div class="question-card daily-double-card">
                <div class="daily-double-header">
                    <h1 class="daily-double-title">DAILY DOUBLE!</h1>
                    <p class="daily-double-subtitle">Player <?= $currentTurn; ?> (<?= $playerNames[$currentTurn]; ?>), how much do you want to wager?</p>
                </div>
                <div class="wager-info">
                    <p><strong>Your Current Score:</strong> $<?= $playerScores[$currentTurn] ?></p>
                    <p><strong>Maximum Wager:</strong> $<?= $maxWager ?></p>
                </div>
                <form method="POST" action="3P.php" class="wager-form">
                    <input type="hidden" name="category" value="<?= $dailyDoubleCategory; ?>">
                    <input type="hidden" name="value" value="<?= $dailyDoubleValue; ?>">
                    <label for="wager">Enter your wager:</label>
                    <input type="number" id="wager" name="wager" min="5" max="<?= $maxWager; ?>"
                        value="<?= $maxWager; ?>" required autofocus>
                    <button type="submit" class="submit-btn">Lock In Wager</button>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($showDailyDoubleQuestion && $gameStarted): ?>
        <div class="question-overlay">
            <audio class="daily-double-audio" autoplay loop>
                <source src="Assets/Sounds/krakoa overtime.wav" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
            <div class="question-card daily-double-question-card">
                <div class="question-header">
                    <span class="question-category"><?= $ddCategory; ?></span>
                    <span class="question-value">DAILY DOUBLE</span>
                </div>
                <div class="player-indicator">Player <?= $_SESSION['daily_double_player']; ?> - Wager:
                    $<?= $_SESSION['daily_double_wager'] ?? 0; ?></div>
                <div class="question-text"><?= htmlspecialchars($ddQuestion); ?></div>
                <form method="POST" action="3P.php" class="answer-form">
                    <input type="hidden" name="category" value="<?= $ddCategory; ?>">
                    <input type="hidden" name="value" value="<?= $ddValue; ?>">
                    <input type="hidden" name="question" value="<?= htmlspecialchars($ddQuestion); ?>">
                    <input type="hidden" name="daily_double" value="1">
                    <label for="dd_answer">Your Answer:</label>
                    <input type="text" id="dd_answer" name="answer" class="question-input" placeholder="Type your answer..."
                        required autofocus>
                    <div class="question-buttons">
                        <button type="submit" class="submit-btn">Submit Answer</button>
                    </div>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($showForm && $gameStarted): ?>
        <div class="question-overlay">
            <div class="question-card">
                <div class="question-header">
                    <span class="question-category"><?= $category; ?></span>
                    <span class="question-value"><?= $value; ?></span>
                </div>
                <div class="player-indicator">Player <?= $currentTurn; ?> (<?= $playerNames[$currentTurn]; ?>) is answering...</div>
                <div class="question-text"><?= htmlspecialchars($selectedQuestion); ?></div>
                <form method="POST" action="3P.php" class="question-form">
                    <input type="hidden" name="category" value="<?= $category; ?>">
                    <input type="hidden" name="value" value="<?= $value; ?>">
                    <input type="hidden" name="question" value="<?= htmlspecialchars($selectedQuestion); ?>">
                    <label for="answer" class="question-label">Enter your answer:</label>
                    <input type="text" id="answer" name="answer" class="question-input" autofocus required>
                    <div class="question-buttons">
                        <button type="submit" class="submit-btn">Submit</button>
                        <a href="3P.php" class="cancel-btn">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    <?php endif; ?>
    
    <?php if ($showFeedback && $feedbackData['is_correct']): ?>
        <div class="question-overlay feedback-overlay">
            <div class="question-card feedback-card">
                <h2 class="feedback-title correct">CORRECT! ✨</h2>
                <p class="feedback-message">
                    **<?= $feedbackData['player_name'] ?>** answered correctly and wins **$<?= $feedbackData['points'] ?>**!
                </p>
                <p class="next-turn">
                    It is now **<?= $playerNames[$currentTurn] ?>'s** turn to choose a clue.
                </p>
                <a href="3P.php" class="submit-btn">Continue to Board</a>
                <?php unset($_SESSION['last_feedback']); // Clear feedback after display ?>
            </div>
        </div>
    <?php endif; ?>

    <div class="jeopardy-flex-row three-player-board">

        <div class="player-stack">
            
            <div class="player-block <?= ($gameStarted && $currentTurn == 1) ? 'active-player' : '' ?>">
                <div class="score-box">$<?= $playerScores[1] ?></div>
                <div class="player-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="#111" viewBox="0 0 48 48">
                        <circle cx="24" cy="18" r="12" />
                        <rect x="8" y="32" width="32" height="12" rx="6" />
                    </svg>
                </div>
                <div class="player-label"><?= htmlspecialchars($playerNames[1]) ?></div>
                <?php if ($gameStarted && $currentTurn == 1): ?>
                    <div class="turn-indicator">Your Turn</div>
                <?php endif; ?>
            </div>

            <div class="player-block <?= ($gameStarted && $currentTurn == 3) ? 'active-player' : '' ?>">
                <div class="score-box">$<?= $playerScores[3] ?></div>
                <div class="player-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="#111" viewBox="0 0 48 48">
                        <circle cx="24" cy="18" r="12" />
                        <rect x="8" y="32" width="32" height="12" rx="6" />
                    </svg>
                </div>
                <div class="player-label"><?= htmlspecialchars($playerNames[3]) ?></div>
                <?php if ($gameStarted && $currentTurn == 3): ?>
                    <div class="turn-indicator">Your Turn</div>
                <?php endif; ?>
            </div>
        </div> <div class="jeopardy-grid">
            <?php $categories = getCategoryList(); ?>
            <?php foreach ($categories as $cat): ?>
                <div class="grid-cell category-cell"><?= $cat ?></div>
            <?php endforeach; ?>
            <?php $values = getValueList(); ?>
            <?php foreach ($values as $val): ?>
                <?php foreach ($categories as $cat): ?>
                    <?php $cellKey = $cat . '|' . $val; ?>
                    <?php $isUsed = isset($_SESSION['used_cells'][$cellKey]); ?>
                    <?php $isDailyDouble = ($cellKey === $dailyDoubleKey); ?>
                    
                    <?php if ($isUsed || !$gameStarted): ?>
                        <div class="grid-cell value-cell used-cell"><?= $val ?></div>
                    <?php else: ?>
                        <?php 
                        $link = "3P.php?category=" . urlencode($cat) . "&value=" . urlencode($val); 
                        ?>
                        <a href="<?= $link ?>"
                            class="grid-cell value-cell<?= $isDailyDouble ? ' hidden-daily-double-cell' : '' ?>">
                            <?= $val ?>
                        </a>
                    <?php endif; ?>
                <?php endforeach; ?>
            <?php endforeach; ?>
        </div> <div class="player-stack"> <div class="player-block <?= ($gameStarted && $currentTurn == 2) ? 'active-player' : '' ?>">
                <div class="score-box">$<?= $playerScores[2] ?></div>
                <div class="player-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="#111" viewBox="0 0 48 48">
                        <circle cx="24" cy="18" r="12" />
                        <rect x="8" y="32" width="32" height="12" rx="6" />
                    </svg>
                </div>
                <div class="player-label"><?= htmlspecialchars($playerNames[2]) ?></div>
                <?php if ($gameStarted && $currentTurn == 2): ?>
                    <div class="turn-indicator">Your Turn</div>
                <?php endif; ?>
            </div>
        </div> </div>
</body>
</html>