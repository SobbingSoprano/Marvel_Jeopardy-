<?php
session_start();

/* ============================================================
   Load Questions + Functions
   ============================================================ */
include "questions.php"; // This defines $allQuestions variable and functions

/* ============================================================
   INITIAL GAME SETUP
   ============================================================ */
if (!isset($_SESSION['4p_initialized'])) {

    $_SESSION['4p_initialized'] = true;
    $_SESSION['game_started'] = false;

    // 1–50 number guessing for turn order
    $_SESSION['target_number'] = rand(1, 50);
    $_SESSION['guesses'] = [1 => null, 2 => null, 3 => null, 4 => null];

    // Player names (from name entry page)
    $_SESSION['player_names'] = $_SESSION['player_names'] ?? [
        1 => "Player 1",
        2 => "Player 2",
        3 => "Player 3",
        4 => "Player 4"
    ];

    // Scores
    $_SESSION['player_scores'] = [1 => 0, 2 => 0, 3 => 0, 4 => 0];

    // Used cells
    $_SESSION['used_cells'] = [];

    // Select Daily Double cell randomly
    $categories = ['People', 'Powers', 'Artifacts', 'Media', 'Teams', 'Places'];
    $values = ['$200', '$400', '$600', '$800', '$1000'];
    $_SESSION['daily_double'] =
        $categories[array_rand($categories)] . "|" .
        $values[array_rand($values)];

    // Create question map
    $_SESSION['question_map'] = getRandomizedQuestionMap($allQuestions);
}

/* ============================================================
   RESET GAME
   ============================================================ */
if (isset($_GET['reset'])) {
    session_unset();
    session_destroy();
    header("Location: 4P.php");
    exit();
}

/* ============================================================
   HANDLE NUMBER GUESSING (BEFORE GAME STARTS)
   ============================================================ */
