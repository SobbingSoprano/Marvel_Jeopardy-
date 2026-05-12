/*
============================================================
 MARVEL JEOPARDY - GEMINI PROXY API
 Vercel Serverless Function
 Securely proxies Gemini API calls so the key stays hidden
============================================================

ENV VARIABLE REQUIRED:
  GEMINI_API_KEY = your Google Gemini API key

Set it in Vercel Dashboard:
  Project Settings → Environment Variables → Add "GEMINI_API_KEY"
============================================================
*/

// Hardcoded game structure (mirrors questions.js)
const CATEGORIES = ["People", "Powers", "Artifacts", "Media", "Teams", "Places"];
const VALUES = ["$200", "$400", "$600", "$800", "$1000"];
const MODEL = 'gemini-3-flash-preview';

function buildPrompt(difficultyLevel, metricsSummary, existingQuestions) {
    // Flatten existing questions into a readable list so Gemini can avoid duplicates
    let existingBlock = '';
    if (existingQuestions && typeof existingQuestions === 'object') {
        const lines = [];
        for (const cat of Object.keys(existingQuestions)) {
            for (const val of Object.keys(existingQuestions[cat] || {})) {
                const q = existingQuestions[cat][val]?.question;
                if (q) lines.push(`[${cat} ${val}] ${q}`);
            }
        }
        if (lines.length) {
            existingBlock = `
Questions ALREADY ON THE BOARD (do NOT reuse these clues or factual premises — generate entirely new ones):
${lines.join('\n')}
`;
        }
    }

    return `
You are an AI game master for a Marvel-themed Jeopardy game.
Current difficulty level: ${difficultyLevel} (1=Normal, 2=Hard, 3=Expert)

Player Performance Summary:
${metricsSummary}
${existingBlock}
Task: Generate a COMPLETE and VALID JSON object with updated Jeopardy questions for ALL categories and values listed below.

Rules:
- "question": A proper Jeopardy-style CLUE written as a declarative statement — NOT a question.
  The clue must describe the answer without naming it directly.
  Good examples:
    "This star-spangled super-soldier from Brooklyn leads the Avengers"
    "Forged in Wakanda, only the worthy may lift this enchanted hammer"
    "Dormammu rules this dark realm from which Doctor Strange must never draw too much power"
  Bad examples (do NOT use these formats):
    "Who is the leader of the Avengers?"  ← question form, forbidden
    "What is Thor's hammer called?"        ← question form, forbidden
- Keep every clue concise — 12 to 22 words maximum.
- "answer": An array of 1-3 short acceptable answer strings, all lowercase, WITHOUT any Jeopardy phrasing.
  Good: ["thor", "thor odinson"]   Bad: ["What is Thor?", "Who is Thor?"]
- Within EVERY difficulty level, question difficulty must scale with point value:
    $200 = easiest in this tier (broad knowledge, iconic characters/events)
    $400 = moderate
    $600 = specific (supporting cast, exact titles, notable but non-headline events)
    $800 = hard (obscure details, lesser-known facts)
    $1000 = hardest in this tier (deep lore, creators, rare aliases, minor variants)
  Think of difficulty level as raising the entire baseline — a $200 at difficulty 3 should feel like a $600 at difficulty 1.
- Difficulty 2 (Hard): Require more specific Marvel knowledge — supporting characters, exact titles, less famous events.
- Difficulty 3 (Expert): Deep-cut lore — obscure aliases, storyline issue numbers, creators, less-known variants. Still keep the clue concise.
- All questions must be factually accurate Marvel canon.
- Do NOT reuse any clue or factual premise already listed in the "Questions ALREADY ON THE BOARD" section above.
- Do NOT wrap the JSON in markdown code blocks. Output raw JSON only.

Categories: ${CATEGORIES.join(', ')}
Values (point values per category): ${VALUES.join(', ')}

Output ONLY this JSON structure, nothing else:
{
  "People": { "$200": { "question": "...", "answer": ["..."] }, "$400": {...}, "$600": {...}, "$800": {...}, "$1000": {...} },
  "Powers": { "$200": {...}, "$400": {...}, "$600": {...}, "$800": {...}, "$1000": {...} },
  "Artifacts": { "$200": {...}, "$400": {...}, "$600": {...}, "$800": {...}, "$1000": {...} },
  "Media": { "$200": {...}, "$400": {...}, "$600": {...}, "$800": {...}, "$1000": {...} },
  "Teams": { "$200": {...}, "$400": {...}, "$600": {...}, "$800": {...}, "$1000": {...} },
  "Places": { "$200": {...}, "$400": {...}, "$600": {...}, "$800": {...}, "$1000": {...} }
}
`.trim();
}

