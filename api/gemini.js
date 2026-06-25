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

// ── Model configuration ───────────────────────────────────────────────────────
// Preferred model can be overridden via the GEMINI_MODEL env var.
// If the preferred model is deprecated or unavailable, the proxy automatically
// discovers a working replacement via the Gemini models.list endpoint.
const DEFAULT_MODEL = 'gemini-3.5-flash';
const PREFERRED_MODEL = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();

// Module-level cache for the resolved working model name.
// Survives across warm invocations of the same function instance.
let resolvedModelCache = null;

/** Strip the "models/" prefix returned by the Gemini API */
function stripModelsPrefix(name) {
    return String(name || '').replace(/^models\//, '');
}

/** Check whether a model entry supports the generateContent method */
function supportsGenerateContent(model) {
    return Array.isArray(model.supportedGenerationMethods) &&
           model.supportedGenerationMethods.includes('generateContent');
}

/** Heuristic: is this a Flash-family model? */
function isFlashModel(name) {
    return /gemini-.*flash/i.test(name);
}

/** Score a model name so newer, stable Flash models rank higher */
function scoreModelName(name) {
    let score = 0;

    // Major version: gemini-3 > gemini-2 > gemini-1
    const majorMatch = name.match(/gemini-(\d+)/i);
    if (majorMatch) score += parseInt(majorMatch[1], 10) * 1000;

    // Stable numbered releases (e.g. -001) score above aliases/preview/experimental
    if (/gemini-\d+\.\d+-flash-\d{3}$/i.test(name)) score += 200;
    else if (/gemini-\d+\.\d+-flash$/i.test(name)) score += 150;
    else if (/gemini-\d+\.\d+-flash-lite-\d{3}$/i.test(name)) score += 120;
    else if (/gemini-\d+\.\d+-flash-lite$/i.test(name)) score += 100;

    // Penalize previews and experimental releases
    if (/-preview/i.test(name)) score -= 50;
    if (/-exp/i.test(name)) score -= 100;

    return score;
}

/** Fetch the list of available Gemini models */
async function listGeminiModels(apiKey) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`models.list failed: HTTP ${res.status} — ${text}`);
    }
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`models.list returned invalid JSON: ${text.substring(0, 200)}`);
    }
}

/**
 * Resolve the best available Gemini model.
 * 1. Return cached model if already resolved.
 * 2. Check if PREFERRED_MODEL is still available; use it if so.
 * 3. Otherwise pick the newest stable Flash model that supports generateContent.
 * 4. Fall back to any generateContent-capable model if no Flash is available.
 * 5. On failure, fall back to PREFERRED_MODEL so requests still attempt to run.
 */
async function resolveModel(apiKey) {
    if (resolvedModelCache) return resolvedModelCache;

    try {
        const data = await listGeminiModels(apiKey);
        const models = Array.isArray(data?.models) ? data.models : [];

        if (models.length === 0) {
            throw new Error('models.list returned an empty model list');
        }

        // Check if the preferred model is still available
        const preferredLower = PREFERRED_MODEL.toLowerCase();
        const preferredEntry = models.find(m => {
            const bare = stripModelsPrefix(m.name).toLowerCase();
            return bare === preferredLower && supportsGenerateContent(m);
        });

        if (preferredEntry) {
            resolvedModelCache = stripModelsPrefix(preferredEntry.name);
            console.log(`[Gemini Proxy] Using preferred model: ${resolvedModelCache}`);
            return resolvedModelCache;
        }

        // Filter candidates and prefer Flash-family models
        const candidates = models.filter(supportsGenerateContent);
        const flashCandidates = candidates.filter(m => isFlashModel(m.name));
        const pool = flashCandidates.length > 0 ? flashCandidates : candidates;

        pool.sort((a, b) => scoreModelName(b.name) - scoreModelName(a.name));

        const chosen = pool[0];
        if (!chosen) {
            throw new Error('No generateContent-capable models found');
        }

        resolvedModelCache = stripModelsPrefix(chosen.name);
        console.warn(
            `[Gemini Proxy] Preferred model "${PREFERRED_MODEL}" is unavailable; ` +
            `falling back to "${resolvedModelCache}"`
        );
        return resolvedModelCache;
    } catch (err) {
        console.error('[Gemini Proxy] Model resolution failed:', err.message);
        // Last resort: use the preferred model and let the request fail normally
        // if it is truly unavailable. The next request will retry resolution.
        resolvedModelCache = PREFERRED_MODEL;
        return resolvedModelCache;
    }
}

