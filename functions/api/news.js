/**
 * Cloudflare Pages Function — secure NewsAPI proxy
 * Route: GET /api/news?path=<encoded-path>
 *
 * - NewsAPI key stored as CF secret NEWSAPI_KEY (never sent to browser)
 * - Rate limit: 20 requests per IP per hour using CF KV (or simple in-memory fallback)
 * - Returns JSON directly, CORS-enabled for the PWA
 */

// Simple in-memory rate limiter (resets per isolate restart, good enough for edge)
const rateLimitMap = new Map(); // ip → { count, windowStart }
const RATE_LIMIT = 20;          // max requests per IP per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (entry.count >= RATE_LIMIT) return false; // blocked
  entry.count++;
  return true; // allowed
}

export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return json({ error: 'Missing ?path= parameter' }, 400);
  }

  // Rate limit check
  if (!checkRateLimit(ip)) {
    return json({ error: 'Rate limit exceeded. Try again later.' }, 429);
  }

  const apiKey = env.NEWSAPI_KEY;
  if (!apiKey) {
    return json({ error: 'News service not configured' }, 503);
  }

  try {
    const url = `https://newsapi.org/v2/${path}&apiKey=${apiKey}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HealthyThoughtsApp/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return json(data, res.status);
  } catch (err) {
    return json({ error: `Upstream error: ${err.message}` }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=120', // 2-min edge cache
    },
  });
}
