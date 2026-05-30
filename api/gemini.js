/*
============================================================
 MARVEL JEOPARDY - GEMINI PROXY API
 Vercel Serverless Function
 Securely proxies Gemini API calls so the key stays hidden
============================================================

ENV VARIABLES REQUIRED:
  GEMINI_API_KEY  = your Google Gemini API key

Set them in Vercel Dashboard:
  Project Settings → Environment Variables

RATE LIMITING (per IP, sliding-window):
  SBMM question generation : 15 req / 15 min
  Telephone scoring         : 20 req / 15 min
  Global (all types)        : 50 req / 15 min

NOTE: Rate-limit state is in-process memory.
  This is sufficient for low-to-moderate traffic.
  For true multi-instance persistence, upgrade to
  Vercel KV (Upstash Redis) and replace RateLimiter
  with atomic KV INCR + EXPIRE calls.
============================================================
*/

// ── Rate Limiter ─────────────────────────────────────────────────────────────
// Sliding-window algorithm: stores an array of request timestamps per key.
// Keys are  "<ip>:<type>"  and  "<ip>:global".

const RATE_LIMITS = {
    sbmm:      { windowMs: 15 * 60 * 1000, max: 15 }, // expensive: full board gen
    telephone: { windowMs: 15 * 60 * 1000, max: 20 }, // cheaper:   pair scoring
    global:    { windowMs: 15 * 60 * 1000, max: 50 }, // total cap across all types
};

class RateLimiter {
    constructor() {
        this._store = new Map(); // Map<key, number[]>  (arrays of ms timestamps)
    }

    /**
     * Check and record a request.
     * @param {string} ip   Client IP address
     * @param {string} type Request type ("sbmm" | "telephone")
     * @returns {{ allowed: boolean, limit: number, remaining: number, resetInMs: number }}
     */
    check(ip, type) {
        const now    = Date.now();
        const limit  = RATE_LIMITS[type] ?? RATE_LIMITS.global;
        const typeKey   = `${ip}:${type}`;
        const globalKey = `${ip}:global`;

        // Prune and fetch windows
        const typeTs   = this._prune(typeKey,   now, limit.windowMs);
        const globalTs = this._prune(globalKey, now, RATE_LIMITS.global.windowMs);

        const typeExceeded   = typeTs.length   >= limit.max;
        const globalExceeded = globalTs.length >= RATE_LIMITS.global.max;

        if (typeExceeded || globalExceeded) {
            const [ts, lim] = typeExceeded
                ? [typeTs, limit]
                : [globalTs, RATE_LIMITS.global];
            return {
                allowed:    false,
                limit:      lim.max,
                remaining:  0,
                resetInMs:  Math.max(0, ts[0] + lim.windowMs - now),
            };
        }

        // Record request
        typeTs.push(now);
        globalTs.push(now);
        this._store.set(typeKey,   typeTs);
        this._store.set(globalKey, globalTs);

        // Periodic memory cleanup (prevent unbounded growth under load)
        if (this._store.size > 20_000) this._gc(now);

        return {
            allowed:   true,
            limit:     limit.max,
            remaining: limit.max - typeTs.length,
            resetInMs: typeTs.length > 0
                ? typeTs[0] + limit.windowMs - now
                : limit.windowMs,
        };
    }

    _prune(key, now, windowMs) {
        const ts = (this._store.get(key) || []).filter(t => now - t < windowMs);
        this._store.set(key, ts);
        return ts;
    }

    _gc(now) {
        const maxWindow = Math.max(...Object.values(RATE_LIMITS).map(l => l.windowMs));
        for (const [key, ts] of this._store) {
            if (ts.every(t => now - t >= maxWindow)) this._store.delete(key);
        }
    }
}

// Module-level singleton — survives across warm invocations of the same instance
const rateLimiter = new RateLimiter();

/** Extract the real client IP from Vercel / proxy headers */
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

// ── Game constants ────────────────────────────────────────────────────────────
// Hardcoded game structure (mirrors questions.js)
const CATEGORIES = ["People", "Powers", "Artifacts", "Media", "Teams", "Places"];
const VALUES = ["$200", "$400", "$600", "$800", "$1000"];
const MODEL = 'gemini-3-flash-preview';

