-- ============================================================
-- 010: Create courier_invoices table
-- ============================================================

CREATE TABLE IF NOT EXISTS courier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_number VARCHAR(100) NOT NULL,
    invoice_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    courier_name VARCHAR(100) DEFAULT 'Unknown',
    order_id UUID REFERENCES orders(id),
    matched BOOLEAN DEFAULT false,
    amount_mismatch BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    notes TEXT,
    imported_by UUID REFERENCES users(id),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_invoices_tracking ON courier_invoices(tracking_number);
CREATE INDEX IF NOT EXISTS idx_courier_invoices_status ON courier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_courier_invoices_order ON courier_invoices(order_id);
