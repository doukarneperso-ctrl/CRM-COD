const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function fixAdmin() {
    const pool = new Pool({ connectionString: 'postgresql://crm_user:crm_pass_2026@localhost:5432/crm_cod' });

    // Generate correct hash for 'admin123'
    const hash = await bcrypt.hash('admin123', 12);
    console.log('Generated hash:', hash);

    // Update admin user
    const result = await pool.query(
        "UPDATE users SET password_hash = $1 WHERE username = 'admin'",
        [hash]
    );

    console.log('Updated', result.rowCount, 'row(s)');

    // Verify it works
    const user = await pool.query("SELECT id, username, password_hash FROM users WHERE username = 'admin'");
    const valid = await bcrypt.compare('admin123', user.rows[0].password_hash);
    console.log('Verify login works:', valid ? '✅ YES' : '❌ NO');

    await pool.end();
}

fixAdmin();
