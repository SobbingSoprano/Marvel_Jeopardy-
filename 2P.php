<?php
session_start();

// Shared logic and helpers
include "questions.php";

// INITIAL GAME SETUP
if (!isset($_SESSION['2p_initialized'])) {
    $_SESSION['2p_initialized'] = true;
    $_SESSION['game_started'] = false;

    // 1–50 number guessing for turn order
    $_SESSION['target_number'] = rand(1, 50);
    $_SESSION['guesses'] = [1 => null, 2 => null];

    // Player names (can be customized later)
    $_SESSION['player_names'] = $_SESSION['player_names'] ?? [1 => "Player 1", 2 => "Player 2"];

    // Scores
    $_SESSION['player_scores'] = [1 => 0, 2 => 0];

    // Used cells
    $_SESSION['used_cells'] = [];

    // Select Daily Double cell randomly
    $categories = getCategoryList();
    $values = getValueList();
    $_SESSION['daily_double'] = $categories[array_rand($categories)] . "|" . $values[array_rand($values)];

    // Create question map
    $_SESSION['question_map'] = getRandomizedQuestionMap($allQuestions);
}

session_write_close();

// RESET GAME (fully clear session and cookie)
if (isset($_GET['reset'])) {
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
    header('Location: 2P.php');
    exit();
}

// Handle number guess submission (simultaneous for both players)
if (isset($_POST['all_guesses'])) {
    session_start();
    $allValid = true;
    for ($i = 1; $i <= 2; $i++) {
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
        $_SESSION['current_turn'] = $winner;
        $_SESSION['game_started'] = true;
    }
    session_write_close();
    header('Location: 2P.php');
    exit;
}

// Remove legacy $questions array and use $allQuestions from questions.php

// No need to randomize questions here; handled in initial setup with getRandomizedQuestionMap

// Use getCorrectAnswers from questions.php

// Handle wager submission for Daily Double
if (isset($_POST['wager']) && isset($_POST['category']) && isset($_POST['value'])) {
    session_start();
    $_SESSION['daily_double_wager'] = (int) $_POST['wager'];
    $_SESSION['daily_double_category'] = $_POST['category'];
    $_SESSION['daily_double_value'] = $_POST['value'];
    $_SESSION['daily_double_player'] = $_SESSION['current_turn'];
    $_SESSION['daily_double_start_time'] = time();
    session_write_close();
    header('Location: ' . $_SERVER['PHP_SELF'] . '?daily_double=1&category=' . urlencode($_POST['category']) . '&value=' . urlencode($_POST['value']));
    exit;
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['answer']) && isset($_POST['category']) && isset($_POST['value'])) {
        session_start();
        $isDailyDouble = isset($_POST['daily_double']) && $_POST['daily_double'] === '1';
        $wager = $isDailyDouble ? ($_SESSION['daily_double_wager'] ?? 0) : 0;
        $category = $_POST['category'];
        $value = $_POST['value'];
        $questionText = $_POST['question'];
        $pointValue = $isDailyDouble ? $wager : (int) str_replace('$', '', $value);
        $activePlayer = $_SESSION['current_turn'];
        // Get correct answers from shared helper
        $correctAnswers = getCorrectAnswers($allQuestions, $category, $value, $questionText);
        $answer = trim(strtolower($_POST['answer']));
        $correct = array_map('strtolower', $correctAnswers);
        $isCorrect = in_array($answer, $correct);
        // Update score
        $_SESSION['player_scores'][$activePlayer] += $isCorrect ? $pointValue : -$pointValue;
        // Mark cell as used
        $cellKey = $category . '|' . $value;
        $_SESSION['used_cells'][$cellKey] = true;
        // Store feedback
        $_SESSION['last_feedback'] = [
            'is_correct' => $isCorrect,
            'correct_answer' => $correctAnswers[0] ?? '',
            'user_answer' => $_POST['answer'],
            'player' => $activePlayer,
            'points' => $pointValue
        ];
        // Switch turn
        $_SESSION['current_turn'] = $activePlayer == 1 ? 2 : 1;
        // Clear Daily Double session data if applicable
        if ($isDailyDouble) {
            unset($_SESSION['daily_double_wager']);
            unset($_SESSION['daily_double_category']);
            unset($_SESSION['daily_double_value']);
            unset($_SESSION['daily_double_player']);
            unset($_SESSION['daily_double_start_time']);
        }
        header('Location: ' . $_SERVER['PHP_SELF'] . '?feedback=1');
        exit;
    }
}

