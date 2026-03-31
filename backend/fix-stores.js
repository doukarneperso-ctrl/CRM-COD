const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://crm_user:crm_pass_2026@localhost:5432/crm_cod' });

async function main() {
    const alterSQL = `
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS access_token TEXT;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS refresh_token TEXT;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_by UUID;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS sync_requested_at TIMESTAMP;

        -- Add unique constraint for platform + external_id (needed for ON CONFLICT)
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'stores_platform_external_id_key'
            ) THEN
                ALTER TABLE stores ADD CONSTRAINT stores_platform_external_id_key UNIQUE (platform, external_id);
            END IF;
        END $$;
    `;

    await pool.query(alterSQL);
    console.log('✅ Stores table updated with missing columns');

    // Verify
    const result = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='stores' ORDER BY ordinal_position"
    );
    console.log('Columns:', result.rows.map(r => r.column_name).join(', '));
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
