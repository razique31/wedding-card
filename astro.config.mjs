import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  output: 'static',
  integrations: [
    AstroPWA({
      site: 'https://wedding-card-588.pages.dev',
      output: 'static',
      registerType: 'autoUpdate',
      manifest: {
        name: 'The Wedding Of Farheen Naaz & Sk Abdul Wasim',
        short_name: 'Wedding',
        description: 'Wedding Invitation',
        start_url: '/',
        theme_color: '#1A1128',
        background_color: '#1A1128',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/pwa-192x192.webp',
            sizes: '192x192',
            type: 'image/webp'
          },
          {
            src: '/pwa-512x512.webp',
            sizes: '512x512',
            type: 'image/webp'
          },
          {
            src: '/pwa-maskable-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,webp,svg,woff2}'],
        navigateFallbackDenylist: [/^\/video\//, /^\/music\//],
      }
    })
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: 4096, // Never inline the video
    },
  },
  build: {
    inlineStylesheets: 'always',
    assets: '_astro',
  },
});
