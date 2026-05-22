/**
 * Cloudflare Pages Function — server-side RSS proxy
 * Route: GET /api/proxy?url=<encoded-url>
 * Runs at Cloudflare edge — no CORS, fast, 5-min cache.
 */
export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');

  if (!target) {
    return new Response('Missing ?url= parameter', { status: 400 });
  }

  if (!/^https?:\/\//.test(target)) {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HealthyThoughtsBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(20000),
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300', // 5-min edge cache
      },
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
