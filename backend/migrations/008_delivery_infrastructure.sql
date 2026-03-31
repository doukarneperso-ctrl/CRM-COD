-- ============================================================
-- 008: Delivery Infrastructure — Couriers + City Fees
-- Adds missing columns to couriers and creates city_shipping_fees
-- ============================================================

-- Add missing columns to couriers table
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS api_endpoint TEXT;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- City shipping fees table
CREATE TABLE IF NOT EXISTS city_shipping_fees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id      UUID REFERENCES couriers(id) ON DELETE CASCADE,
  city_name       VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  shipping_fee    DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  UNIQUE(courier_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_csf_courier ON city_shipping_fees(courier_id);
CREATE INDEX IF NOT EXISTS idx_csf_normalized ON city_shipping_fees(normalized_name);

-- Add tracking_number column to orders if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number) WHERE tracking_number IS NOT NULL;
