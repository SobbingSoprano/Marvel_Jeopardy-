<?php
session_start();

/*
==================================================
 FINAL JEOPARDY — UNIVERSAL FOR 2P / 3P / 4P
==================================================
*/

// SAFETY CHECK: If players didn’t come from 2P/3P/4P page
if (!isset($_SESSION['player_names']) || !isset($_SESSION['player_scores'])) {
    header("Location: index.html");
    exit();
}

// Detect number of players (2, 3, or 4)
$playerNames  = $_SESSION['player_names'];
$playerScores = $_SESSION['player_scores'];
$totalPlayers = count($playerNames);

// Final Jeopardy question (Option A)
$finalQuestion = "What metal is the ONLY known substance capable of cutting through Vibranium?";
$correctAnswers = ["adamantium", "what is adamantium?", "adamantium metal"];

// Stage control
if (!isset($_SESSION['fj_stage'])) {
    $_SESSION['fj_stage'] = "wager";
}

/*
=============================================
 1) WAGER SUBMISSION
=============================================
*/
if ($_SESSION['fj_stage'] === "wager" && $_SERVER["REQUEST_METHOD"] === "POST") {
    $wagers = [];

    for ($i = 1; $i <= $totalPlayers; $i++) {
        $key = "wager_" . $i;
        $wagers[$i] = max(0, (int)$_POST[$key]);

        // Prevent wager > score
        if ($wagers[$i] > $playerScores[$i]) {
            $wagers[$i] = $playerScores[$i];
        }
    }

    $_SESSION['final_wagers'] = $wagers;
    $_SESSION['fj_stage'] = "question";

    header("Location: final_jeopardy.php");
    exit();
}

/*
=============================================
 2) FINAL ANSWER SUBMISSION
=============================================
*/
if ($_SESSION['fj_stage'] === "question" && $_SERVER["REQUEST_METHOD"] === "POST") {
    $answers = [];
    $results = [];

    foreach ($playerNames as $i => $name) {
        $ansKey = "answer_" . $i;
        $userAnswer = strtolower(trim($_POST[$ansKey] ?? ""));

        $isCorrect = in_array($userAnswer, $correctAnswers);

        $answers[$i] = $userAnswer;
        $results[$i] = $isCorrect;
    }

    $_SESSION['final_answers'] = $answers;
    $_SESSION['final_results'] = $results;
    $_SESSION['fj_stage'] = "results";

    // Score adjustments
    foreach ($results as $i => $correct) {
        $wager = $_SESSION['final_wagers'][$i];

        if ($correct) {
            $_SESSION['player_scores'][$i] += $wager;
        } else {
            $_SESSION['player_scores'][$i] -= $wager;
        }
    }

    header("Location: final_jeopardy.php");
    exit();
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Final Jeopardy!</title>
    <link rel="stylesheet" href="marvel.css">
</head>

<body class="game-page">

<div class="title">
    <span class="title-marvel">MARVEL</span>
    <span class="title-jeopardy">Jeopardy!</span>
</div>

<?php if ($_SESSION['fj_stage'] === "wager"): ?>

<!-- =====================================================
     WAGER SCREEN
===================================================== -->
<div class="question-overlay">
    <div class="question-card">
        <h2 class="guess-title">FINAL JEOPARDY WAGER</h2>
        <p class="guess-instructions">How much will each player wager?</p>

        <form method="POST" class="question-form">

            <?php for ($i = 1; $i <= $totalPlayers; $i++): ?>
                <label class="question-label">
                    <?php echo htmlspecialchars($playerNames[$i]); ?> (Score: $<?php echo $playerScores[$i]; ?>)
                </label>
                <input type="number" 
                       min="0" max="<?php echo $playerScores[$i]; ?>"
                       name="wager_<?php echo $i; ?>" 
                       required class="question-input">
            <?php endfor; ?>

            <button type="submit" class="submit-btn">Submit Wagers</button>
        </form>
    </div>
</div>

<?php endif; ?>


<?php if ($_SESSION['fj_stage'] === "question"): ?>

<!-- =====================================================
     FINAL QUESTION SCREEN
===================================================== -->
<div class="question-overlay">
    <div class="question-card">

        <h2 class="guess-title">FINAL JEOPARDY QUESTION</h2>

        <div class="question-text">
            <?php echo $finalQuestion; ?>
        </div>

        <form method="POST" class="question-form">
            <?php foreach ($playerNames as $i => $name): ?>
                <label class="question-label"><?php echo htmlspecialchars($name); ?>’s Answer:</label>
                <input type="text" name="answer_<?php echo $i; ?>" class="question-input" required>
            <?php endforeach; ?>

            <button type="submit" class="submit-btn">Submit Answers</button>
        </form>

    </div>
</div>

<?php endif; ?>


<?php if ($_SESSION['fj_stage'] === "results"): ?>

<!-- =====================================================
     RESULTS SCREEN
===================================================== -->
<div class="question-overlay">
    <div class="question-card">

        <h2 class="guess-title">Final Results</h2>

        <?php
        $answers  = $_SESSION['final_answers'];
        $results  = $_SESSION['final_results'];
        $finalScores = $_SESSION['player_scores'];

        // Determine winner(s)
        $maxScore = max($finalScores);
        ?>

        <?php foreach ($playerNames as $i => $name): ?>
            <div class="feedback-answer" style="margin-bottom: 20px;">
                <p><strong><?php echo htmlspecialchars($name); ?>:</strong></p>
                <p>Your Answer: <?php echo htmlspecialchars($answers[$i]); ?></p>
                <p>Result: 
                    <?php echo $results[$i] ? "<span style='color:#00ff00;'>Correct</span>" 
                                            : "<span style='color:#ff0000;'>Incorrect</span>"; ?>
                </p>
                <p>Final Score: $<?php echo $finalScores[$i]; ?></p>
            </div>
        <?php endforeach; ?>

        <h2 class="guess-title">Winner:</h2>
        <div class="question-text" style="font-size: 2em; color: #00ff00;">
            <?php
            $winners = [];
            foreach ($finalScores as $i => $s) {
                if ($s == $maxScore) $winners[] = $playerNames[$i];
            }
            echo implode(" & ", $winners);
            ?>
        </div>

        <a href="index.html" class="submit-btn" style="margin-top: 20px;">Return to Main Menu</a>

    </div>
</div>

<?php endif; ?>

</body>
</html>
