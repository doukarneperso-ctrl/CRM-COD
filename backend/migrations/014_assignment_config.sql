-- Migration 014: Assignment config redesign
-- Replace rule-based system with a single config + product-agent mappings

-- Assignment config singleton (one active config)
CREATE TABLE IF NOT EXISTS assignment_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode        VARCHAR(30) NOT NULL DEFAULT 'manual',
  is_active   BOOLEAN DEFAULT true,
  config      JSONB DEFAULT '{}',
  state       JSONB DEFAULT '{}',
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Insert default manual config if empty
INSERT INTO assignment_config (mode, is_active) 
SELECT 'manual', true
WHERE NOT EXISTS (SELECT 1 FROM assignment_config);

-- Product → Agent mappings for "by_product" mode
CREATE TABLE IF NOT EXISTS product_agent_mappings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id)
);
