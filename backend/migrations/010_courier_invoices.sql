-- ============================================================
-- 010: Restructure courier_invoices table
-- The table was created in 001 with a different schema.
-- This migration adds the missing columns to match the new schema.
-- ============================================================

-- Add missing columns to the existing courier_invoices table
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS invoice_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS invoice_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100) DEFAULT 'Unknown';
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS matched BOOLEAN DEFAULT false;
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS amount_mismatch BOOLEAN DEFAULT false;
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES users(id);
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE courier_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Update status check constraint if needed (add 'approved','rejected' alongside existing values)
ALTER TABLE courier_invoices DROP CONSTRAINT IF EXISTS courier_invoices_status_check;
ALTER TABLE courier_invoices ADD CONSTRAINT courier_invoices_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'verified', 'disputed'));

CREATE INDEX IF NOT EXISTS idx_courier_invoices_tracking ON courier_invoices(tracking_number);
CREATE INDEX IF NOT EXISTS idx_courier_invoices_status ON courier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_courier_invoices_order ON courier_invoices(order_id);