function buildPrompt(difficultyLevel, metricsSummary, existingQuestions) {
    // Compact existing-questions block — only question text to save tokens & latency
    let existingBlock = '';
    if (existingQuestions && typeof existingQuestions === 'object') {
        const lines = [];
        for (const cat of Object.keys(existingQuestions)) {
            for (const val of Object.keys(existingQuestions[cat] || {})) {
                const q = existingQuestions[cat][val]?.question;
                if (q) lines.push(`- ${q}`);
            }
        }
        if (lines.length) {
            existingBlock = `\nEXISTING QUESTIONS (do NOT reuse):\n${lines.join('\n')}\n`;
        }
    }

    const diffDesc = difficultyLevel === 2
        ? 'Hard: specific knowledge — supporting characters, exact titles, less famous events.'
        : 'Expert: deep-cut lore — obscure aliases, issue numbers, creators, rare variants.';

    return `You are a Marvel Jeopardy game master.
Difficulty: ${difficultyLevel} — ${diffDesc}

Player stats:
${metricsSummary}
${existingBlock}
Generate a COMPLETE JSON board for ALL categories and values below.

Rules:
- "question": Declarative clue, 12–22 words. NEVER a question. NEVER names the answer or obvious keywords.
  Bad: "Who leads the Avengers?" or "Thanos wore this golden glove"
  Good: "This star-spangled soldier from Brooklyn leads Earth's mightiest heroes"
- "answer": 1–3 lowercase strings, no Jeopardy phrasing. e.g. ["thor", "thor odinson"]
- Difficulty scales with value: $200=easiest in tier, $1000=hardest. Level raises the baseline.
- All clues must be factually accurate Marvel canon.
- Do NOT reuse any existing question above.

Categories: ${CATEGORIES.join(', ')}
Values: ${VALUES.join(', ')}

Output ONLY raw JSON — no markdown, no commentary.`;
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
${pairList}`.trim();
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

    // ── Rate limiting ──────────────────────────────────────────────────────
    // Peek at type before full body validation so we can apply per-type limits
    const reqType   = req.body?.type === 'telephone' ? 'telephone' : 'sbmm';
    const clientIP  = getClientIP(req);
    const rl        = rateLimiter.check(clientIP, reqType);
    const resetSecs = Math.ceil(rl.resetInMs / 1000);

    // Always expose rate-limit info in response headers
    res.setHeader('X-RateLimit-Limit',     rl.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rl.remaining));
    res.setHeader('X-RateLimit-Reset',     Math.ceil((Date.now() + rl.resetInMs) / 1000)); // Unix epoch

    if (!rl.allowed) {
        res.setHeader('Retry-After', resetSecs);
        console.warn(`[Gemini Proxy] Rate limit hit — IP: ${clientIP}, type: ${reqType}, retry in ${resetSecs}s`);
        return res.status(429).json({
            error:      'Too many requests. Please wait before making another AI call.',
            retryAfter: resetSecs,
        });
    }
    // ──────────────────────────────────────────────────────────────────────

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('[Gemini Proxy] GEMINI_API_KEY environment variable not set');
        return res.status(500).json({
            error: 'Server misconfigured: GEMINI_API_KEY not set',
            hint: 'Add GEMINI_API_KEY to your Vercel environment variables'
        });
    }

    const { type, difficultyLevel, metricsSummary, existingQuestions, pairs } = req.body || {};

    // ── Health check ───────────────────────────────────────────────────────
    if (type === 'health') {
        return res.status(200).json({
            status: 'ok',
            model: MODEL,
            ready: !!apiKey
        });
    }

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
                            responseMimeType: 'application/json',
                            responseSchema: {
                                type: 'ARRAY',
                                items: { type: 'INTEGER', minimum: 0, maximum: 100 }
                            }
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
            const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            console.log('[Gemini Proxy] Telephone raw response:', rawText);
            const trimmed = rawText.trim();
            let scores;

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    // Ideal: bare JSON array
                    scores = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    // Case 1: { scores: [...] } or any key wrapping an array
                    const nestedArr = Object.values(parsed).find(v => Array.isArray(v));
                    if (nestedArr) {
                        scores = nestedArr;
                    } else {
                        // Case 2: { "0": 45, "1": 38, ... } or { pair_1: 45, pair_2: 38 }
                        const vals = Object.values(parsed);
                        if (vals.length > 0 && vals.every(v => typeof v === 'number')) {
                            scores = Object.keys(parsed)
                                .sort((a, b) => {
                                    const na = parseInt(a, 10), nb = parseInt(b, 10);
                                    return (isNaN(na) || isNaN(nb)) ? a.localeCompare(b) : na - nb;
                                })
                                .map(k => parsed[k]);
                        } else {
                            scores = null;
                        }
                    }
                } else {
                    scores = null;
                }
            } catch (_) {
                scores = null;
            }

            // Fallback 1: regex extract JSON array from surrounding text
            if (!scores) {
                const arrMatch = trimmed.match(/\[[\d.,\s-]+\]/);
                if (arrMatch) {
                    try { scores = JSON.parse(arrMatch[0]); } catch (_2) { scores = null; }
                }
            }

            // Fallback 2: bare comma-separated integers with no brackets
            if (!scores) {
                const numMatch = trimmed.match(/^\s*(\d+(?:\s*,\s*\d+)*)\s*$/);
                if (numMatch) {
                    scores = numMatch[1].split(',').map(s => parseInt(s.trim(), 10));
                }
            }

            // Last resort: pick out any integers present in the string (handles truncated arrays)
            if (!Array.isArray(scores)) {
                const nums = [...trimmed.matchAll(/\b(\d{1,3})\b/g)].map(m => parseInt(m[1], 10)).filter(n => n <= 100);
                scores = nums.length > 0 ? nums : pairs.map(() => 0);
            }

            // Normalise to clamped integers
            scores = scores.map(s => {
                const n = Number(s);
                return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
            });

            console.log('[Gemini Proxy] Telephone final scores:', scores);
            return res.status(200).json({ scores, _debugRaw: rawText });
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
                        temperature: 0.65,
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
