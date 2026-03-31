-- ============================================================
-- Fix schema gaps that break YouCan order sync
-- ============================================================

-- 1. Stores table: add missing columns for OAuth storage
ALTER TABLE stores ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS sync_requested_at TIMESTAMP;

-- Unique constraint for dedup on platform + external_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_platform_external
  ON stores(platform, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- 2. Orders table: add source_order_id for YouCan dedup
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_order_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_orders_source_order ON orders(source_order_id, store_id);

-- 3. Order items: add unit_cost column (used by import code)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2) DEFAULT 0;

-- 4. Customers: make phone_norm nullable (YouCan might not have phone)
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN phone_norm DROP NOT NULL;

-- 5. Create order_number_seq if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'order_number_seq') THEN
    CREATE SEQUENCE order_number_seq START WITH 1;
  END IF;
END $$;
