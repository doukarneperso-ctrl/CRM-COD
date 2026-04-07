const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query(`SELECT courier_status, COUNT(*) FROM orders GROUP BY courier_status`);
  console.log('Status counts:', res.rows);
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
