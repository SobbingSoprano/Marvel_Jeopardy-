<?php
session_start();

// Initialize game state
if (!isset($_SESSION['game_initialized'])) {
    $_SESSION['game_initialized'] = true;
    $_SESSION['game_started'] = false; // Game hasn't started yet
    $_SESSION['target_number'] = rand(1, 50); // Random number for guessing
    $_SESSION['player1_guess'] = null;
    $_SESSION['player2_guess'] = null;
    $_SESSION['player1_score'] = 0;
    $_SESSION['player2_score'] = 0;
    $_SESSION['current_turn'] = null; // Will be determined by number guessing
    
    // Initialize Daily Double cells (2 random cells)
    $categories = ['People', 'Powers', 'Artifacts', 'Media', 'Teams', 'Places'];
    $values = ['$200', '$400', '$600', '$800', '$1000'];
    $allCells = [];
    foreach ($categories as $cat) {
        foreach ($values as $val) {
            $allCells[] = $cat . '|' . $val;
        }
    }
    shuffle($allCells);
    $_SESSION['daily_doubles'] = [
        $allCells[0] => true,
        $allCells[1] => true
    ];
}

// Close session writing early to allow concurrent requests
session_write_close();

// Handle game reset
if (isset($_GET['reset']) && $_GET['reset'] === '1') {
    session_start();
    session_unset();
    session_destroy();
    header('Location: 2P.php');
    exit;
}

// Handle number guess submission
if (isset($_POST['player']) && isset($_POST['guess'])) {
    session_start();
    $player = (int)$_POST['player'];
    $guess = (int)$_POST['guess'];
    
    if ($player === 1 && $_SESSION['player1_guess'] === null && $guess !== $_SESSION['player2_guess']) {
        $_SESSION['player1_guess'] = $guess;
    } elseif ($player === 2 && $_SESSION['player2_guess'] === null && $guess !== $_SESSION['player1_guess']) {
        $_SESSION['player2_guess'] = $guess;
    }
    
    // Check if both players have guessed
    if ($_SESSION['player1_guess'] !== null && $_SESSION['player2_guess'] !== null) {
        $target = $_SESSION['target_number'];
        $diff1 = abs($target - $_SESSION['player1_guess']);
        $diff2 = abs($target - $_SESSION['player2_guess']);
        
        // Determine winner (closest to target)
        if ($diff1 < $diff2) {
            $_SESSION['current_turn'] = 1;
        } elseif ($diff2 < $diff1) {
            $_SESSION['current_turn'] = 2;
        } else {
            // Tie - random
            $_SESSION['current_turn'] = rand(1, 2);
        }
        
        $_SESSION['game_started'] = true;
    }
    
    session_write_close();
    header('Location: 2P.php');
    exit;
}

