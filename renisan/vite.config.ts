import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Set BASE_PATH when hosting under a sub-path, e.g. GitHub Pages project sites:
//   BASE_PATH=/renisan/ npm run build
// Defaults to "/" (root of a domain — Netlify, Vercel, Cloudflare Pages, custom domain).
const rawBase = process.env.BASE_PATH || '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

// Public site address used for link previews (og:image, canonical). Set it before launch:
//   SITE_URL=https://renisan.example npm run build
// Without it, previews fall back to relative URLs (works on some apps, not all).
const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');
if (!siteUrl && process.env.NODE_ENV === 'production') {
  console.warn('\n[renisan] SITE_URL is not set — link previews (WhatsApp/Telegram) may not show the image.\n');
}
const siteBase = siteUrl ? `${siteUrl}${base.replace(/\/$/, '')}` : base.replace(/\/$/, '');

export default defineConfig({
  base,
  plugins: [
    {
      name: 'renisan-site-url',
      transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteBase),
      // robots.txt and sitemap.xml are copied verbatim from public/, so patch them after the build
      closeBundle() {
        for (const f of ['robots.txt', 'sitemap.xml']) {
          const p = fileURLToPath(new URL(`dist/${f}`, import.meta.url));
          if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__SITE_URL__', siteBase));
        }
      }
    },
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered manually in src/main.tsx
      includeAssets: ['favicon.ico', 'robots.txt', 'sitemap.xml', 'data/*.json', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        id: base,
        name: 'ڕێنیسان - ڕێبەری زانکۆ و سکۆلارشیپ',
        short_name: 'ڕێنیسان',
        description: 'فحص القبول الجامعي والمنح الدراسية - ڕێبەری وەرگیرانی زانکۆ و دەرفەتەکانی سکۆلارشیپ',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        shortcuts: [
          { name: 'پشکنەری نمرە / فاحص القبول', url: `${base}?tab=checker`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'سکۆلارشیپ / المنح الدراسية', url: `${base}?tab=scholarships`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] }
        ],
        display: 'standalone',
        orientation: 'portrait',
        dir: 'rtl',
        lang: 'ckb',
        start_url: base,
        scope: base,
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        // Datasets are precached with each deploy, so the app works fully offline
        // and data updates ship atomically with the code that reads them.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,txt}'],
        globIgnores: ['**/og-image.png'],
        // 1,263 federal rows + fonts comfortably fit, but keep a sane ceiling
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts stylesheet — refresh in background
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            // Font files are immutable — cache for a year so Vazirmatn works offline
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat'
    }
  }
});
