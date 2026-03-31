import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(10),
    SESSION_MAX_AGE: z.coerce.number().default(3600000),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_FILE_SIZE: z.coerce.number().default(10485760),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
}

export const env = parsed.data;
