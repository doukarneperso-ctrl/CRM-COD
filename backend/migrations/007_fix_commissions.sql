-- Migration: Fix commission_rules and commissions tables to match backend queries
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS checks)

-- ============================================================
-- Fix commission_rules
-- ============================================================

-- Add category_id column (references product_categories)
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id);

-- Rename 'type' to 'rule_type' to avoid confusion with backend
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'commission_rules' AND column_name = 'type') THEN
        ALTER TABLE commission_rules RENAME COLUMN type TO rule_type;
    END IF;
END $$;

-- Add missing columns
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- ============================================================
-- Fix commissions table
-- ============================================================

-- Add missing columns
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
