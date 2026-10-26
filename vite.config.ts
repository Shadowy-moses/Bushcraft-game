import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages serves this project at /Bushcraft-game/.
 * A later Capacitor build should set VITE_BASE_PATH=./ so the built
 * asset URLs are relative and load inside the app bundle. No game
 * code has to change for that. Capacitor itself is not set up yet.
 */
function siteBase(): string {
  const raw = process.env.VITE_BASE_PATH ?? '/Bushcraft-game/';
  if (raw === './' || raw === '.') return './';
  let base = raw.trim();
  if (!base.startsWith('/') && !base.startsWith('.')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

const mime: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export default defineConfig({
  base: siteBase(),
  plugins: [
    {
      name: 'artist-assets',
      configureServer(server) {
        const root = path.resolve('assets');
        server.middlewares.use((req, res, next) => {
          const raw = (req.url ?? '').split('?')[0];
          const base = server.config.base.replace(/\/$/, '');
          let urlPath = raw;
          if (base && base !== '.' && urlPath.startsWith(base)) urlPath = urlPath.slice(base.length);
          if (!urlPath.startsWith('/assets/')) return next();
          const rel = decodeURIComponent(urlPath.slice('/assets/'.length));
          const file = path.resolve(root, rel);
          if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
            return next();
          }
          res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          createReadStream(file).pipe(res);
        });
      },
      writeBundle() {
        cpSync(path.resolve('assets'), path.resolve('dist/assets'), { recursive: true });
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