// Define all questions with answers
$questions = [
    // People
    ['category' => 'People', 'value' => '$200', 'question' => 'This genius billionaire created the Iron Man suit in a cave.', 'answer' => ['Who is Tony Stark?', 'Tony Stark', 'Who is Iron Man?', 'Iron Man']],
    ['category' => 'People', 'value' => '$200', 'question' => 'This web-slinger was bitten by a radioactive spider in Queens.', 'answer' => ['Who is Spiderman?', 'Spiderman', 'Who is Spider-Man?', 'Spider-Man', 'Who is Peter Parker?', 'Peter Parker']],
    ['category' => 'People', 'value' => '$200', 'question' => 'He is known as the "God of Thunder" and hails from Asgard.', 'answer' => ['Who is Thor?', 'Thor']],

    ['category' => 'People', 'value' => '$400', 'question' => 'This Avenger trained as a spy in the Red Room before joining SHIELD.', 'answer' => ['Who is Natasha Romanoff?', 'Natasha Romanoff', 'Who is Black Widow?', 'Black Widow']],
    ['category' => 'People', 'value' => '$400', 'question' => 'This Avenger had a family hidden from the team, eventually revealed in Age of Ultron.', 'answer' => ['Who is Hawkeye?', 'Hawkeye', 'Who is Clint Barton?', 'Clint Barton']],
    ['category' => 'People', 'value' => '$400', 'question' => 'She pilots the Wasp suit alongside her father\'s legacy.', 'answer' => ['Who is Hope van Dyne?', 'Hope van Dyne', 'Who is the Wasp?', 'Wasp', 'Who is Wasp?']],

    ['category' => 'People', 'value' => '$600', 'question' => 'This hero is the self-proclaimed legendary outlaw and leader of the Guardians.', 'answer' => ['Who is Star-Lord?', 'Star-Lord', 'Who is Peter Quill?', 'Peter Quill']],
    ['category' => 'People', 'value' => '$600', 'question' => 'This sorcerer learns to manipulate time and space at Kamar-Taj.', 'answer' => ['Who is Doctor Strange?', 'Doctor Strange', 'Who is Stephen Strange?', 'Stephen Strange']],
    ['category' => 'People', 'value' => '$600', 'question' => 'This mercenary with a healing factor occasionally aligns with the Avengers.', 'answer' => ['Who is Deadpool?', 'Deadpool', 'Who is Wade Wilson?', 'Wade Wilson']],

    ['category' => 'People', 'value' => '$800', 'question' => 'This genius noticed the energy signature of Loki\'s scepter that others ignored.', 'answer' => ['Who is Tony Stark?', 'Tony Stark', 'Who is Iron Man?', 'Iron Man']],
    ['category' => 'People', 'value' => '$800', 'question' => 'This Eternal becomes the leader of the group on Earth.', 'answer' => ['Who is Sersi?', 'Sersi']],
    ['category' => 'People', 'value' => '$800', 'question' => 'This scientist uncovered the truth behind Ultron\'s creation.', 'answer' => ['Who is Bruce Banner?', 'Bruce Banner', 'Who is the Hulk?', 'Hulk', 'Who is Hulk?']],

    ['category' => 'People', 'value' => '$1000', 'question' => 'This S.H.I.E.L.D. agent was deployed solo for Project PEGASUS surveillance.', 'answer' => ['Who is Phil Coulson?', 'Phil Coulson', 'Who is Agent Coulson?', 'Agent Coulson']],
    ['category' => 'People', 'value' => '$1000', 'question' => 'This future S.H.I.E.L.D. director secretly monitored Tony Stark in the 1990s.', 'answer' => ['Who is Nick Fury?', 'Nick Fury']],
    ['category' => 'People', 'value' => '$1000', 'question' => 'This sorcerer\'s origin involves a mystical artifact stolen from a New York museum.', 'answer' => ['Who is Wong?', 'Wong']],

    // Powers
    ['category' => 'Powers', 'value' => '$200', 'question' => 'Captain America\'s enhanced strength derives from this chemical.', 'answer' => ['What is super soldier serum?', 'super soldier serum', 'What is the super soldier serum?', 'the super soldier serum']],
    ['category' => 'Powers', 'value' => '$200', 'question' => 'Black Panther\'s suit has this ability to store and release energy.', 'answer' => ['What is kinetic energy absorption?', 'kinetic energy absorption', 'What is energy absorption?', 'energy absorption']],
    ['category' => 'Powers', 'value' => '$200', 'question' => 'Black Widow has this heightened physical ability due to her training.', 'answer' => ['What is enhanced agility?', 'enhanced agility', 'What is agility?', 'agility']],

    ['category' => 'Powers', 'value' => '$400', 'question' => 'Scarlet Witch wields this reality-altering power.', 'answer' => ['What is chaos magic?', 'chaos magic', 'What is magic?', 'magic']],
    ['category' => 'Powers', 'value' => '$400', 'question' => 'Hawkeye possesses this superhuman accuracy ability.', 'answer' => ['What is enhanced marksmanship?', 'enhanced marksmanship', 'What is marksmanship?', 'marksmanship']],
    ['category' => 'Powers', 'value' => '$400', 'question' => 'Doctor Strange can use this ability to travel instantly between locations.', 'answer' => ['What is portal creation?', 'portal creation', 'What is teleportation?', 'teleportation']],

    ['category' => 'Powers', 'value' => '$600', 'question' => 'Ant-Man uses this power to access the subatomic realm.', 'answer' => ['What is quantum manipulation?', 'quantum manipulation', 'What is shrinking?', 'shrinking']],
    ['category' => 'Powers', 'value' => '$600', 'question' => 'Vision and Kitty Pryde share this ability.', 'answer' => ['What is intangibility?', 'intangibility', 'What is phasing?', 'phasing']],
    ['category' => 'Powers', 'value' => '$600', 'question' => 'Thor can summon lightning using this elemental power.', 'answer' => ['What is weather manipulation?', 'weather manipulation', 'What is lightning?', 'lightning', 'What is electrokinesis?', 'electrokinesis']],

    ['category' => 'Powers', 'value' => '$800', 'question' => 'Ant-Man used this body-altering ability to escape during the Sokovia Accords.', 'answer' => ['What is shrinking?', 'shrinking', 'What is size manipulation?', 'size manipulation']],
    ['category' => 'Powers', 'value' => '$800', 'question' => 'Captain Marvel can absorb and redirect energy with this power.', 'answer' => ['What is energy absorption?', 'energy absorption']],
    ['category' => 'Powers', 'value' => '$800', 'question' => 'Magneto possesses this ability to control metal.', 'answer' => ['What is magnetism?', 'magnetism', 'What is magnetic manipulation?', 'magnetic manipulation']],

    ['category' => 'Powers', 'value' => '$1000', 'question' => 'Scarlet Witch can alter reality itself using this ancient power.', 'answer' => ['What is reality manipulation?', 'reality manipulation', 'What is chaos magic?', 'chaos magic']],
    ['category' => 'Powers', 'value' => '$1000', 'question' => 'The Eye of Agamotto grants Doctor Strange this control over the fourth dimension.', 'answer' => ['What is time manipulation?', 'time manipulation', 'What is time control?', 'time control']],
    ['category' => 'Powers', 'value' => '$1000', 'question' => 'Captain Marvel and the Eternals wield this universe-level energy.', 'answer' => ['What is cosmic energy?', 'cosmic energy', 'What is cosmic power?', 'cosmic power']],

    // Artifacts
    ['category' => 'Artifacts', 'value' => '$200', 'question' => 'This mystical hammer returns to its owner when thrown.', 'answer' => ['What is Mjolnir?', 'Mjolnir', 'What is Thor\'s hammer?', 'Thor\'s hammer']],
    ['category' => 'Artifacts', 'value' => '$200', 'question' => 'This shield has been passed down through multiple generations.', 'answer' => ['What is Captain America\'s shield?', 'Captain America\'s shield', 'What is the shield?', 'the shield']],
    ['category' => 'Artifacts', 'value' => '$200', 'question' => 'The gauntlet that holds six Infinity Stones.', 'answer' => ['What is the Infinity Gauntlet?', 'the Infinity Gauntlet', 'Infinity Gauntlet']],

    ['category' => 'Artifacts', 'value' => '$400', 'question' => 'Eye of Agamotto is used to manipulate this.', 'answer' => ['What is the Time Stone?', 'the Time Stone', 'Time Stone', 'What is time?', 'time']],
    ['category' => 'Artifacts', 'value' => '$400', 'question' => 'This gem inside Loki\'s scepter controls minds.', 'answer' => ['What is the Mind Stone?', 'the Mind Stone', 'Mind Stone']],
    ['category' => 'Artifacts', 'value' => '$400', 'question' => 'The Cloak of Levitation is bound to this hero.', 'answer' => ['Who is Doctor Strange?', 'Doctor Strange', 'Who is Stephen Strange?', 'Stephen Strange']],

    ['category' => 'Artifacts', 'value' => '$600', 'question' => 'Vibranium shield broken by Thanos.', 'answer' => ['What is Captain America\'s shield?', 'Captain America\'s shield', 'What is the shield?', 'the shield']],
    ['category' => 'Artifacts', 'value' => '$600', 'question' => 'This blade belonged to the Black Panther\'s predecessor.', 'answer' => ['What is the ceremonial dagger?', 'the ceremonial dagger', 'ceremonial dagger']],
    ['category' => 'Artifacts', 'value' => '$600', 'question' => 'A mystical book containing the Darkhold spells.', 'answer' => ['What is the Darkhold?', 'the Darkhold', 'Darkhold']],

    ['category' => 'Artifacts', 'value' => '$800', 'question' => 'Object hidden behind Odin\'s illusion.', 'answer' => ['What is the Casket of Ancient Winters?', 'the Casket of Ancient Winters', 'Casket of Ancient Winters']],
    ['category' => 'Artifacts', 'value' => '$800', 'question' => 'This sword was forged in the heart of a dying star.', 'answer' => ['What is Stormbreaker?', 'Stormbreaker']],
    ['category' => 'Artifacts', 'value' => '$800', 'question' => 'A cube-shaped artifact capable of opening wormholes.', 'answer' => ['What is the Tesseract?', 'the Tesseract', 'Tesseract']],

    ['category' => 'Artifacts', 'value' => '$1000', 'question' => 'Celestial relic predating the universe.', 'answer' => ['What is the Power Stone?', 'the Power Stone', 'Power Stone']],
    ['category' => 'Artifacts', 'value' => '$1000', 'question' => 'Ancient stone that shapes probability fields.', 'answer' => ['What is the Reality Stone?', 'the Reality Stone', 'Reality Stone']],
    ['category' => 'Artifacts', 'value' => '$1000', 'question' => 'Mystic tablet only the sorcerers could read.', 'answer' => ['What is the Book of Cagliostro?', 'the Book of Cagliostro', 'Book of Cagliostro']],

    // Media
    ['category' => 'Media', 'value' => '$200', 'question' => 'This 2008 film introduced the world to Tony Stark\'s genius and sarcasm.', 'answer' => ['What is Iron Man?', 'Iron Man']],
    ['category' => 'Media', 'value' => '$200', 'question' => 'This movie shows the first time the Avengers assemble in New York.', 'answer' => ['What is The Avengers?', 'The Avengers', 'Avengers']],
    ['category' => 'Media', 'value' => '$200', 'question' => 'This Spider-Man film features Peter Parker juggling high school and superhero duties.', 'answer' => ['What is Spider-Man: Homecoming?', 'Spider-Man: Homecoming', 'Homecoming']],

    ['category' => 'Media', 'value' => '$400', 'question' => 'This Disney+ series follows Sam Wilson and Bucky Barnes after the events of Endgame.', 'answer' => ['What is The Falcon and the Winter Soldier?', 'The Falcon and the Winter Soldier', 'Falcon and the Winter Soldier']],
    ['category' => 'Media', 'value' => '$400', 'question' => 'The limited series following Wanda Maximoff as she explores grief and her powers.', 'answer' => ['What is WandaVision?', 'WandaVision']],
    ['category' => 'Media', 'value' => '$400', 'question' => 'A show about a former SHIELD agent who investigates mysterious artifacts and events.', 'answer' => ['What is Agents of S.H.I.E.L.D.?', 'Agents of S.H.I.E.L.D.', 'Agents of SHIELD']],

    ['category' => 'Media', 'value' => '$600', 'question' => 'This film won Marvel its first Academy Award (three Oscars in 2019).', 'answer' => ['What is Black Panther?', 'Black Panther']],
    ['category' => 'Media', 'value' => '$600', 'question' => 'MCU project where T\'Challa\'s role as king and hero is explored deeply.', 'answer' => ['What is Black Panther?', 'Black Panther']],
    ['category' => 'Media', 'value' => '$600', 'question' => 'Movie that introduces Peter Parker to the Avengers while balancing school life.', 'answer' => ['What is Spider-Man: Homecoming?', 'Spider-Man: Homecoming', 'Homecoming']],

    ['category' => 'Media', 'value' => '$800', 'question' => 'In-universe news outlet that reports the "Thunderbolt Ross sighting" after Lagos.', 'answer' => ['What is WHiH Newsfront?', 'WHiH Newsfront', 'WHiH']],
    ['category' => 'Media', 'value' => '$800', 'question' => 'This broadcast covered the Sokovia events from a journalist\'s perspective in a brief clip.', 'answer' => ['What is WHiH Newsfront?', 'WHiH Newsfront', 'WHiH']],
    ['category' => 'Media', 'value' => '$800', 'question' => 'Holo-news report that mistakenly shows the Blip lasting five years for everyone.', 'answer' => ['What is the Daily Bugle?', 'the Daily Bugle', 'Daily Bugle']],

    ['category' => 'Media', 'value' => '$1000', 'question' => 'A documentary that incorrectly portrays Blip events, creating tension among survivors.', 'answer' => ['What is The Making of a Legend?', 'The Making of a Legend']],
    ['category' => 'Media', 'value' => '$1000', 'question' => 'Obscure in-universe doc that analyzes Asgardian refugees arriving on Earth.', 'answer' => ['What is New Asgard: A New Beginning?', 'New Asgard: A New Beginning']],
    ['category' => 'Media', 'value' => '$1000', 'question' => 'A historical recap briefly mentioned showing early Hydra operations before WWII.', 'answer' => ['What is HYDRA Exposed?', 'HYDRA Exposed']],

    // Teams
    ['category' => 'Teams', 'value' => '$200', 'question' => 'Tony Stark and Steve Rogers form this famous superhero collective.', 'answer' => ['What is the Avengers?', 'the Avengers', 'Avengers']],
    ['category' => 'Teams', 'value' => '$200', 'question' => 'This group protects Earth and includes the Hulk, Thor, and Black Widow.', 'answer' => ['What is the Avengers?', 'the Avengers', 'Avengers']],
    ['category' => 'Teams', 'value' => '$200', 'question' => 'The first official Avengers lineup that assembled in 2012.', 'answer' => ['What is the Avengers?', 'the Avengers', 'Avengers']],

    ['category' => 'Teams', 'value' => '$400', 'question' => 'A ragtag group of misfits saved Xandar from Ronan the Accuser.', 'answer' => ['What is the Guardians of the Galaxy?', 'the Guardians of the Galaxy', 'Guardians of the Galaxy', 'Guardians']],
    ['category' => 'Teams', 'value' => '$400', 'question' => 'This intergalactic team includes a raccoon and a tree.', 'answer' => ['What is the Guardians of the Galaxy?', 'the Guardians of the Galaxy', 'Guardians of the Galaxy', 'Guardians']],
    ['category' => 'Teams', 'value' => '$400', 'question' => 'Guardians of the Galaxy team assembled by Peter Quill in space.', 'answer' => ['What is the Guardians of the Galaxy?', 'the Guardians of the Galaxy', 'Guardians of the Galaxy', 'Guardians']],

    ['category' => 'Teams', 'value' => '$600', 'question' => 'Team of sorcerers tasked with protecting Earth from mystical threats.', 'answer' => ['What is the Masters of the Mystic Arts?', 'the Masters of the Mystic Arts', 'Masters of the Mystic Arts']],
    ['category' => 'Teams', 'value' => '$600', 'question' => 'Includes Doctor Strange, Wong, and the Ancient One.', 'answer' => ['What is the Masters of the Mystic Arts?', 'the Masters of the Mystic Arts', 'Masters of the Mystic Arts']],
    ['category' => 'Teams', 'value' => '$600', 'question' => 'A covert organization specializing in magical defense and training.', 'answer' => ['What is Kamar-Taj?', 'Kamar-Taj']],

    ['category' => 'Teams', 'value' => '$800', 'question' => 'Brief team assembled by Fury in the 1990s after Project PEGASUS — never formally announced.', 'answer' => ['What is the Protectors Initiative?', 'the Protectors Initiative', 'Protectors Initiative']],
    ['category' => 'Teams', 'value' => '$800', 'question' => 'A trio that operated secretly before the Avengers were fully formed.', 'answer' => ['What is the Secret Warriors?', 'the Secret Warriors', 'Secret Warriors']],
    ['category' => 'Teams', 'value' => '$800', 'question' => 'Small covert group tasked with monitoring rogue experiments.', 'answer' => ['What is S.T.R.I.K.E.?', 'S.T.R.I.K.E.', 'STRIKE']],

    ['category' => 'Teams', 'value' => '$1000', 'question' => 'Revengers — group formed spontaneously during Sakaar uprising, named offscreen.', 'answer' => ['What is the Revengers?', 'the Revengers', 'Revengers']],
    ['category' => 'Teams', 'value' => '$1000', 'question' => 'A rebel faction that briefly unites to overthrow the Grandmaster.', 'answer' => ['What is the Sakaaran Rebellion?', 'the Sakaaran Rebellion', 'Sakaaran Rebellion']],
    ['category' => 'Teams', 'value' => '$1000', 'question' => 'Fighters who align temporarily under Ajak\'s leadership during the Eternal battle on Earth.', 'answer' => ['What is the Eternals?', 'the Eternals', 'Eternals']],

    // Places
    ['category' => 'Places', 'value' => '$200', 'question' => 'This African nation hides the most advanced technology on Earth.', 'answer' => ['What is Wakanda?', 'Wakanda']],
    ['category' => 'Places', 'value' => '$200', 'question' => 'Country ruled by T\'Challa as king and protector.', 'answer' => ['What is Wakanda?', 'Wakanda']],
    ['category' => 'Places', 'value' => '$200', 'question' => 'Home of Wakandan vibranium mines.', 'answer' => ['What is Wakanda?', 'Wakanda']],

    ['category' => 'Places', 'value' => '$400', 'question' => 'This massive flying S.H.I.E.L.D. base hosts the Avengers\' first meeting.', 'answer' => ['What is the Helicarrier?', 'the Helicarrier', 'Helicarrier']],
    ['category' => 'Places', 'value' => '$400', 'question' => 'HQ for many early SHIELD missions, floating above the ocean.', 'answer' => ['What is the Helicarrier?', 'the Helicarrier', 'Helicarrier']],
    ['category' => 'Places', 'value' => '$400', 'question' => 'Mobile base used in Captain America: The Winter Soldier.', 'answer' => ['What is the Helicarrier?', 'the Helicarrier', 'Helicarrier']],

    ['category' => 'Places', 'value' => '$600', 'question' => 'This New York borough is Spider-Man\'s primary patrol area.', 'answer' => ['What is Queens?', 'Queens']],
    ['category' => 'Places', 'value' => '$600', 'question' => 'Neighborhood where Peter Parker grows up and goes to school.', 'answer' => ['What is Queens?', 'Queens']],
    ['category' => 'Places', 'value' => '$600', 'question' => 'Queens is known for being home to this web-slinging hero.', 'answer' => ['Who is Spider-Man?', 'Spider-Man', 'Spiderman', 'Who is Peter Parker?', 'Peter Parker']],

    ['category' => 'Places', 'value' => '$800', 'question' => 'Location seen holographically in Infinity War, previously housing Kree refugees.', 'answer' => ['What is Knowhere?', 'Knowhere']],
    ['category' => 'Places', 'value' => '$800', 'question' => 'Early refugee colony shown in holographic briefings during the Battle of New York.', 'answer' => ['What is Xandar?', 'Xandar']],
    ['category' => 'Places', 'value' => '$800', 'question' => 'Location implied to be a sanctuary for interstellar refugees before the Collector arrived.', 'answer' => ['What is Knowhere?', 'Knowhere']],

    ['category' => 'Places', 'value' => '$1000', 'question' => 'Exact coordinates unknown; only place with residual Deviant energy after Tiamut\'s fall.', 'answer' => ['What is the Emergence Point?', 'the Emergence Point', 'Emergence Point']],
    ['category' => 'Places', 'value' => '$1000', 'question' => 'Hidden emergence point for the Deviants\' last attack on Earth.', 'answer' => ['What is the Indian Ocean?', 'the Indian Ocean', 'Indian Ocean']],
    ['category' => 'Places', 'value' => '$1000', 'question' => 'Site referenced in Eternals where ancient energy signatures remain measurable.', 'answer' => ['What is Mesopotamia?', 'Mesopotamia']],
];