/** Invalidate the cached model so the next request re-resolves */
function invalidateModelCache() {
    resolvedModelCache = null;
}

/** Build the Gemini generateContent URL for a given model */
function buildGeminiUrl(model, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

/**
 * Detect whether an error response indicates the model itself is unavailable
 * (deprecated, not found, unsupported) rather than a request/auth/rate-limit issue.
 */
function isModelUnavailableError(status, text) {
    if (status === 404) return true;
    if (status !== 400) return false;
    const lower = text.toLowerCase();
    return lower.includes('not found') ||
           lower.includes('is not found for api version') ||
           lower.includes('deprecated') ||
           lower.includes('not supported') ||
           lower.includes('unsupported') ||
           lower.includes('invalid model');
}

/**
 * Call Gemini generateContent with automatic retry on model deprecation.
 * If the resolved model returns a model-unavailable error, the cache is cleared,
 * a new model is discovered, and the request is retried once.
 */
async function generateContentWithRetry(apiKey, body, attempt = 0) {
    const model = await resolveModel(apiKey);
    const url = buildGeminiUrl(model, apiKey);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok && attempt === 0) {
        const errText = await res.text();
        if (isModelUnavailableError(res.status, errText)) {
            console.warn(
                `[Gemini Proxy] Model "${model}" unavailable (HTTP ${res.status}); ` +
                `re-resolving and retrying once...`
            );
            invalidateModelCache();
            return generateContentWithRetry(apiKey, body, attempt + 1);
        }
        // Preserve the error body for the caller while consuming it
        return new Response(errText, { status: res.status, headers: res.headers });
    }

    return res;
}

