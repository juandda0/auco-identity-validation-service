import pino from 'pino';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createContainer } from './container.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

const container = await createContainer(config, logger);
const app = await buildApp(container.deps, logger);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  await container.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