// Randomize questions WITHIN each category/value combination
if (!isset($_SESSION['question_assignments'])) {
    session_start(); // Reopen session to write
    $_SESSION['question_assignments'] = [];

    // Group questions by category and value
    $grouped = [];
    foreach ($questions as $q) {
        $key = $q['category'] . '|' . $q['value'];
        if (!isset($grouped[$key])) {
            $grouped[$key] = [];
        }
        $grouped[$key][] = $q['question'];
    }

    // Shuffle each group and pick one randomly
    foreach ($grouped as $key => $questionList) {
        shuffle($questionList);
        list($cat, $val) = explode('|', $key);
        $_SESSION['question_assignments'][$cat][$val] = $questionList[0];
    }
    session_write_close(); // Close session again
}

// Function to validate answer
function validateAnswer($userAnswer, $correctAnswers)
{
    // Trim and convert to lowercase for case-insensitive comparison
    $userAnswer = trim(strtolower($userAnswer));
    
    // If correctAnswers is a string, convert to array for backward compatibility
    if (!is_array($correctAnswers)) {
        $correctAnswers = [$correctAnswers];
    }
    
    // Check if user answer matches any of the accepted answers
    foreach ($correctAnswers as $acceptedAnswer) {
        if (trim(strtolower($acceptedAnswer)) === $userAnswer) {
            return true;
        }
    }
    
    return false;
}

