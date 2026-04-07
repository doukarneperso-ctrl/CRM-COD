const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log('Connecting to database...');
  // Case-insensitive update to be extra sure
  const res = await pool.query(`UPDATE orders SET courier_status = 'Attente De Ramassage' WHERE courier_status ILIKE 'Nouveau Colis'`);
  console.log(`Updated ${res.rowCount} orders.`);
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
