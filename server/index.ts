import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { registerRoutes } from './routes';
import { setupVite, serveStatic, log } from './vite';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// CORS for local dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

(async () => {
  // Apply additive schema migrations on boot (idempotent CREATE TABLE IF NOT
  // EXISTS — no-ops when tables exist; keeps Render deploys self-migrating so
  // no operator ever needs to run SQL by hand). Rollback notes per file in
  // server/migrations/*.sql.
  try {
    await (await import('./migrate-v2')).migrateOnBoot();
  } catch (e: any) {
    log(`migration warning: ${e?.message ?? e} — continuing (migrations are additive)`);
  }

  const server = createServer(app);
  registerRoutes(server, app);

  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000');
  server.listen(port, '0.0.0.0', () => {
    log(`PulseNSFW running on port ${port}`);
  });
})();
