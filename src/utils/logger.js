import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, json, colorize, printf } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${message}${rest}`;
  })
);

export const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (env.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({ format: consoleFormat }));
}
