-- ============================================================
-- Add missing columns to orders table
-- The application code references these columns but they were
-- not in the original schema migration.
-- ============================================================

-- Add confirmed_by, confirmed_at, shipping_cost, discount, call_attempts
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_attempts INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT;

-- Add total_orders to customers (code uses both order_count and total_orders)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;

-- Add total_price to order_items (code references total_price, schema has total)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);
-- Backfill total_price from total if any existing data
UPDATE order_items SET total_price = total WHERE total_price IS NULL AND total IS NOT NULL;

-- Add status_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  field       VARCHAR(50) NOT NULL,
  old_value   VARCHAR(100),
  new_value   VARCHAR(100),
  changed_by  UUID REFERENCES users(id),
  note        TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON status_history(order_id);
