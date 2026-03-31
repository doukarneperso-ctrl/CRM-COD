-- ============================================================
-- 005: Upgrade ad_campaigns + add stores.sync_requested_at
-- ============================================================

-- Add missing columns to ad_campaigns
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS total_spent DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES users(id);

-- Add daily revenue tracking to ad_daily_costs
ALTER TABLE ad_daily_costs
  ADD COLUMN IF NOT EXISTS revenue     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_count INTEGER DEFAULT 0;

-- Add sync_requested_at to stores (needed by YouCan poller)
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS sync_requested_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_product ON ad_campaigns(product_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform ON ad_campaigns(platform, is_active);
