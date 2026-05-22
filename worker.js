// ─── Smart edge cache with stale-while-revalidate ────────────────────────────
// All users share cached responses. NewsAPI/RSS only fetched when cache is stale.
// Peak hours (6-9am, 12-1pm, 6-9pm in ET and Nepal time): 15 min TTL
// Off-peak: 30 min TTL

const PEAK_WINDOWS = [
  [6, 9],   // morning
  [12, 13], // lunch
  [18, 21], // evening
];

function isPeakHour() {
  const now = new Date();
  // Check both ET (UTC-4) and Nepal (UTC+5:45)
  const etHour = (now.getUTCHours() - 4 + 24) % 24;
  const npHour = ((now.getUTCHours() * 60 + 45) / 60 + 5.75) % 24;
  return PEAK_WINDOWS.some(([start, end]) =>
    (etHour >= start && etHour < end) || (npHour >= start && npHour < end)
  );
}

function cacheTTL() {
  return isPeakHour() ? 15 * 60 : 30 * 60; // seconds
}

// Fetch with timeout helper
async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
}

// ─── Get from edge cache, trigger background refresh if stale ─────────────────
async function cacheGet(cacheKey, ctx, fetcher) {
  const cache = caches.default;
  const cached = await cache.match(cacheKey);

  if (cached) {
    const age = Date.now() - new Date(cached.headers.get('X-Cached-At')).getTime();
    const ttl = cacheTTL() * 1000;

    if (age < ttl) {
      // Fresh — return immediately
      return new Response(cached.body, cached);
    }

    // Stale — return cached immediately, refresh in background
    ctx.waitUntil(refreshCache(cacheKey, cache, fetcher));
    return new Response(cached.body, cached);
  }

  // No cache — fetch now and store
  const response = await fetcher();
  ctx.waitUntil(storeCache(cacheKey, cache, response.clone()));
  return response;
}

async function storeCache(cacheKey, cache, response) {
  if (!response.ok) return;
  const body = await response.text();
  const headers = new Headers(response.headers);
  headers.set('X-Cached-At', new Date().toUTCString());
  headers.set('Cache-Control', `public, max-age=${cacheTTL()}`);
  headers.set('Access-Control-Allow-Origin', '*');
  const toStore = new Response(body, { status: 200, headers });
  await cache.put(cacheKey, toStore);
}

async function refreshCache(cacheKey, cache, fetcher) {
  try {
    const response = await fetcher();
    await storeCache(cacheKey, cache, response);
  } catch (e) {
    // Silently fail — users already got stale content
    console.error('Background refresh failed:', e.message);
  }
}

// ─── RSS/URL Proxy ────────────────────────────────────────────────────────────
async function handleProxy(request, ctx) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) return new Response('Missing url param', { status: 400 });

  const cacheKey = `https://cache.news.internal/proxy?url=${encodeURIComponent(target)}`;

  return cacheGet(cacheKey, ctx, async () => {
    const res = await fetchWithTimeout(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HealthyThoughtsNews/1.0)' },
    }, 20000);
    const body = await res.text();
    return new Response(body, {
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/xml' },
    });
  });
}

// ─── NewsAPI Proxy — shared cache, never per-user ─────────────────────────────
const rateLimitMap = new Map();

async function handleNews(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return new Response('Missing path param', { status: 400 });

  const apiKey = env.NEWSAPI_KEY;
  if (!apiKey) return new Response('NewsAPI key not configured', { status: 500 });

  // Rate limit: 20 req/IP/hour (safety net — cache should absorb most traffic)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, reset: now + 3600000 };
  if (now > record.reset) { record.count = 0; record.reset = now + 3600000; }
  record.count++;
  rateLimitMap.set(ip, record);
  if (record.count > 20) return new Response('Rate limit exceeded', { status: 429 });

  const cacheKey = `https://cache.news.internal/newsapi?path=${encodeURIComponent(path)}`;

  return cacheGet(cacheKey, ctx, async () => {
    const apiUrl = `https://newsapi.org/v2/${path}&apiKey=${apiKey}`;
    const res = await fetchWithTimeout(apiUrl, {
      headers: { 'User-Agent': 'HealthyThoughtsNews/1.0' },
    }, 10000);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

// ─── Cache status endpoint (for debugging) ───────────────────────────────────
async function handleCacheStatus(request) {
  const peak = isPeakHour();
  return new Response(JSON.stringify({
    peak_hours: peak,
    ttl_minutes: cacheTTL() / 60,
    strategy: 'stale-while-revalidate',
    peak_windows: '6-9am, 12-1pm, 6-9pm (ET + Nepal)',
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/proxy')        return handleProxy(request, ctx);
    if (url.pathname === '/api/news')         return handleNews(request, env, ctx);
    if (url.pathname === '/api/cache-status') return handleCacheStatus(request);

    return env.ASSETS.fetch(request);
  },
};
