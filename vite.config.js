import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [svelte(), VitePWA({
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
  })]
})
