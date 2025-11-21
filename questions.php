<?php

/* 
============================================================
 REBUILT QUESTION BANK (CATEGORY → VALUE → QUESTION)
============================================================
*/

$allQuestions = [
    "People" => [
        "$200" => [
            "question" => "Who is the leader of the Avengers in most MCU films?",
            "answer" => ["Captain America", "Steve Rogers"]
        ],
        "$400" => [
            "question" => "What is the real name of Black Panther?",
            "answer" => ["T'Challa", "T Challa", "King T'Challa"]
        ],
        "$600" => [
            "question" => "Which Marvel character is known as the Sorcerer Supreme?",
            "answer" => ["Doctor Strange", "Stephen Strange"]
        ],
        "$800" => [
            "question" => "What is the real name of the Scarlet Witch?",
            "answer" => ["Wanda Maximoff", "Wanda"]
        ],
        "$1000" => [
            "question" => "Which mutant is known as the father of Wanda and Pietro in Marvel comics?",
            "answer" => ["Magneto", "Erik Lehnsherr"]
        ],
    ],

    "Powers" => [
        "$200" => [
            "question" => "What metal is Wolverine's skeleton coated with?",
            "answer" => ["Adamantium"]
        ],
        "$400" => [
            "question" => "Which Avenger can control lightning?",
            "answer" => ["Thor"]
        ],
        "$600" => [
            "question" => "Which cosmic force grants Captain Marvel her abilities?",
            "answer" => ["The Tesseract", "Space Stone", "Energy from the Tesseract"]
        ],
        "$800" => [
            "question" => "Which mutant power is Jean Grey most known for?",
            "answer" => ["Telekinesis", "Telepathy", "Phoenix Force"]
        ],
        "$1000" => [
            "question" => "What is the name of the dimension that gives Doctor Strange his magic?",
            "answer" => ["The Dark Dimension", "Dark Dimension"]
        ],
    ],

    "Artifacts" => [
        "$200" => [
            "question" => "Which magical item does Doctor Strange wear around his neck?",
            "answer" => ["Eye of Agamotto"]
        ],
        "$400" => [
            "question" => "Which infinity stone does Vision possess?",
            "answer" => ["Mind Stone", "The Mind Stone"]
        ],
        "$600" => [
            "question" => "What is Thor’s hammer called?",
            "answer" => ["Mjolnir"]
        ],
        "$800" => [
            "question" => "What metal is Captain America’s shield made of?",
            "answer" => ["Vibranium"]
        ],
        "$1000" => [
            "question" => "What ancient book contains forbidden magical knowledge in Doctor Strange?",
            "answer" => ["The Darkhold"]
        ],
    ],

    "Media" => [
        "$200" => [
            "question" => "Which movie introduced Spider-Man to the MCU?",
            "answer" => ["Captain America: Civil War", "Civil War"]
        ],
        "$400" => [
            "question" => "Which movie features the first appearance of Thanos?",
            "answer" => ["The Avengers", "Avengers 1"]
        ],
        "$600" => [
            "question" => "Which Marvel show features Wanda creating alternate realities?",
            "answer" => ["WandaVision"]
        ],
        "$800" => [
            "question" => "Which film marks the introduction of the multiverse in the MCU?",
            "answer" => ["Doctor Strange in the Multiverse of Madness", "Multiverse of Madness"]
        ],
        "$1000" => [
            "question" => "Which MCU movie won three Oscars, including Best Costume Design?",
            "answer" => ["Black Panther"]
        ],
    ],

    "Teams" => [
        "$200" => [
            "question" => "What superhero team is Wolverine most associated with?",
            "answer" => ["X-Men", "X Men"]
        ],
        "$400" => [
            "question" => "Which team includes Rocket Raccoon and Groot?",
            "answer" => ["Guardians of the Galaxy", "Guardians"]
        ],
        "$600" => [
            "question" => "What elite spy organization does Black Widow work for?",
            "answer" => ["S.H.I.E.L.D.", "SHIELD"]
        ],
        "$800" => [
            "question" => "What is the name of the villain team led by Thanos’ children?",
            "answer" => ["Black Order"]
        ],
        "$1000" => [
            "question" => "What team does Deadpool temporarily join in Deadpool 2?",
            "answer" => ["X-Force", "X Force"]
        ],
    ],

    "Places" => [
        "$200" => [
            "question" => "What country is Black Panther’s home?",
            "answer" => ["Wakanda"]
        ],
        "$400" => [
            "question" => "What city is Spider-Man primarily associated with?",
            "answer" => ["New York", "NYC"]
        ],
        "$600" => [
            "question" => "What is the name of Thor's home realm?",
            "answer" => ["Asgard"]
        ],
        "$800" => [
            "question" => "Where is Doctor Strange’s Sanctum located?",
            "answer" => ["177A Bleecker Street", "Bleecker Street", "New York"]
        ],
        "$1000" => [
            "question" => "What hidden mutant island appears in Marvel comics and the Krakoa era?",
            "answer" => ["Krakoa"]
        ],
    ],
];


/* ========================================================
   FUNCTIONS USED BY 4P.php AND 2P/3P
======================================================== */

function getRandomizedQuestionMap($allQuestions)
{
    $map = [
        "People" => [],
        "Powers" => [],
        "Artifacts" => [],
        "Media" => [],
        "Teams" => [],
        "Places" => []
    ];

    $values = ["$200", "$400", "$600", "$800", "$1000"];

    foreach ($map as $category => $_) {
        foreach ($values as $value) {
            if (isset($allQuestions[$category][$value]["question"])) {
                $map[$category][$value] = $allQuestions[$category][$value]["question"];
            } else {
                $map[$category][$value] = "Question missing for $category $value";
            }
        }
    }

    return $map;
}

function getCorrectAnswers($allQuestions, $category, $value, $questionText)
{
    if (isset($allQuestions[$category][$value]["answer"])) {
        return $allQuestions[$category][$value]["answer"];
    }
    return []; // failsafe
}

function getQuestionText($allQuestions, $category, $value)
{
    return $allQuestions[$category][$value]["question"];
}

function isDailyDouble($key, $storedDD)
{
    return $key === $storedDD;
}


function getCategoryList()
{
    return ["People", "Powers", "Artifacts", "Media", "Teams", "Places"];
}

function getValueList()
{
    return ["$200", "$400", "$600", "$800", "$1000"];
}

?>