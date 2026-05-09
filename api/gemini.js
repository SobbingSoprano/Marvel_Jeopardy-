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
const MODEL = 'gemini-2.0-flash';

function buildPrompt(difficultyLevel, metricsSummary) {
    return `
You are an AI game master for a Marvel-themed Jeopardy game.
Current difficulty level: ${difficultyLevel} (1=Normal, 2=Hard, 3=Expert)

Player Performance Summary:
${metricsSummary}

Task: Generate updated question data for the following categories and values.
Each entry must include: "question" (string), "answer" (array of acceptable strings).
Answers MUST require Jeopardy-style phrasing ("What is...", "Who is...").
Make questions harder for difficulty 2, much harder for difficulty 3.
Keep the same Marvel theme. Questions should be accurate and fair.

Categories: ${CATEGORIES.join(', ')}
Values: ${VALUES.join(', ')}

Respond ONLY with valid JSON in this exact format:
{
  "CategoryName": {
    "$200": { "question": "...", "answer": ["ans1", "ans2"] },
    ...
  }
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
                    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
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
