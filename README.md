# Marvel Jeopardy!

A browser-based Jeopardy! game built around the Marvel Universe. Play with 2–4 players locally, wager on Daily Doubles, and test your knowledge across six categories: People, Powers, Artifacts, Media, Teams, and Places.

---

## How to Play

1. **Choose a game mode** — Select 2, 3, or 4 players from the main menu.
2. **Enter player names** — Or stick with the defaults (Player 1, Player 2, etc.).
3. **Pick a category and value** — Click any card on the board. Higher values = harder questions.
4. **Answer in Jeopardy! format** — Start your answer with *"Who is,"* *"What is,"* or *"Where is."* For example: *"Who is Captain America?"*
5. **Control the board** — Answer correctly and you keep picking. Answer incorrectly and play passes to the next player.
6. **Daily Double & Final Jeopardy** — Hidden on the board is one Daily Double where you can wager your own money. After all 30 cards are cleared, Final Jeopardy gives everyone one last chance to wager and win.

---

## Scoring System

### Base Game Points

The dollar value on each card is what you win or lose for that question:

| Card Value | Correct | Wrong / Pass / No Answer |
|------------|---------|--------------------------|
| $200       | +$200   | −$200                    |
| $400       | +$400   | −$400                    |
| $600       | +$600   | −$600                    |
| $800       | +$800   | −$800                    |
| $1,000     | +$1,000 | −$1,000                  |

- **Daily Double:** You choose your own wager (minimum $5, up to either $1,000 or your current score, whichever is higher).
- **Final Jeopardy:** Same wagering rules as Daily Double. Everyone writes down an answer secretly, then scores are updated all at once.

---

### AI-SBMM Skill Scoring *(Optional)*

> **What it is:** AI Skill-Based Match Making (AI-SBMM) is an optional system that tracks how well you play and automatically adjusts question difficulty in real time. It does **not** replace the dollar scores above — it runs in the background to make the game harder or easier as you go.

When AI-SBMM is turned on, every answer you give is converted into a **skill score**. This score is separate from your money total and is only used to decide when to bump the difficulty up or down.

#### Base Skill Weights

Each card value has a hidden "skill weight" that determines how much it affects your skill score:

| Card Value | Skill Weight |
|------------|--------------|
| $200       | 1            |
| $400       | 2            |
| $600       | 3            |
| $800       | 4            |
| $1,000     | 5            |

Higher-value questions count more toward your skill rating because they are expected to be harder.

#### How Skill Points Are Awarded

| Result | Skill Points Earned |
|--------|---------------------|
| **Correct + Fast** (≤ 5 seconds) | `Base Weight × 2.0` |
| **Correct + Normal** (5–18 seconds) | `Base Weight × 1.0` to `Base Weight × 2.0` (linear scale) |
| **Correct + Slow** (≥ 18 seconds) | `0` (too slow — no skill credit) |
| **Wrong answer** | `−(Base Weight × 0.5)` |
| **No answer / Passed** | `−(Base Weight × 1.25)` |

**Speed multiplier breakdown:**
- Answering in **5 seconds or less** gives the full **2×** bonus.
- Answering in **18 seconds or more** gives **zero** skill points even if correct.
- Anything in between scales smoothly from 1× up to 2×. For example, answering in about 11 seconds earns roughly 1.5× the base weight.

#### Difficulty Adjustment

The system watches your running skill score and streaks to decide when to shift difficulty:

| Trigger | What Happens |
|---------|--------------|
| Skill score reaches **+10** | Difficulty increases by 1 level (Normal → Hard → Expert) |
| Skill score drops to **−6** | Difficulty decreases by 1 level |
| **3 wrong answers in a row** | Difficulty decreases by 1 level |

There are three difficulty levels:
- **Normal** — Standard question set.
- **Hard** — Questions are replaced with harder variants via AI (Google Gemini).
- **Expert** — Even harder AI-generated questions with reduced hint tolerance.

After every difficulty change, your skill score and streak counters are reset so the system doesn't bounce you up and down instantly.

---

### Community Training *(Optional — requires AI-SBMM)*

> **What it is:** Community Training anonymously pools data from completed matches (category picks, correctness, and timing) and uses that community-wide data to subtly nudge the AI-SBMM skill scores. It does **not** affect your dollar total.

Community Training is entirely opt-in and only activates when AI-SBMM is already enabled. No personal information is ever stored — only aggregate statistics like "People $200 was picked 12 times and answered correctly 8 times."

#### How It Adjusts Your Skill Score

Community Training applies a small modifier (up to **±35%**) to your raw skill points for each answer. The modifier is based on two community-driven factors:

**1. Pick Popularity (`pickMod`) — applies to *correct* answers**
- **Rarely picked** categories/values → **bonus** (you found an under-explored card)
- **Commonly picked** categories/values → **slight reduction** (everyone already goes for these)

**2. Miss Rate (`missMod`) — applies to *wrong* and *no-answer* results**
- **Commonly missed** by the community → **lighter penalty** (the question is genuinely tough)
- **Rarely missed** by the community → **heavier penalty** (most players get this right)

#### Modifier Math

Both the category and the dollar value contribute independently:

1. A **category modifier** is calculated based on how the community performs in that category.
2. A **value modifier** is calculated based on how the community performs at that dollar amount.
3. The two are averaged together.
4. The final result is clamped so it can never exceed **±35%** of your raw skill points.

**Example:**
- You correctly answer a $600 "Artifacts" question in 4 seconds.
- Raw skill points: `3 (base weight) × 2.0 (speed) = 6.0`
- The community picks "Artifacts" very often (`pickMod` = −0.08) and rarely picks $600 (`pickMod` = +0.06).
- Average modifier: `(−0.08 + 0.06) / 2 = −0.01`
- Final skill points: `6.0 × (1.0 − 0.01) = 5.94`

#### Requirements

- Community Training needs at least **5 completed matches** in the shared pool before modifiers kick in. Until then, your raw skill score is used unchanged.
- Data is only submitted after a full game is completed (all 30 cards cleared + Final Jeopardy finished).
- Weights are refreshed from the community pool every 5 minutes.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + S` | Print live AI-SBMM stats snapshot to the browser console (only when AI-SBMM is enabled) |

---

## Tech Stack

- HTML / CSS / vanilla JavaScript (no frameworks)
- Firebase Realtime Database (for Community Training aggregate stats)
- Google Gemini API via Vercel proxy (for dynamic hard/expert question generation)
- Local / session storage for game state persistence

---

## `.gitignore`

The following files and directories are excluded from version control:

| Pattern | Reason |
|---------|--------|
| `.vercel` | Vercel deployment metadata |
| `.DS_Store` | macOS system files |
| `Thumbs.db` | Windows thumbnail cache |
| `desktop.ini` | Windows folder settings |
| `*.tmp` | Temporary files |
| `*.bak` | Backup files |
| `*~` | Editor swap/backup files |

---

## Credits

- Marvel characters, locations, and lore are property of Marvel Entertainment.
- Jeopardy! format inspired by the classic TV game show.
