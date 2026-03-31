import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './database';
import { env } from './env';

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
    store: new PgSession({
        pool: pool,
        tableName: 'sessions',
        createTableIfMissing: true,
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: env.SESSION_MAX_AGE,
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
    },
});
