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
    $categories = ['People','Powers','Artifacts','Media','Teams','Places'];
    $values = ['$200','$400','$600','$800','$1000'];
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
if (isset($_POST['player']) && isset($_POST['guess']) && !$_SESSION['game_started']) {

    $p = (int)$_POST['player'];
    $g = (int)$_POST['guess'];

    if ($g >= 1 && $g <= 50 && $_SESSION['guesses'][$p] === null) {
        $_SESSION['guesses'][$p] = $g;
    }

    // All players guessed → determine winner
    if (!in_array(null, $_SESSION['guesses'])) {

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

/* ============================================================
   CLICKING A CELL (open question card)
   ============================================================ */
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

        $showForm = true;
        $isDailyDouble = ($_SESSION['daily_double'] === $key);

        // Pull question text from question_map
        $questionText = $_SESSION['question_map'][$category][$value];
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
    $points = (int)str_replace(['$'], "", $value);

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
    <title>4 Player Jeopardy!</title>
    <link rel="stylesheet" href="marvel.css">
</head>

<body class="game-page">

<!-- HEADER -->
<div class="title">
    <a href="4P.php?reset=1" class="title-wrapper">
        <span class="title-marvel">MARVEL</span>
        <span class="title-jeopardy">Jeopardy!</span>
    </a>
</div>

<!-- ============================================================
     NUMBER GUESSING
============================================================ -->
<?php if (!$_SESSION['game_started']): ?>
<div class="question-overlay">
    <div class="question-card number-guess-card">

        <h2 class="guess-title">Who Goes First?</h2>
        <p class="guess-instructions">Pick a number between 1 and 50.</p>

        <div class="guess-container">
            <?php foreach ($_SESSION['player_names'] as $i => $name): ?>
                <div class="player-guess-section">
                    <h3><?= htmlspecialchars($name) ?></h3>

                    <?php if ($_SESSION['guesses'][$i] === null): ?>
                        <form method="POST">
                            <input type="hidden" name="player" value="<?= $i ?>">
                            <input type="number" name="guess" min="1" max="50" required>
                            <button class="submit-btn">Submit</button>
                        </form>
                    <?php else: ?>
                        <div class="guess-submitted">✓ Submitted</div>
                    <?php endif; ?>

                </div>
            <?php endforeach; ?>
        </div>

        <!-- All numbers submitted -->
        <?php if (!in_array(null, $_SESSION['guesses'])): ?>
            <div class="guess-results">
                <h3>Results</h3>
                <p>Target Number: <strong><?= $_SESSION['target_number'] ?></strong></p>

                <?php foreach ($_SESSION['guesses'] as $i => $g): ?>
                    <p><?= $_SESSION['player_names'][$i] ?> guessed <strong><?= $g ?></strong></p>
                <?php endforeach; ?>

                <p class="winner-announce">
                    <?= $_SESSION['player_names'][$_SESSION['current_turn']] ?> goes first!
                </p>

                <a href="4P.php" class="submit-btn">Start Game</a>
            </div>
        <?php endif; ?>

    </div>
</div>
<?php endif; ?>

<!-- ============================================================
     QUESTION POPUP
============================================================ -->
<?php if ($showForm): ?>
<div class="question-overlay">
    <div class="question-card">

        <div class="question-header">
            <span class="question-category"><?= $category ?></span>
            <span class="question-value"><?= $value ?></span>
        </div>

        <?php if ($isDailyDouble): ?>
            <div class="question-text dd-text">DAILY DOUBLE!!!</div>
        <?php endif; ?>

        <div class="question-text">
            <?= htmlspecialchars($questionText) ?>
        </div>

        <form method="POST">

            <input type="hidden" name="category" value="<?= $category ?>">
            <input type="hidden" name="value" value="<?= $value ?>">
            <input type="hidden" name="question_text" value="<?= htmlspecialchars($questionText) ?>">

            <label class="question-label">
                Answer (<?= $_SESSION['player_names'][$_SESSION['current_turn']] ?>):
            </label>
            <input type="text" name="answer" class="question-input" required>

            <button name="answer_submit" class="submit-btn">Submit Answer</button>
            <a href="4P.php" class="cancel-btn">Cancel</a>
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
        <?php for ($i=1; $i<=2; $i++): ?>
            <div class="player-block <?= ($_SESSION['current_turn']==$i ? 'active-player' : '') ?>">
                <div class="score-box">$<?= $_SESSION['player_scores'][$i] ?></div>
                <div class="player-icon"></div>
                <div class="player-label"><?= htmlspecialchars($_SESSION['player_names'][$i]) ?></div>
                <?php if ($_SESSION['current_turn']==$i): ?>
                    <div class="turn-indicator">Your Turn</div>
                <?php endif; ?>
            </div>
        <?php endfor; ?>
    </div>

    <!-- GAME GRID -->
    <div class="jeopardy-grid">

        <?php
        $cats = ['People','Powers','Artifacts','Media','Teams','Places'];
        $vals = ['$200','$400','$600','$800','$1000'];

        // header row
        foreach ($cats as $c) {
            echo "<div class='grid-cell category-cell'>$c</div>";
        }

        // value rows
        foreach ($vals as $v) {
            foreach ($cats as $c) {
                $key = "$c|$v";
                if (isset($_SESSION['used_cells'][$key])) {
                    echo "<div class='grid-cell value-cell used-cell'>$v</div>";
                } else {
                    echo "<a class='grid-cell value-cell' href='4P.php?category=$c&value=$v'>$v</a>";
                }
            }
        }
        ?>

    </div>

    <!-- RIGHT SIDE PLAYERS -->
    <div style="display:flex;flex-direction:column;gap:20px;">
        <?php for ($i=3; $i<=4; $i++): ?>
            <div class="player-block <?= ($_SESSION['current_turn']==$i ? 'active-player' : '') ?>">
                <div class="score-box">$<?= $_SESSION['player_scores'][$i] ?></div>
                <div class="player-icon"></div>
                <div class="player-label"><?= htmlspecialchars($_SESSION['player_names'][$i]) ?></div>
                <?php if ($_SESSION['current_turn']==$i): ?>
                    <div class="turn-indicator">Your Turn</div>
                <?php endif; ?>
            </div>
        <?php endfor; ?>
    </div>

</div>

</body>
</html>
