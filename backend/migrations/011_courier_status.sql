-- ============================================================
-- Migration 011: Add courier_status to orders
-- Stores the original courier status (e.g., "Ramassé", "Livré")
-- alongside the mapped CRM shipping_status
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_status VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_status_at TIMESTAMP;

-- Index for filtering by courier status
CREATE INDEX IF NOT EXISTS idx_orders_courier_status ON orders(courier_status) WHERE courier_status IS NOT NULL;
