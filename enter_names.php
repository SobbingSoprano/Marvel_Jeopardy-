<?php
session_start();

// Ensure ?players=# was passed
if (!isset($_GET['players']) || !in_array($_GET['players'], ['2','3','4'])) {
    header("Location: index.html");
    exit;
}

$playerCount = intval($_GET['players']);

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // Save names to session
    for ($i = 1; $i <= $playerCount; $i++) {
        $field = "player{$i}_name";
        $_SESSION[$field] = trim($_POST[$field]) !== "" ? trim($_POST[$field]) : "Player {$i}";
    }

    // Redirect to the correct game file
    if ($playerCount === 2) header("Location: 2P.php");
    if ($playerCount === 3) header("Location: 3P.php");
    if ($playerCount === 4) header("Location: 4P.php");

    exit;
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enter Player Names</title>

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bungee&family=Monoton&family=Six+Caps&display=swap"
        rel="stylesheet">

    <!-- Stylesheet -->
    <link rel="stylesheet" href="marvel.css">

</head>

<body class="game-page">

    <!-- Title -->
    <div class="title">
        <div class="title-wrapper">
            <span class="title-marvel">MARVEL</span>
            <span class="title-jeopardy">Jeopardy!</span>
        </div>
    </div>

    <div class="name-entry-container">
        <div class="name-entry-card">
            <h2 class="name-entry-title">Enter Player Names</h2>
            <p class="name-entry-sub">Mode: <?php echo $playerCount; ?> Player<?php echo $playerCount > 1 ? 's' : ''; ?></p>

            <form method="POST" action="" class="name-form">

                <?php for ($i = 1; $i <= $playerCount; $i++): ?>
                    <div class="name-field">
                        <label for="player<?php echo $i; ?>_name">
                            Player <?php echo $i; ?> Name:
                        </label>
                        <input type="text"
                               id="player<?php echo $i; ?>_name"
                               name="player<?php echo $i; ?>_name"
                               placeholder="Enter name..."
                               required>
                    </div>
                <?php endfor; ?>

                <button type="submit" class="submit-btn start-btn">
                    Start Game
                </button>

            </form>

        </div>
    </div>

</body>

</html>
