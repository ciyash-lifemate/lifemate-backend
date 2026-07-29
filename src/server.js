import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { testConnection } from './config/db.js';
import { startReminderScheduler } from './modules/user/reminders/reminders.scheduler.js';
import { logger } from './utils/logger.js';

// An unhandled 'error'/rejection anywhere is otherwise a hard crash of the
// whole process (dropping every in-flight request) instead of just failing
// whatever triggered it - log it and keep running.
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (server kept running)', { message: err.message, stack: err.stack });
});
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection (server kept running)', { message: err?.message || err });
});

const start = async () => {
  await testConnection();

  const app = createApp();
  const httpServer = http.createServer(app);
  startReminderScheduler();

  // Without this, the HTTP server's own 'error' event (e.g. EADDRINUSE from
  // another instance still holding port 5000) is unhandled and crashes the
  // process instead of failing loudly and exiting cleanly.
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use - is another instance of this server running?`);
    } else {
      console.error('HTTP server error:', err.message);
    }
    process.exit(1);
  });

  httpServer.listen(env.port, () => {
    console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
      