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

function buildPrompt(difficultyLevel, metricsSummary) {
    return `
You are an AI game master for a Marvel-themed Jeopardy game.
Current difficulty level: ${difficultyLevel} (1=Normal, 2=Hard, 3=Expert)

Player Performance Summary:
${metricsSummary}

Task: Generate a COMPLETE and VALID JSON object with updated Jeopardy questions for ALL categories and values listed below.

Rules:
- "question": A Jeopardy-style clue. Keep it concise — 12 to 20 words maximum. Same approximate length as a standard Jeopardy clue.
- "answer": An array of 1-3 short acceptable answer strings, all lowercase, WITHOUT any Jeopardy phrasing like "What is" or "Who is". The game adds that itself.
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

    const { difficultyLevel, metricsSummary } = req.body || {};

    if (typeof difficultyLevel !== 'number' || typeof metricsSummary !== 'string') {
        return res.status(400).json({
            error: 'Bad request: difficultyLevel (number) and metricsSummary (string) are required'
        });
    }

    const prompt = buildPrompt(difficultyLevel, metricsSummary);

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
