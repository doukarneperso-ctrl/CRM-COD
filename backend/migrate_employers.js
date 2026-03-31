const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    console.log('Connected to database.');

    // Create employers table
    await client.query(`
        CREATE TABLE IF NOT EXISTS employers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            age INT,
            phone VARCHAR(20),
            role VARCHAR(100),
            salary NUMERIC(10,2) NOT NULL DEFAULT 0,
            join_date DATE NOT NULL DEFAULT CURRENT_DATE,
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
        );
    `);
    console.log('✅ employers table created');

    // Create employer_attendance table
    await client.query(`
        CREATE TABLE IF NOT EXISTS employer_attendance (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employer_id UUID NOT NULL REFERENCES employers(id),
            date DATE NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'absent',
            week_start DATE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(employer_id, date)
        );
    `);
    console.log('✅ employer_attendance table created');

    // Create employer_salary_payments table
    await client.query(`
        CREATE TABLE IF NOT EXISTS employer_salary_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employer_id UUID NOT NULL REFERENCES employers(id),
            week_start DATE NOT NULL,
            full_days INT DEFAULT 0,
            half_days INT DEFAULT 0,
            daily_rate NUMERIC(10,2) DEFAULT 0,
            total_amount NUMERIC(10,2) DEFAULT 0,
            is_paid BOOLEAN DEFAULT false,
            paid_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(employer_id, week_start)
        );
    `);
    console.log('✅ employer_salary_payments table created');

    // Add permission
    await client.query(`
        INSERT INTO permissions (id, slug, name, module)
        SELECT gen_random_uuid(), 'manage_employers', 'manage_employers', 'employers'
        WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage_employers');
    `);
    console.log('✅ manage_employers permission added');

    // Assign to admin role
    const adminRole = await client.query(`SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`);
    if (adminRole.rows.length > 0) {
        const perm = await client.query(`SELECT id FROM permissions WHERE name = 'manage_employers' LIMIT 1`);
        if (perm.rows.length > 0) {
            await client.query(`
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [adminRole.rows[0].id, perm.rows[0].id]);
            console.log('✅ manage_employers assigned to Admin role');
        }
    }

    await client.end();
    console.log('Done!');
}

migrate().catch(err => { console.error(err); process.exit(1); });
