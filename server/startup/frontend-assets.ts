import express, { type Express } from 'express';
import type { Server as HttpServer } from 'node:http';
import path from 'path';

export async function registerFrontendAssets(app: Express, isProd: boolean, server?: HttpServer) {
    // Start with Vite as early as possible in dev mode
    if (!isProd) {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: {
            hmr: server ? { server } : undefined,
            middlewareMode: true,
            watch: {
            ignored: ['.local/**', '**/.local/**', '**/node_modules/**', '**/dist/**'],
              },
            },
            appType: 'spa',
        });
        app.use(vite.middlewares);
      } catch (e) {
        console.error("Vite initialization failed:", e);
      }
    } else {
      app.use(express.static('dist', {
        setHeaders: (res, filePath) => {
          const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
          const fileName = path.basename(filePath);
          const isAppIconAsset = /^(?:favicon-\d+|icon|icon-\d+|apple-touch-icon)\.(?:png|ico|webp|avif|svg)$/i.test(fileName);
          const isShareFallbackAsset = /^share-fallback\.(?:png|ico|webp|avif|svg)$/i.test(fileName);
          const cacheControl = fileName === 'sw.js'
            ? 'public, max-age=0, must-revalidate'
            : isHashedAsset
              ? 'public, max-age=31536000, immutable'
              : isAppIconAsset
                ? 'public, max-age=0, must-revalidate'
                : isShareFallbackAsset
                  ? 'public, max-age=604800, stale-while-revalidate=2592000'
                  : 'public, max-age=0, must-revalidate';
          res.setHeader(
            'Cache-Control',
            cacheControl
          );
        }
      }));
      app.get(['/admin', '/admin/*'], (_req, res) => {
        res.status(404).send('Not found');
      });
      app.get('/assets/*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.status(404).type('text/plain').send('Asset not found');
      });
      app.get('*', (_req, res) => {
        res.sendFile('dist/index.html', { root: '.' });
      });
    }
}