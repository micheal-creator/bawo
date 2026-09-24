import { createServer } from 'node:http';
import express from 'express';
import { config } from './config.js';
import { closePool, migrate } from './db.js';
import { closeRedis } from './redis.js';
import { createRealtimeServer } from './realtime.js';
import { router } from './routes.js';
import { resolveCorsOrigin } from './config.js';

async function main(): Promise<void> {
  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = resolveCorsOrigin(req.headers.origin);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.use(router);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[http] unhandled error', error);
    res.status(500).json({ error: 'server_error' });
  });

  await migrate();

  const httpServer = createServer(app);
  createRealtimeServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, config.host, resolve);
  });

  console.log(`[bawo] listening on ${config.publicUrl} (otp: ${config.otp.mode})`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[bawo] ${signal} received, shutting down`);
    httpServer.close();
    await Promise.allSettled([closeRedis(), closePool()]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('[bawo] failed to start', error);
  process.exit(1);
});
