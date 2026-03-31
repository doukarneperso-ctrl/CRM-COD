import winston from 'winston';
import { env } from '../config/env';

const logger = winston.createLogger({
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        env.NODE_ENV === 'development'
            ? winston.format.combine(winston.format.colorize(), winston.format.simple())
            : winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        ...(env.NODE_ENV === 'production'
            ? [
                new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: './logs/app.log' }),
            ]
            : []),
    ],
});

export default logger;
