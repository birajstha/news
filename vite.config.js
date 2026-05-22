import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/news/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      base: '/news/',
      scope: '/news/',
      manifest: {
        name: 'BirajNews — नेपाली समाचार',
        short_name: 'BirajNews',
        description: 'USA/Nepal news portal for Nepalis worldwide',
        theme_color: '#060d14',
        background_color: '#060d14',
        display: 'standalone',
        start_url: '/news/',
        scope: '/news/',
        icons: [
          { src: '/news/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/news/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/news/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ]
})
