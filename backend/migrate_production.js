const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    console.log('Connected to database.');

    // ─── Stock Tables ──────────────────────────────────

    await client.query(`
        CREATE TABLE IF NOT EXISTS stock_tissus (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tissu_name VARCHAR(150) NOT NULL,
            color VARCHAR(80),
            quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
            unit VARCHAR(10) NOT NULL DEFAULT 'M',
            price_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ stock_tissus table created');

    await client.query(`
        CREATE TABLE IF NOT EXISTS stock_supplies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            item_name VARCHAR(150) NOT NULL,
            category VARCHAR(80),
            quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
            unit VARCHAR(20) DEFAULT 'pcs',
            price_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ stock_supplies table created');

    // ─── Product Tables ────────────────────────────────

    await client.query(`
        CREATE TABLE IF NOT EXISTS products_atelier (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200) NOT NULL,
            photo_url TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ products_atelier table created');

    await client.query(`
        CREATE TABLE IF NOT EXISTS product_tissus (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id UUID NOT NULL REFERENCES products_atelier(id) ON DELETE CASCADE,
            stock_tissu_id UUID NOT NULL REFERENCES stock_tissus(id),
            consumption_per_piece NUMERIC(10,4) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ product_tissus table created');

    await client.query(`
        CREATE TABLE IF NOT EXISTS product_rolos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id UUID NOT NULL REFERENCES products_atelier(id) ON DELETE CASCADE,
            stock_tissu_id UUID REFERENCES stock_tissus(id),
            color VARCHAR(80),
            quantity INT NOT NULL DEFAULT 1,
            meters_per_rolo NUMERIC(10,2) NOT NULL DEFAULT 0,
            expected_pieces INT DEFAULT 0,
            actual_pieces INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ product_rolos table created');

    await client.query(`
        CREATE TABLE IF NOT EXISTS product_cutting (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id UUID NOT NULL REFERENCES products_atelier(id) ON DELETE CASCADE,
            meters NUMERIC(10,2) DEFAULT 0,
            cm NUMERIC(10,2) DEFAULT 0,
            cutting_date DATE,
            work_start_date DATE,
            work_end_date DATE,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ product_cutting table created');

    await client.query(`
        CREATE TABLE IF NOT EXISTS product_expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id UUID NOT NULL REFERENCES products_atelier(id) ON DELETE CASCADE,
            expense_name VARCHAR(150) NOT NULL,
            stock_supply_id UUID REFERENCES stock_supplies(id),
            unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
            qty_per_piece NUMERIC(10,4) NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('✅ product_expenses table created');

    // ─── Permission ────────────────────────────────────
    // Reuses manage_employers permission (same sidebar area)

    await client.end();
    console.log('Done! All production tables created.');
}

migrate().catch(err => { console.error(err); process.exit(1); });