// Handle wager submission for Daily Double
if (isset($_POST['wager']) && isset($_POST['category']) && isset($_POST['value'])) {
    session_start();
    $_SESSION['daily_double_wager'] = (int)$_POST['wager'];
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
        session_start(); // Reopen session to write
        
        // Check if this is a Daily Double answer
        $isDailyDouble = isset($_POST['daily_double']) && $_POST['daily_double'] === '1';
        $wager = $isDailyDouble ? ($_SESSION['daily_double_wager'] ?? 0) : 0;
        
        // Find the correct answer from the questions array
        $correctAnswer = '';
        $pointValue = $isDailyDouble ? $wager : (int)str_replace('$', '', $_POST['value']);

        foreach ($questions as $q) {
            if (
                $q['category'] === $_POST['category'] &&
                $q['value'] === $_POST['value'] &&
                $q['question'] === $_POST['question']
            ) {
                $correctAnswer = $q['answer'];
                break;
            }
        }

        // Validate the answer
        $isCorrect = validateAnswer($_POST['answer'], $correctAnswer);
        
        // Update score for active player (current turn)
        $activePlayer = $_SESSION['current_turn'];
        $scoreKey = 'player' . $activePlayer . '_score';
        
        if ($isCorrect) {
            $_SESSION[$scoreKey] += $pointValue;
        } else {
            // For Daily Double, deduct wager; for regular questions, deduct point value
            $_SESSION[$scoreKey] -= $pointValue;
        }
        
        // Clear Daily Double session data if applicable
        if ($isDailyDouble) {
            unset($_SESSION['daily_double_wager']);
            unset($_SESSION['daily_double_category']);
            unset($_SESSION['daily_double_value']);
            unset($_SESSION['daily_double_player']);
            unset($_SESSION['daily_double_start_time']);
        }

        // Store the answer for later parsing
        if (!isset($_SESSION['answers'])) {
            $_SESSION['answers'] = [];
        }
        
        // Get the first answer from array for display
        $displayAnswer = is_array($correctAnswer) ? $correctAnswer[0] : $correctAnswer;
        
        $_SESSION['answers'][] = [
            'category' => $_POST['category'],
            'value' => $_POST['value'],
            'question' => $_POST['question'] ?? '',
            'user_answer' => $_POST['answer'],
            'correct_answer' => $displayAnswer,
            'is_correct' => $isCorrect,
            'player' => $activePlayer,
            'timestamp' => time()
        ];

        // Mark this cell as used
        if (!isset($_SESSION['used_cells'])) {
            $_SESSION['used_cells'] = [];
        }
        $cellKey = $_POST['category'] . '|' . $_POST['value'];
        $_SESSION['used_cells'][$cellKey] = true;

        // Store feedback message
        $_SESSION['last_feedback'] = [
            'is_correct' => $isCorrect,
            'correct_answer' => $displayAnswer,
            'user_answer' => $_POST['answer'],
            'player' => $activePlayer,
            'points' => $pointValue
        ];
        
        // Always switch turn to the other player after answering
        $_SESSION['current_turn'] = $activePlayer == 1 ? 2 : 1;

        // Redirect back to clear POST data
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
$player1Guess = $_SESSION['player1_guess'] ?? null;
$player2Guess = $_SESSION['player2_guess'] ?? null;
$targetNumber = $_SESSION['target_number'] ?? 0;
$dailyDoubles = $_SESSION['daily_doubles'] ?? [];

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
    if (isset($_SESSION['question_assignments'][$category][$value])) {
        $selectedQuestion = $_SESSION['question_assignments'][$category][$value];
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
    <meta charset="UTF-8"
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
        <a href="2P.php?reset=1" class="title-wrapper" onclick="return confirm('Are you sure you want to reset the game?');">
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
                
                <div class="guess-container">
                    <div class="player-guess-section">
                        <h3>Player 1</h3>
                        <?php if ($player1Guess === null): ?>
                            <form method="POST" action="2P.php" class="guess-form">
                                <input type="hidden" name="player" value="1">
                                <label for="guess1">Pick a number (1-50):</label>
                                <input type="number" id="guess1" name="guess" min="1" max="50" required 
                                       <?php if ($player2Guess !== null) echo 'autofocus'; ?>>
                                <button type="submit" class="submit-btn">Submit</button>
                            </form>
                        <?php else: ?>
                            <div class="guess-submitted">✓ Number submitted!</div>
                        <?php endif; ?>
                    </div>

                    <div class="player-guess-section">
                        <h3>Player 2</h3>
                        <?php if ($player2Guess === null): ?>
                            <form method="POST" action="2P.php" class="guess-form">
                                <input type="hidden" name="player" value="2">
                                <label for="guess2">Pick a number (1-50):</label>
                                <input type="number" id="guess2" name="guess" min="1" max="50" required
                                       <?php if ($player1Guess !== null) echo 'autofocus'; ?>>
                                <button type="submit" class="submit-btn">Submit</button>
                            </form>
                        <?php else: ?>
                            <div class="guess-submitted">✓ Number submitted!</div>
                        <?php endif; ?>
                    </div>
                </div>
                
                <?php if ($player1Guess !== null && $player2Guess !== null): ?>
                    <div class="guess-results">
                        <h3>Results:</h3>
                        <p>Target Number: <strong><?php echo $targetNumber; ?></strong></p>
                        <p>Player 1 guessed: <strong><?php echo $player1Guess; ?></strong> (off by <?php echo abs($targetNumber - $player1Guess); ?>)</p>
                        <p>Player 2 guessed: <strong><?php echo $player2Guess; ?></strong> (off by <?php echo abs($targetNumber - $player2Guess); ?>)</p>
                        <p class="winner-announce">Player <?php echo $currentTurn; ?> goes first!</p>
                        <a href="2P.php" class="submit-btn">Start Game</a>
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
        $cardValue = (int)str_replace('$', '', $dailyDoubleValue);
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
                    <input type="number" id="wager" name="wager" min="5" 
                           max="<?php echo $maxWager; ?>" 
                           value="<?php echo $maxWager; ?>" 
                           required autofocus>
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
                <div class="player-indicator">Player <?php echo $currentTurn; ?> - Wager: $<?php echo $_SESSION['daily_double_wager'] ?? 0; ?></div>
                <?php
                // Find the question for this Daily Double
                $ddQuestion = '';
                if (isset($_SESSION['question_assignments'][$dailyDoubleCategory][$dailyDoubleValue])) {
                    $ddQuestion = $_SESSION['question_assignments'][$dailyDoubleCategory][$dailyDoubleValue];
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
                    <input type="text" id="dd_answer" name="answer" class="question-input" placeholder="Type your answer..." required autofocus>
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
        <div class="player-block <?php echo ($gameStarted && $currentTurn == 1) ? 'active-player' : ''; ?>">
            <div class="score-box">$<?php echo $player1Score; ?></div>
            <div class="player-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="64" height="64" fill="<?php echo ($gameStarted && $currentTurn == 1) ? '#ffffff' : '#ff0000'; ?>">
                    <circle cx="24" cy="18" r="12" />
                    <rect x="8" y="32" width="32" height="12" rx="6" />
                </svg>
            </div>
            <div class="player-label">Player 1</div>
            <?php if ($gameStarted && $currentTurn == 1): ?>
                <div class="turn-indicator">Your Turn</div>
            <?php endif; ?>
        </div>
        <div class="jeopardy-grid">
            <!-- Category Row -->
            <div class="grid-cell category-cell">People</div>
            <div class="grid-cell category-cell">Powers</div>
            <div class="grid-cell category-cell">Artifacts</div>
            <div class="grid-cell category-cell">Media</div>
            <div class="grid-cell category-cell">Teams</div>
            <div class="grid-cell category-cell">Places</div>
            <!-- Value Rows -->
            <?php
            $categories = ['People', 'Powers', 'Artifacts', 'Media', 'Teams', 'Places'];
            $values = ['$200', '$400', '$600', '$800', '$1000'];

            foreach ($values as $val) {
                echo "\n            <!-- Row for {$val} -->";
                foreach ($categories as $cat) {
                    $cellKey = $cat . '|' . $val;
                    $isUsed = isset($_SESSION['used_cells'][$cellKey]);
                    $isDailyDouble = isset($dailyDoubles[$cellKey]);

                    if ($isUsed) {
                        echo "\n            <div class=\"grid-cell value-cell used-cell\">{$val}</div>";
                    } else {
                        // If it's a Daily Double, link to wager screen; otherwise normal question
                        $link = $isDailyDouble 
                            ? "2P.php?show_wager=1&category={$cat}&value={$val}"
                            : "2P.php?category={$cat}&value={$val}";
                        $ddClass = $isDailyDouble ? ' daily-double-cell' : '';
                        echo "\n            <a href=\"{$link}\" class=\"grid-cell value-cell{$ddClass}\">{$val}</a>";
                    }
                }
            }
            ?>
        </div>
        <div class="player-block <?php echo ($gameStarted && $currentTurn == 2) ? 'active-player' : ''; ?>">
            <div class="score-box">$<?php echo $player2Score; ?></div>
            <div class="player-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="64" height="64" fill="<?php echo ($gameStarted && $currentTurn == 2) ? '#ffffff' : '#ff0000'; ?>">
                    <circle cx="24" cy="18" r="12" />
                    <rect x="8" y="32" width="32" height="12" rx="6" />
                </svg>
            </div>
            <div class="player-label">Player 2</div>
            <?php if ($gameStarted && $currentTurn == 2): ?>
                <div class="turn-indicator">Your Turn</div>
            <?php endif; ?>
        </div>
    </div>
</body>

</html>