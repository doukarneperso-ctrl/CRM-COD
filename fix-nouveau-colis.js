const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log('Connecting to database...');
  const res = await pool.query(`UPDATE orders SET courier_status = 'En attente de ramassage' WHERE courier_status = 'Nouveau Colis'`);
  console.log(`Updated ${res.rowCount} orders.`);
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
