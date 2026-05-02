import type { Express } from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function log(msg: string) {
  console.log(`[pulse] ${msg}`);
}

export function serveStatic(app: Express) {
  // __dirname is available in CJS build; use cwd fallback for safety
  const base = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : process.cwd();
  const distPath = path.resolve(base, 'dist', 'public');
  if (!fs.existsSync(distPath)) {
    throw new Error(`Build directory not found: ${distPath}. Run npm run build first.`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  app.use(express.static(distPath));
  app.use('/{*path}', (_req: any, res: any) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

// setupVite is dev-only — dynamically imported to avoid bundling vite in prod CJS
export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer, createLogger } = await import('vite');
  const { default: viteConfig } = await import('../vite.config');
  const { nanoid } = await import('nanoid');

  const viteLogger = createLogger();

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg: string, options?: any) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server, path: '/vite-hmr' },
      allowedHosts: true as const,
    },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use('/{*path}', async (req: any, res: any, next: any) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(process.cwd(), 'client', 'index.html');
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
