// ─── RSS/URL Proxy ────────────────────────────────────────────────────────────
async function handleProxy(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) return new Response('Missing url param', { status: 400 });

  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsProxy/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    return new Response(body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return new Response(`Proxy error: ${e.message}`, { status: 502 });
  }
}

// ─── NewsAPI Proxy (key stays server-side) ────────────────────────────────────
const rateLimitMap = new Map();

async function handleNews(request, env) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return new Response('Missing path param', { status: 400 });

  const apiKey = env.NEWSAPI_KEY;
  if (!apiKey) return new Response('NewsAPI key not configured', { status: 500 });

  // Rate limit: 20 req/IP/hour
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, reset: now + 3600000 };
  if (now > record.reset) { record.count = 0; record.reset = now + 3600000; }
  record.count++;
  rateLimitMap.set(ip, record);
  if (record.count > 20) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  try {
    const apiUrl = `https://newsapi.org/v2/${path}&apiKey=${apiKey}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
      },
    });
  } catch (e) {
    return new Response(`NewsAPI error: ${e.message}`, { status: 502 });
  }
}

// ─── Main fetch handler ───────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/proxy') return handleProxy(request);
    if (url.pathname === '/api/news') return handleNews(request, env);

    // Fall through to static assets (handled by CF Assets binding)
    return env.ASSETS.fetch(request);
  },
};
