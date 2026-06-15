import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    svelte(),
    // Dev-only: handle /api/proxy and /api/news locally
    {
      name: 'api-proxy',
      configureServer(server) {
        server.middlewares.use('/api/proxy', async (req, res) => {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const target = url.searchParams.get('url');
          if (!target) {
            res.statusCode = 400;
            res.end('Missing url param');
            return;
          }
          try {
            const response = await fetch(target, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HealthyThoughtsBot/1.0)' },
              signal: AbortSignal.timeout(15000),
            });
            const body = await response.text();
            res.setHeader('Content-Type', response.headers.get('content-type') || 'text/xml');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = response.status;
            res.end(body);
          } catch (e) {
            res.statusCode = 502;
            res.end(`Proxy error: ${e.message}`);
          }
        });

        server.middlewares.use('/api/news', async (req, res) => {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const path = url.searchParams.get('path');
          if (!path) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing path param' }));
            return;
          }
          const apiKey = process.env.NEWSAPI_KEY;
          if (!apiKey) {
            // No key in dev — return empty, relies on RSS fallback
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = 200;
            res.end(JSON.stringify({ status: 'ok', articles: [] }));
            return;
          }
          try {
            const apiUrl = `https://newsapi.org/v2/${path}&apiKey=${apiKey}`;
            const response = await fetch(apiUrl, {
              headers: { 'User-Agent': 'HealthyThoughtsApp/1.0' },
              signal: AbortSignal.timeout(10000),
            });
            const data = await response.json();
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = response.status;
            res.end(JSON.stringify(data));
          } catch (e) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      base: '/',
      scope: '/',
      manifest: {
        name: 'Healthy Thoughts — नेपाली समाचार',
        short_name: 'HealthyThoughts',
        description: 'USA/Nepal news portal for Nepalis worldwide',
        theme_color: '#060d14',
        background_color: '#060d14',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ]
})