// Handle feedback display
$showFeedback = isset($_GET['feedback']) && isset($_SESSION['last_feedback']);
$feedbackData = $showFeedback ? $_SESSION['last_feedback'] : null;
if ($showFeedback) {
    // Clear feedback after displaying
    unset($_SESSION['last_feedback']);
}

// Check if game has started
$gameStarted = $_SESSION['game_started'] ?? false;
$guesses = $_SESSION['guesses'] ?? [1 => null, 2 => null];
$targetNumber = $_SESSION['target_number'] ?? 0;
$dailyDoubleKey = $_SESSION['daily_double'] ?? '';
$playerNames = $_SESSION['player_names'] ?? [1 => "Player 1", 2 => "Player 2"];
$playerScores = $_SESSION['player_scores'] ?? [1 => 0, 2 => 0];

// Check if showing Daily Double wager screen
$showDailyDoubleWager = false;
$dailyDoubleCategory = '';
$dailyDoubleValue = '';
if (isset($_GET['show_wager']) && isset($_GET['category']) && isset($_GET['value'])) {
    $showDailyDoubleWager = true;
    $dailyDoubleCategory = $_GET['category'];
    $dailyDoubleValue = $_GET['value'];
}

// Check if showing Daily Double question with timer
$showDailyDoubleQuestion = false;
$dailyDoubleTimeRemaining = 30;
if (isset($_GET['daily_double']) && isset($_GET['category']) && isset($_GET['value'])) {
    session_start();
    $showDailyDoubleQuestion = true;
    $dailyDoubleCategory = $_GET['category'];
    $dailyDoubleValue = $_GET['value'];
    $startTime = $_SESSION['daily_double_start_time'] ?? time();
    $elapsed = time() - $startTime;
    $dailyDoubleTimeRemaining = max(0, 30 - $elapsed);
    session_write_close();
}

// Check if a cell was clicked
$showForm = isset($_GET['category']) && isset($_GET['value']) && $gameStarted && !$showDailyDoubleWager && !$showDailyDoubleQuestion;
$category = $showForm ? htmlspecialchars($_GET['category']) : '';
$value = $showForm ? htmlspecialchars($_GET['value']) : '';

// Find a matching question for this category and value
$selectedQuestion = '';
if ($showForm) {
    if (isset($_SESSION['question_map'][$category][$value])) {
        $selectedQuestion = $_SESSION['question_map'][$category][$value];
    }
}

// Game state variables
$currentTurn = $_SESSION['current_turn'] ?? null;
$player1Score = $_SESSION['player1_score'] ?? 0;
$player2Score = $_SESSION['player2_score'] ?? 0;
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marvel Jeopardy! - 2 Players</title>

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bungee&family=Monoton&family=Six+Caps&display=swap"
        rel="stylesheet">

    <!-- External Stylesheet -->
    <link rel="stylesheet" href="marvel.css">
</head>

