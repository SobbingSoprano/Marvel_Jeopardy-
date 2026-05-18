/*
============================================================
 MARVEL JEOPARDY - SERVICE WORKER
 Caches static assets for fast repeat visits.

 Strategy per resource type:
   HTML pages      → Network-first  (always get latest updates)
   CSS / JS        → Cache-first, revalidate in background
   Audio (sounds)  → Cache-first    (immutable game assets)
   Fonts           → Cache-first    (Google Fonts, versioned)
   Images          → Cache-first, stale-while-revalidate
   Video           → Network-only   (too large to store in Cache API)
   API (/api/*)    → Network-only   (never cache AI responses)
   Firebase        → Network-only
============================================================
*/

const CACHE_VERSION  = 'v2';
const CACHE_STATIC   = `marvel-static-${CACHE_VERSION}`;
const CACHE_RUNTIME  = `marvel-runtime-${CACHE_VERSION}`;

// Assets to pre-cache on install (small, always needed)
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/marvel.css',
    '/preloader.js',
    '/page-transitions.js',
    '/visual-effects.js',
    '/audio-manager.js',
    '/ai-sbmm.js',
    '/firebase-config.js',
    '/community-training.js',
    '/questions.js',
    '/security.js',
    '/Assets/Sounds/click.wav',
    '/Assets/Sounds/ai-sbmm hover.wav',
    '/Assets/Sounds/community-train. hover.wav',
    '/Assets/Sounds/telephone.wav',
];

// ── Install: pre-cache all critical static assets ────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: purge old cache versions ───────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: route each request to the right strategy ──────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // ── Never cache: API calls, Firebase, or non-GET ──────────────────────
    if (
        request.method !== 'GET' ||
        url.pathname.startsWith('/api/') ||
        url.hostname.endsWith('firebaseio.com') ||
        url.hostname.endsWith('firebaseapp.com') ||
        url.hostname === 'www.gstatic.com'       // Firebase SDK CDN
    ) {
        return; // let the browser handle it normally
    }

    // ── Never cache: video files (range requests + large size) ────────────
    if (/\.(mp4|webm|ogv|mov)$/i.test(url.pathname)) {
        return;
    }

    // ── Cache-first: Google Fonts (versioned, long-lived) ─────────────────
    if (
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com'
    ) {
        event.respondWith(cacheFirst(request, CACHE_RUNTIME));
        return;
    }

    // ── Cache-first: CSS, JS, audio, images ───────────────────────────────
    if (/\.(css|js|mp3|wav|ogg|png|jpe?g|gif|svg|ico|webp|avif|woff2?)$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }

    // ── Network-first: HTML pages ──────────────────────────────────────────
    if (request.headers.get('Accept')?.includes('text/html')) {
        event.respondWith(networkFirst(request, CACHE_STATIC));
        return;
    }

    // ── Default: network-only for everything else ──────────────────────────
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

/** Cache-first: serve from cache; if missing, fetch and cache it. */
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }
    return response;
}

/**
 * Stale-while-revalidate: respond with cache immediately,
 * then refresh the cache entry in the background.
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);

    const networkFetch = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => cached); // fall back to stale if offline

    return cached || networkFetch;
}

/**
 * Network-first: try network; fall back to cache on failure.
 * Good for HTML where freshness matters but offline fallback is nice.
 */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (_) {
        const cached = await caches.match(request);
        return cached || new Response('Offline — check your connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}
