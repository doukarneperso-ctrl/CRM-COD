-- ============================================================
-- 004: Product Categories Table
-- Upgrades category from a plain VARCHAR on products to a
-- proper table with FK relationship.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon        VARCHAR(50),
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Add category_id FK to products (nullable for backward compat)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id);

-- Migrate existing category strings → rows in product_categories
-- (This only runs if there is existing data)
INSERT INTO product_categories (name, slug, created_at)
SELECT DISTINCT
  category,
  LOWER(REGEXP_REPLACE(category, '[^a-zA-Z0-9]+', '-', 'g')),
  NOW()
FROM products
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;

-- Wire up category_id FK for existing rows
UPDATE products p
SET category_id = pc.id
FROM product_categories pc
WHERE p.category = pc.name
  AND p.category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_slug ON product_categories(slug);