function buildTelephonePrompt(pairs) {
    const pairList = pairs.map((p, i) =>
        `${i + 1}. Given: "${p.given}" → Response: "${p.response || '(no response)'}"`
    ).join('\n');

    return `You are judging a word-association party game. Players see a word and must respond with a related word. Score each pair 0–100 on how well the response connects to the given word.

Scoring rubric:
- 90–100: Direct synonyms or near-identical meaning. Examples: cat→feline, fire→blaze, fast→quick
- 75–89: Very strong association — same category, obvious pairing. Examples: cat→dog, fire→smoke, ocean→wave, jump→leap
- 55–74: Good association — compound words, well-known phrases, functional or thematic link. Examples: jump→rope (jump rope), fish→gold (goldfish), fire→hot, star→bright, cat→fish (cats eat fish)
- 35–54: Moderate association — one logical step. Examples: ocean→blue, tree→wood, fish→water
- 15–34: Weak — tangential or culturally specific link
- 1–14: Very weak — barely connected
- 0: No connection, gibberish, random characters, or "(no response)"

IMPORTANT: Compound words and common phrases score HIGH. "jump" → "rope" scores 70+ (jump rope). "fish" → "gold" scores 65+ (goldfish). Be GENEROUS with creative but valid connections.

Word pairs to score:
${pairList}

Return ONLY a JSON array of integers, one score per pair, in order. Example for 3 pairs: [85, 62, 5]
Output ONLY the raw JSON array. No explanation, no markdown, no code fences.`.trim();
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('[Gemini Proxy] GEMINI_API_KEY environment variable not set');
        return res.status(500).json({
            error: 'Server misconfigured: GEMINI_API_KEY not set',
            hint: 'Add GEMINI_API_KEY to your Vercel environment variables'
        });
    }

    const { type, difficultyLevel, metricsSummary, existingQuestions, pairs } = req.body || {};

    // ── Telephone scoring request ──────────────────────────────────────────
    if (type === 'telephone') {
        if (!Array.isArray(pairs) || pairs.length === 0) {
            return res.status(400).json({ error: 'Bad request: pairs array required for telephone scoring' });
        }

        const prompt = buildTelephonePrompt(pairs);

        try {
            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 256
                        }
                    })
                }
            );

            if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                console.error('[Gemini Proxy] Telephone scoring error:', geminiRes.status, errText);
                return res.status(502).json({ error: 'Gemini API error', status: geminiRes.status, details: errText });
            }

            const geminiData = await geminiRes.json();
            const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            console.log('[Gemini Proxy] Telephone raw response:', rawText);
            let scores;
            try {
                const parsed = JSON.parse(rawText.trim());
                if (Array.isArray(parsed)) {
                    // Gemini returned a bare array — ideal
                    scores = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    // Gemini wrapped it in an object; find the first array value
                    const found = Object.values(parsed).find(v => Array.isArray(v));
                    scores = found || pairs.map(() => 0);
                } else {
                    scores = pairs.map(() => 0);
                }
            } catch (_) {
                // Fall back to regex extraction
                const match = rawText.match(/\[[\d.,\s-]+\]/);
                if (match) {
                    try { scores = JSON.parse(match[0]); } catch (_2) { scores = pairs.map(() => 0); }
                } else {
                    scores = pairs.map(() => 0);
                }
            }

            // Ensure scores is a valid array of numbers
            if (!Array.isArray(scores)) scores = pairs.map(() => 0);
            scores = scores.map(s => {
                const n = Number(s);
                return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
            });

            console.log('[Gemini Proxy] Telephone final scores:', scores);
            return res.status(200).json({ scores });
        } catch (err) {
            console.error('[Gemini Proxy] Telephone request failed:', err);
            return res.status(500).json({ error: 'Internal server error', details: err.message });
        }
    }

    // ── Standard SBMM question generation request ─────────────────────────
    if (typeof difficultyLevel !== 'number' || typeof metricsSummary !== 'string') {
        return res.status(400).json({
            error: 'Bad request: difficultyLevel (number) and metricsSummary (string) are required'
        });
    }

    const prompt = buildPrompt(difficultyLevel, metricsSummary, existingQuestions || null);

    try {
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json'
                    }
                })
            }
        );

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error('[Gemini Proxy] Gemini API error:', geminiRes.status, errText);
            return res.status(502).json({
                error: 'Gemini API error',
                status: geminiRes.status,
                details: errText
            });
        }

        const geminiData = await geminiRes.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return res.status(200).json({ text });

    } catch (err) {
        console.error('[Gemini Proxy] Request failed:', err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}
