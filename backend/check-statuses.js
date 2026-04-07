const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query(`SELECT DISTINCT courier_status FROM orders WHERE courier_status IS NOT NULL`);
  console.log('Distinct statuses in DB:', res.rows.map(r => r.courier_status));
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
