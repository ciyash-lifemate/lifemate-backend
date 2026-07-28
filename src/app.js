import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiRoutes } from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(
    morgan(env.nodeEnv === 'production' ? 'combined' : 'dev', {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/v1', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