function buildPrompt(difficultyLevel, metricsSummary, existingQuestions, categorySubset = CATEGORIES) {
    // Compact existing-questions block — only question text to save tokens & latency
    let existingBlock = '';
    if (existingQuestions && typeof existingQuestions === 'object') {
        const lines = [];
        for (const cat of categorySubset) {
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
Generate a COMPLETE JSON board for these categories and values.

Rules:
- "question": Declarative clue, 12–22 words. NEVER a question. NEVER names the answer or obvious keywords.
  Bad: "Who leads the Avengers?" or "Thanos wore this golden glove"
  Good: "This star-spangled soldier from Brooklyn leads Earth's mightiest heroes"
- "answer": 1–3 lowercase strings, no Jeopardy phrasing. Include the FULL name AND any commonly accepted short form or alias. e.g. ["foggy nelson", "foggy"] or ["thor", "thor odinson"]. The first entry should be the most complete form (used for display), the rest are accepted alternates.
- Difficulty scales with value: $200=easiest in tier, $1000=hardest. Level raises the baseline.
- All clues must be factually accurate Marvel canon.
- Do NOT reuse any existing question above.

Categories: ${categorySubset.join(', ')}
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

// ── JSON helpers ─────────────────────────────────────────────────────────────

/** Build a Gemini response schema for the requested categories and values */
function buildResponseSchema(categorySubset, values) {
    const properties = {};
    for (const cat of categorySubset) {
        const valProps = {};
        for (const val of values) {
            valProps[val] = {
                type: 'OBJECT',
                properties: {
                    question: { type: 'STRING' },
                    answer:   { type: 'ARRAY', items: { type: 'STRING' } }
                },
                required: ['question', 'answer']
            };
        }
        properties[cat] = {
            type: 'OBJECT',
            properties: valProps,
            required: values
        };
    }
    return {
        type: 'OBJECT',
        properties,
        required: categorySubset
    };
}

/** Extract a JSON object from Gemini text using multiple fallback strategies */
function extractJson(text) {
    if (!text) return null;
    const trimmed = text.trim();

    // 1. Direct parse
    try { return JSON.parse(trimmed); } catch (_) {}

    // 2. Markdown code block
    const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
        try { return JSON.parse(codeMatch[1].trim()); } catch (_) {}
    }

    // 3. First '{' to last '}'
    const firstBrace = trimmed.indexOf('{');
    const lastBrace  = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = trimmed.slice(firstBrace, lastBrace + 1);
        try { return JSON.parse(candidate); } catch (_) {}

        // 4. Repair truncated JSON
        const repaired = repairTruncatedJson(candidate);
        if (repaired) {
            try { return JSON.parse(repaired); } catch (_) {}
        }
    }

    return null;
}

/** Repair truncated JSON by closing open strings / objects / arrays */
function repairTruncatedJson(str) {
    if (!str || !str.trim()) return null;
    let s = str.trim();
    let inString = false;
    let escape = false;
    const stack = [];
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (inString) { if (ch === '"') inString = false; continue; }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{' || ch === '[') { stack.push(ch); continue; }
        if (ch === '}') { if (stack.length && stack[stack.length - 1] === '{') stack.pop(); continue; }
        if (ch === ']') { if (stack.length && stack[stack.length - 1] === '[') stack.pop(); continue; }
    }
    if (inString) s += '"';
    while (stack.length) {
        const opener = stack.pop();
        s += (opener === '{') ? '}' : ']';
    }
    s = s.replace(/,\s*([}\]])/g, '$1');
    try { JSON.parse(s); return s; } catch (_) { return null; }
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

    const { type, difficultyLevel, metricsSummary, existingQuestions, pairs, categories } = req.body || {};

    // ── Health check ───────────────────────────────────────────────────────
    if (type === 'health') {
        let resolvedModel;
        try {
            resolvedModel = await resolveModel(apiKey);
        } catch (err) {
            resolvedModel = PREFERRED_MODEL;
        }

        try {
            const testRes = await generateContentWithRetry(apiKey, {
                contents: [{ parts: [{ text: 'Reply with exactly {"status":"ok"}' }] }],
                generationConfig: {
                    temperature: 0,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'OBJECT',
                        properties: { status: { type: 'STRING' } },
                        required: ['status']
                    }
                }
            });
            const testData = await testRes.json();
            const testText = testData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const testParsed = extractJson(testText);
            const trulyReady = testRes.ok && testParsed?.status === 'ok';

            if (!trulyReady) {
                console.error('[Gemini Proxy] Health check DEGRADED — HTTP:', testRes.status, '| parsed:', testParsed, '| raw text:', testText.substring(0, 200));
            }

            return res.status(200).json({
                status: trulyReady ? 'ok' : 'degraded',
                model: resolvedModel,
                preferredModel: PREFERRED_MODEL,
                isFallback: resolvedModel.toLowerCase() !== PREFERRED_MODEL.toLowerCase(),
                ready: trulyReady,
                ...(trulyReady ? {} : {
                    error: testRes.ok
                        ? `Gemini API returned HTTP ${testRes.status} but body did not contain {"status":"ok"} (parsed: ${JSON.stringify(testParsed)})`
                        : `Gemini API returned HTTP ${testRes.status} — ${testData.error?.message || 'unknown error'}`
                })
            });
        } catch (err) {
            console.error('[Gemini Proxy] Health check failed:', err);
            return res.status(200).json({
                status: 'degraded',
                model: resolvedModel,
                preferredModel: PREFERRED_MODEL,
                isFallback: resolvedModel.toLowerCase() !== PREFERRED_MODEL.toLowerCase(),
                ready: false,
                error: err.message
            });
        }
    }

    // ── Telephone scoring request ──────────────────────────────────────────
    if (type === 'telephone') {
        if (!Array.isArray(pairs) || pairs.length === 0) {
            return res.status(400).json({ error: 'Bad request: pairs array required for telephone scoring' });
        }

        const prompt = buildTelephonePrompt(pairs);

        try {
            const geminiRes = await generateContentWithRetry(apiKey, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'ARRAY',
                        items: { type: 'INTEGER', minimum: 0, maximum: 100 }
                    }
                }
            });

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

    const categorySubset = categories || CATEGORIES;
    const prompt = buildPrompt(difficultyLevel, metricsSummary, existingQuestions || null, categorySubset);

    try {
        const geminiRes = await generateContentWithRetry(apiKey, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.65,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
                responseSchema: buildResponseSchema(categorySubset, VALUES)
            }
        });

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

        // Parse server-side so the client gets clean JSON when possible
        const questions = extractJson(text);
        const responseBody = { text };
        if (questions && typeof questions === 'object') {
            responseBody.questions = questions;
        } else {
            console.warn('[Gemini Proxy] Could not parse SBMM JSON server-side');
        }

        return res.status(200).json(responseBody);

    } catch (err) {
        console.error('[Gemini Proxy] Request failed:', err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}
