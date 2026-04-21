import app from './src/app.js';
import { logger } from './src/utils/logger.js';

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
  logger.info('server started', {
    port,
    host: '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    url: `http://0.0.0.0:${port}/`,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', {
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.warn('received SIGINT, exiting');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warn('received SIGTERM, exiting');
  process.exit(0);
});