if (isset($_POST['all_guesses'])) {
    $allValid = true;
    for ($i = 1; $i <= 4; $i++) {
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
    header("Location: 4P.php");
    exit();
}

// Daily Double state
$showDDWager = false;
$showDDQuestion = false;
$ddCategory = '';
$ddValue = '';
$ddQuestion = '';
$ddMaxWager = 0;
$ddPlayerScore = 0;
$ddWager = 0;

// Handle Daily Double wager submission
if (isset($_POST['dd_wager']) && isset($_POST['dd_category']) && isset($_POST['dd_value'])) {
    $_SESSION['dd_wager'] = (int) $_POST['dd_wager'];
    $_SESSION['dd_category'] = $_POST['dd_category'];
    $_SESSION['dd_value'] = $_POST['dd_value'];
    header("Location: 4P.php?daily_double=1&category=" . urlencode($_POST['dd_category']) . "&value=" . urlencode($_POST['dd_value']));
    exit();
}

// Open cell logic
$showForm = false;
$category = "";
$value = "";
$questionText = "";
$isDailyDouble = false;

if (isset($_GET['category']) && isset($_GET['value']) && $_SESSION['game_started']) {
    $category = $_GET['category'];
    $value = $_GET['value'];
    $key = "$category|$value";
    if (!isset($_SESSION['used_cells'][$key])) {
        $isDailyDouble = ($_SESSION['daily_double'] === $key);
        // Daily Double wager overlay
        if ($isDailyDouble && (!isset($_GET['daily_double']) || $_GET['daily_double'] != 1)) {
            $showDDWager = true;
            $ddCategory = $category;
            $ddValue = $value;
            $ddPlayerScore = $_SESSION['player_scores'][$_SESSION['current_turn']];
            $ddCardValue = (int) str_replace('$', '', $value);
            $ddMaxWager = $ddPlayerScore > 0 ? $ddPlayerScore : $ddCardValue;
        } elseif ($isDailyDouble && isset($_GET['daily_double']) && $_GET['daily_double'] == 1) {
            $showDDQuestion = true;
            $ddCategory = $category;
            $ddValue = $value;
            $ddWager = $_SESSION['dd_wager'] ?? 0;
            $ddQuestion = $_SESSION['question_map'][$category][$value];
        } else {
            $showForm = true;
            $questionText = $_SESSION['question_map'][$category][$value];
        }
    }
}

/* ============================================================
   SUBMITTING AN ANSWER
   ============================================================ */
if (isset($_POST['answer_submit'])) {

    $category = $_POST['category'];
    $value = $_POST['value'];
    $question = $_POST['question_text'];
    $answer = trim(strtolower($_POST['answer']));
    $turn = $_SESSION['current_turn'];

    // Find correct answers
    $correctList = getCorrectAnswers($allQuestions, $category, $value, $question);

    // Compare (case insensitive)
    $correct = array_map('strtolower', $correctList);
    $isCorrect = in_array($answer, $correct);

    // Points
    $points = (int) str_replace(['$'], "", $value);

    // Daily Double? (double the money)
    $key = "$category|$value";
    if ($key === $_SESSION['daily_double']) {
        $points *= 2;
    }

    // Score update
    if ($isCorrect) {
        $_SESSION['player_scores'][$turn] += $points;
    } else {
        $_SESSION['player_scores'][$turn] -= $points;
    }

    // Mark cell as completed
    $_SESSION['used_cells'][$key] = true;

    // Rotate turn 1→2→3→4→1
    $_SESSION['current_turn']++;
    if ($_SESSION['current_turn'] > 4) {
        $_SESSION['current_turn'] = 1;
    }

    // All 30 cells used → Final Jeopardy
    if (count($_SESSION['used_cells']) >= 30) {
        header("Location: final_jeopardy.php");
        exit();
    }

    header("Location: 4P.php");
    exit();
}

?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marvel Jeopardy! - 4 Players</title>
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bungee&family=Monoton&family=Six+Caps&display=swap"
        rel="stylesheet">
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
        <a href="4P.php?reset=1" class="title-wrapper"
            onclick="return confirm('Are you sure you want to reset the game?');">
            <span class="title-marvel">MARVEL</span>
            <span class="title-jeopardy">Jeopardy!</span>
        </a>
    </div>
    <!-- Audio Player (only play on non-Daily Double screens) -->
    <?php
    // Only play match audio if not showing Daily Double wager or question overlays
    if (
        (!isset($showDDWager) || !$showDDWager)
        && (!isset($showDDQuestion) || !$showDDQuestion)
        && (empty($showForm) || !$isDailyDouble)
    ): ?>
        <audio class="audio-player game-audio" controls loop autoplay>
            <source src="Assets/Sounds/krakoa match.wav" type="audio/wav">
            Your browser does not support the audio element.
        </audio>
    <?php endif; ?>

    <!-- Number Guessing Screen -->
    <?php if (!$_SESSION['game_started']): ?>
        <div class="question-overlay">
            <div class="question-card number-guess-card">
                <h2 class="guess-title">Who Goes First?</h2>
                <p class="guess-instructions">Each player picks a number between 1-50. Closest to the target wins!</p>
                <form method="POST" action="4P.php" class="guess-form" style="width:100%;">
                    <div class="guess-container">
                        <?php for ($i = 1; $i <= 4; $i++): ?>
                            <div class="player-guess-section">
                                <h3>Player <?= $i ?></h3>
                                <label for="guess<?= $i ?>">Pick a number (1-50):</label>
                                <input type="number" id="guess<?= $i ?>" name="guess[<?= $i ?>]" min="1" max="50" required
                                    value="<?= isset($_SESSION['guesses'][$i]) ? $_SESSION['guesses'][$i] : '' ?>">
                            </div>
                        <?php endfor; ?>
                    </div>
                    <div style="text-align:center; margin-top:2em;">
                        <button type="submit" name="all_guesses" class="cancel-btn">Submit All Guesses</button>
                    </div>
                </form>
                <?php if (!in_array(null, $_SESSION['guesses'])): ?>
                    <div class="guess-results">
                        <h3>Results:</h3>
                        <p>Target Number: <strong><?= $_SESSION['target_number'] ?></strong></p>
                        <?php for ($i = 1; $i <= 4; $i++): ?>
                            <p><?= htmlspecialchars($_SESSION['player_names'][$i]) ?> guessed:
                                <strong><?= $_SESSION['guesses'][$i] ?></strong> (off by
                                <?= abs($_SESSION['target_number'] - $_SESSION['guesses'][$i]) ?>)
                            </p>
                        <?php endfor; ?>
                        <p class="winner-announce"><?= htmlspecialchars($_SESSION['player_names'][$_SESSION['current_turn']]) ?>
                            goes first!</p>
                        <a href="4P.php" class="submit-btn">Start Game</a>
                    </div>
                <?php else: ?>
                    <div style="text-align:center; margin-top:2em;">
                        <a href="index.html" class="cancel-btn" style="margin-top:1em;">Back to Homepage</a>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    <?php endif; ?>

    <!-- Daily Double Wager Overlay -->
    <?php if ($showDDWager): ?>
        <div class="question-overlay">
            <audio class="daily-double-audio" autoplay loop>
                <source src="Assets/Sounds/krakoa overtime.wav" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
            <div class="question-card daily-double-card">
                <div class="daily-double-header">
                    <h1 class="daily-double-title">DAILY DOUBLE!</h1>
                    <p class="daily-double-subtitle">Player <?= $_SESSION['current_turn'] ?>, how much do you want to wager?
                    </p>
                </div>
                <div class="wager-info">
                    <p><strong>Your Current Score:</strong> $<?= $ddPlayerScore ?></p>
                    <p><strong>Maximum Wager:</strong> $<?= $ddMaxWager ?></p>
                </div>
                <form method="POST" action="4P.php" class="wager-form">
                    <input type="hidden" name="dd_category" value="<?= htmlspecialchars($ddCategory) ?>">
                    <input type="hidden" name="dd_value" value="<?= htmlspecialchars($ddValue) ?>">
                    <label for="dd_wager">Enter your wager:</label>
                    <input type="number" id="dd_wager" name="dd_wager" min="5" max="<?= $ddMaxWager ?>"
                        value="<?= $ddMaxWager ?>" required autofocus>
                    <button type="submit" class="submit-btn">Lock In Wager</button>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <!-- Daily Double Question Overlay -->
    <?php if ($showDDQuestion): ?>
        <div class="question-overlay">
            <audio class="daily-double-audio" autoplay loop>
                <source src="Assets/Sounds/krakoa overtime.wav" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
            <div class="question-card daily-double-question-card">
                <div class="question-header">
                    <span class="question-category"><?= htmlspecialchars($ddCategory) ?></span>
                    <span class="question-value">DAILY DOUBLE</span>
                </div>
                <div class="player-indicator">Player <?= $_SESSION['current_turn'] ?> - Wager: $<?= $ddWager ?></div>
                <div class="question-text">
                    <?= htmlspecialchars($ddQuestion) ?>
                </div>
                <form method="POST" action="4P.php" class="question-form">
                    <input type="hidden" name="category" value="<?= htmlspecialchars($ddCategory) ?>">
                    <input type="hidden" name="value" value="<?= htmlspecialchars($ddValue) ?>">
                    <input type="hidden" name="question_text" value="<?= htmlspecialchars($ddQuestion) ?>">
                    <input type="hidden" name="dd_wager" value="<?= $ddWager ?>">
                    <label for="answer" class="question-label">Enter your answer:</label>
                    <input type="text" id="answer" name="answer" class="question-input" autofocus required>
                    <div class="question-buttons">
                        <button name="answer_submit" class="submit-btn">Submit Answer</button>
                        <a href="4P.php" class="cancel-btn">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <!-- Standard Question Form Overlay -->
    <?php if ($showForm): ?>
        <div class="question-overlay">
            <div class="question-card">
                <div class="question-header">
                    <span class="question-category"><?= htmlspecialchars($category) ?></span>
                    <span class="question-value"><?= htmlspecialchars($value) ?></span>
                </div>
                <div class="player-indicator">Player <?= $_SESSION['current_turn'] ?> is answering...</div>
                <div class="question-text">
                    <?= htmlspecialchars($questionText) ?>
                </div>
                <form method="POST" action="4P.php" class="question-form">
                    <input type="hidden" name="category" value="<?= htmlspecialchars($category) ?>">
                    <input type="hidden" name="value" value="<?= htmlspecialchars($value) ?>">
                    <input type="hidden" name="question_text" value="<?= htmlspecialchars($questionText) ?>">
                    <label for="answer" class="question-label">Enter your answer:</label>
                    <input type="text" id="answer" name="answer" class="question-input" autofocus required>
                    <div class="question-buttons">
                        <button name="answer_submit" class="submit-btn">Submit Answer</button>
                        <a href="4P.php" class="cancel-btn">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    <?php endif; ?>

    <!-- ============================================================
     MAIN BOARD + PLAYER SCORES
============================================================ -->
    <div class="jeopardy-flex-row">

        <!-- LEFT SIDE PLAYERS -->
        <div style="display:flex;flex-direction:column;gap:20px;">
            <?php for ($i = 1; $i <= 2; $i++): ?>
                <div class="player-block <?= ($_SESSION['current_turn'] == $i ? 'active-player' : '') ?>">
                    <div class="score-box">$<?= $_SESSION['player_scores'][$i] ?></div>
                    <div class="player-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="#111" viewBox="0 0 48 48">
                            <circle cx="24" cy="18" r="12" />
                            <rect x="8" y="32" width="32" height="12" rx="6" />
                        </svg>
                    </div>
                    <div class="player-label">Player <?= $i ?></div>
                    <?php if ($_SESSION['current_turn'] == $i): ?>
                        <div class="turn-indicator">Your Turn</div>
                    <?php endif; ?>
                </div>
            <?php endfor; ?>
        </div>

        <!-- GAME GRID -->
        <div class="jeopardy-grid">

            <?php
            $cats = ['People', 'Powers', 'Artifacts', 'Media', 'Teams', 'Places'];
            $vals = ['$200', '$400', '$600', '$800', '$1000'];

            // header row
            foreach ($cats as $c) {
                echo "<div class='grid-cell category-cell'>$c</div>";
            }

            // value rows
            foreach ($vals as $v) {
                foreach ($cats as $c) {
                    $key = "$c|$v";
                    $isDailyDouble = ($key === $_SESSION['daily_double']);
                    if (isset($_SESSION['used_cells'][$key])) {
                        echo "<div class='grid-cell value-cell used-cell'" . ($isDailyDouble ? " hidden-daily-double-cell" : "") . ">$v</div>";
                    } else {
                        echo "<a class='grid-cell value-cell" . ($isDailyDouble ? " hidden-daily-double-cell" : "") . "' href='4P.php?category=$c&value=$v'>$v</a>";
                    }
                }
            }
            ?>

        </div>

        <!-- RIGHT SIDE PLAYERS -->
        <div style="display:flex;flex-direction:column;gap:20px;">
            <?php for ($i = 3; $i <= 4; $i++): ?>
                <div class="player-block <?= ($_SESSION['current_turn'] == $i ? 'active-player' : '') ?>">
                    <div class="score-box">$<?= $_SESSION['player_scores'][$i] ?></div>
                    <div class="player-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="#111" viewBox="0 0 48 48">
                            <circle cx="24" cy="18" r="12" />
                            <rect x="8" y="32" width="32" height="12" rx="6" />
                        </svg>
                    </div>
                    <div class="player-label">Player <?= $i ?></div>
                    <?php if ($_SESSION['current_turn'] == $i): ?>
                        <div class="turn-indicator">Your Turn</div>
                    <?php endif; ?>
                </div>
            <?php endfor; ?>
        </div>

    </div>

</body>

</html>