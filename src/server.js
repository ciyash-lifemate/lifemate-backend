import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { testConnection } from './config/db.js';
import { initSocket } from './realtime/socket.js';
import { startReminderScheduler } from './modules/user/reminders/reminders.scheduler.js';

const start = async () => {
  await testConnection();

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  startReminderScheduler();

  httpServer.listen(env.port, () => {
    console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
   