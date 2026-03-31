import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
    console.log('🔄 Running migrations...\n');

    // Create migrations tracking table
    await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

    // Get already applied migrations
    const applied = await pool.query('SELECT filename FROM _migrations ORDER BY id');
    const appliedFiles = new Set(applied.rows.map((r: any) => r.filename));

    // Read migration files
    const migrationsDir = resolve(__dirname, '../migrations');
    const files = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    let count = 0;
    for (const file of files) {
        if (appliedFiles.has(file)) {
            console.log(`  ⏭️  ${file} (already applied)`);
            continue;
        }

        const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');

        try {
            await pool.query('BEGIN');
            await pool.query(sql);
            await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
            await pool.query('COMMIT');
            console.log(`  ✅ ${file}`);
            count++;
        } catch (error: any) {
            await pool.query('ROLLBACK');
            console.error(`  ❌ ${file}: ${error.message}`);
            process.exit(1);
        }
    }

    console.log(`\n✅ ${count} migration(s) applied. Total: ${appliedFiles.size + count}`);
    await pool.end();
}

runMigrations().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