<body class="game-page">
    <!-- CSS Preloader -->
    <div class="preloader preloader-gamepage">
        <div class="preloader-logo">
            <span class="preloader-marvel">MARVEL</span>
            <span class="preloader-jeopardy">Jeopardy!</span>
        </div>
        <div class="preloader-spinner"></div>
    </div>

    <!-- Title -->
    <div class="title">
        <a href="2P.php?reset" class="title-wrapper"
            onclick="return confirm('Are you sure you want to reset the game?');">
            <span class="title-marvel">MARVEL</span>
            <span class="title-jeopardy">Jeopardy!</span>
        </a>
    </div>

    <!-- Audio Player (only play on non-Daily Double screens) -->
    <?php if (!$showDailyDoubleWager && !$showDailyDoubleQuestion): ?>
        <audio class="audio-player game-audio" controls loop autoplay>
            <source src="Assets/Sounds/krakoa match.wav" type="audio/wav">
            Your browser does not support the audio element.
        </audio>
    <?php endif; ?>

    <?php if (!$gameStarted): ?>
        <!-- Number Guessing Screen -->
        <div class="question-overlay">
            <div class="question-card number-guess-card">
                <h2 class="guess-title">Who Goes First?</h2>
                <p class="guess-instructions">Each player picks a number between 1-50. Closest to the target wins!</p>
                <form method="POST" action="2P.php" class="guess-form" style="width:100%;">
                    <div class="guess-container">
                        <?php for ($i = 1; $i <= 2; $i++): ?>
                            <div class="player-guess-section">
                                <h3><?= htmlspecialchars($playerNames[$i]) ?></h3>
                                <label for="guess<?= $i ?>">Pick a number (1-50):</label>
                                <input type="number" id="guess<?= $i ?>" name="guess[<?= $i ?>]" min="1" max="50" required
                                    value="<?= isset($guesses[$i]) ? $guesses[$i] : '' ?>">
                            </div>
                        <?php endfor; ?>
                    </div>
                    <div style="text-align:center; margin-top:2em;">
                        <button type="submit" name="all_guesses" class="cancel-btn">Submit Both Guesses</button>
                    </div>
                </form>
                <?php if (!in_array(null, $guesses)): ?>
                    <div class="guess-results">
                        <h3>Results:</h3>
                        <p>Target Number: <strong><?= $targetNumber ?></strong></p>
                        <p><?= htmlspecialchars($playerNames[1]) ?> guessed: <strong><?= $guesses[1] ?></strong> (off by
                            <?= abs($targetNumber - $guesses[1]) ?>)
                        </p>
                        <p><?= htmlspecialchars($playerNames[2]) ?> guessed: <strong><?= $guesses[2] ?></strong> (off by
                            <?= abs($targetNumber - $guesses[2]) ?>)
                        </p>
                        <p class="winner-announce"><?= htmlspecialchars($playerNames[$currentTurn]) ?> goes first!</p>
                        <a href="2P.php" class="submit-btn">Start Game</a>
                        <a href="index.html" class="cancel-btn" style="margin-top:1em;">Back to Homepage</a>
                    </div>
                <?php else: ?>
                    <div style="text-align:center; margin-top:2em;">
                        <a href="index.html" class="cancel-btn" style="margin-top:1em;">Back to Homepage</a>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($showDailyDoubleWager && $gameStarted): ?>
        <!-- Daily Double Wager Screen -->
        <?php
        // Calculate max wager: player's score, or card value if score is 0
        $currentPlayerScore = $currentTurn == 1 ? $player1Score : $player2Score;
        $cardValue = (int) str_replace('$', '', $dailyDoubleValue);
        $maxWager = $currentPlayerScore > 0 ? $currentPlayerScore : $cardValue;
        ?>
        <div class="question-overlay">
            <audio class="daily-double-audio" autoplay loop>
                <source src="Assets/Sounds/krakoa overtime.wav" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
            <div class="question-card daily-double-card">
                <div class="daily-double-header">
                    <h1 class="daily-double-title">DAILY DOUBLE!</h1>
                    <p class="daily-double-subtitle">Player <?php echo $currentTurn; ?>, how much do you want to wager?</p>
                </div>
                <div class="wager-info">
                    <p><strong>Your Current Score:</strong> $<?php echo $currentPlayerScore; ?></p>
                    <p><strong>Maximum Wager:</strong> $<?php echo $maxWager; ?></p>
                </div>
                <form method="POST" action="2P.php" class="wager-form">
                    <input type="hidden" name="category" value="<?php echo htmlspecialchars($dailyDoubleCategory); ?>">
                    <input type="hidden" name="value" value="<?php echo htmlspecialchars($dailyDoubleValue); ?>">
                    <label for="wager">Enter your wager:</label>
                    <input type="number" id="wager" name="wager" min="5" max="<?php echo $maxWager; ?>"
                        value="<?php echo $maxWager; ?>" required autofocus>
                    <button type="submit" class="submit-btn">Lock In Wager</button>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($showDailyDoubleQuestion && $gameStarted): ?>
        <!-- Daily Double Question -->
        <div class="question-overlay">
            <audio class="daily-double-audio" autoplay loop>
                <source src="Assets/Sounds/krakoa overtime.wav" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
            <div class="question-card daily-double-question-card">
                <div class="question-header">
                    <span class="question-category"><?php echo $dailyDoubleCategory; ?></span>
                    <span class="question-value">DAILY DOUBLE</span>
                </div>
                <div class="player-indicator">Player <?php echo $currentTurn; ?> - Wager:
                    $<?php echo $_SESSION['daily_double_wager'] ?? 0; ?></div>
                <?php
                // Find the question for this Daily Double
                $ddQuestion = '';
                if (isset($_SESSION['question_map'][$dailyDoubleCategory][$dailyDoubleValue])) {
                    $ddQuestion = $_SESSION['question_map'][$dailyDoubleCategory][$dailyDoubleValue];
                }
                ?>
                <?php if ($ddQuestion): ?>
                    <div class="question-text"><?php echo htmlspecialchars($ddQuestion); ?></div>
                <?php endif; ?>
                <form method="POST" action="2P.php" class="answer-form">
                    <input type="hidden" name="category" value="<?php echo htmlspecialchars($dailyDoubleCategory); ?>">
                    <input type="hidden" name="value" value="<?php echo htmlspecialchars($dailyDoubleValue); ?>">
                    <input type="hidden" name="question" value="<?php echo htmlspecialchars($ddQuestion); ?>">
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
        <!-- Question Form Overlay -->
        <div class="question-overlay">
            <div class="question-card">
                <div class="question-header">
                    <span class="question-category"><?php echo $category; ?></span>
                    <span class="question-value"><?php echo $value; ?></span>
                </div>
                <div class="player-indicator">Player <?php echo $currentTurn; ?> is answering...</div>
                <?php if ($selectedQuestion): ?>
                    <div class="question-text"><?php echo htmlspecialchars($selectedQuestion); ?></div>
                <?php endif; ?>
                <form method="POST" action="2P.php" class="question-form">
                    <input type="hidden" name="category" value="<?php echo $category; ?>">
                    <input type="hidden" name="value" value="<?php echo $value; ?>">
                    <input type="hidden" name="question" value="<?php echo htmlspecialchars($selectedQuestion); ?>">
                    <label for="answer" class="question-label">Enter your answer:</label>
                    <input type="text" id="answer" name="answer" class="question-input" autofocus required>
                    <div class="question-buttons">
                        <button type="submit" class="submit-btn">Submit</button>
                        <a href="2P.php" class="cancel-btn">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($showFeedback && $feedbackData): ?>
        <!-- Feedback Overlay -->
        <div class="question-overlay">
            <div
                class="question-card <?php echo $feedbackData['is_correct'] ? 'feedback-correct' : 'feedback-incorrect'; ?>">
                <div class="feedback-result">
                    <?php if ($feedbackData['is_correct']): ?>
                        <div class="feedback-icon">✓</div>
                        <h2>CORRECT!</h2>
                    <?php else: ?>
                        <div class="feedback-icon">✗</div>
                        <h2>INCORRECT</h2>
                        <div class="feedback-answer">
                            <p><strong>Your answer:</strong> <?php echo htmlspecialchars($feedbackData['user_answer']); ?></p>
                            <p><strong>Correct answer:</strong> <?php echo htmlspecialchars($feedbackData['correct_answer']); ?>
                            </p>
                        </div>
                    <?php endif; ?>
                </div>
                <div class="question-buttons">
                    <a href="2P.php" class="submit-btn">Continue</a>
                </div>
            </div>
        </div>
    <?php endif; ?>

    <!-- Flex Row with Player Elements -->
    <div class="jeopardy-flex-row">
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
        <div class="jeopardy-grid">
            <!-- Category Row -->
            <?php $categories = ['People', 'Powers', 'Artifacts', 'Media', 'Teams', 'Places']; ?>
            <?php foreach ($categories as $cat): ?>
                <div class="grid-cell category-cell"><?= $cat ?></div>
            <?php endforeach; ?>
            <!-- Value Rows -->
            <?php $values = ['$200', '$400', '$600', '$800', '$1000']; ?>
            <?php foreach ($values as $val): ?>
                <?php foreach ($categories as $cat): ?>
                    <?php $cellKey = $cat . '|' . $val; ?>
                    <?php $isUsed = isset($_SESSION['used_cells'][$cellKey]); ?>
                    <?php $isDailyDouble = ($cellKey === $dailyDoubleKey); ?>
                    <?php if ($isUsed): ?>
                        <div class="grid-cell value-cell used-cell"><?= $val ?></div>
                    <?php else: ?>
                        <?php $link = $isDailyDouble ? "2P.php?show_wager=1&category=$cat&value=$val" : "2P.php?category=$cat&value=$val"; ?>
                        <a href="<?= $link ?>"
                            class="grid-cell value-cell<?= $isDailyDouble ? ' daily-double-cell' : '' ?>"><?= $val ?></a>
                    <?php endif; ?>
                <?php endforeach; ?>
            <?php endforeach; ?>
        </div>
        <div class="player-block <?= ($gameStarted && $currentTurn == 2) ? 'active-player' : '' ?>">
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
    </div>
</body>

</html>