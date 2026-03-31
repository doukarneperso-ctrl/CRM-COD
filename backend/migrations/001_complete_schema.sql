-- ============================================================
-- CRM ANAQATOKI — COMPLETE DATABASE MIGRATION
-- Run once to set up the entire database schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy search

-- ============================================================
-- 1. ROLES & PERMISSIONS
-- ============================================================
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(200),
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE TABLE permissions (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug   VARCHAR(100) NOT NULL UNIQUE,
  name   VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL
);

CREATE TABLE role_permissions (
  role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(20),
  role_id       UUID REFERENCES roles(id),
  status        VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  deleted_at    TIMESTAMP
);

-- ============================================================
-- 3. STORES (Multi-store support)
-- ============================================================
CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  platform      VARCHAR(50) DEFAULT 'youcan',
  api_token     TEXT,
  is_active     BOOLEAN DEFAULT true,
  sync_interval INTEGER DEFAULT 5,
  sync_type     VARCHAR(20) DEFAULT 'both' CHECK (sync_type IN ('products', 'orders', 'both')),
  field_mapping JSONB,
  last_sync_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 4. PRODUCTS & VARIANTS
-- ============================================================
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),
  sku         VARCHAR(100),
  image_url   TEXT,
  store_id    UUID REFERENCES stores(id),
  external_id VARCHAR(255),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE TABLE product_variants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  size         VARCHAR(50),
  color        VARCHAR(50),
  sku          VARCHAR(100),
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost_price   DECIMAL(10,2) DEFAULT 0,
  stock        INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  external_id  VARCHAR(255),
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 5. CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   VARCHAR(255) NOT NULL,
  phone       VARCHAR(20) NOT NULL,
  phone_norm  VARCHAR(20) NOT NULL,
  email       VARCHAR(255),
  address     TEXT,
  city        VARCHAR(100),
  order_count INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE TABLE customer_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  tag         VARCHAR(50) NOT NULL CHECK (tag IN ('vip', 'blacklist', 'wholesale', 'repeat', 'high_return')),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, tag)
);

CREATE TABLE customer_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 6. ORDERS
-- ============================================================
CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          VARCHAR(20) NOT NULL UNIQUE,
  customer_id           UUID REFERENCES customers(id),
  store_id              UUID REFERENCES stores(id),
  external_order_id     VARCHAR(255),
  source                VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'youcan', 'whatsapp', 'instagram', 'phone')),
  confirmation_status   VARCHAR(20) DEFAULT 'pending' CHECK (confirmation_status IN ('pending', 'confirmed', 'cancelled', 'unreachable', 'fake', 'reported', 'out_of_stock', 'merged_into')),
  shipping_status       VARCHAR(20) DEFAULT 'not_shipped' CHECK (shipping_status IN ('not_shipped', 'pickup_scheduled', 'in_transit', 'delivered', 'returned')),
  payment_status        VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  total_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_type         VARCHAR(20) CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value        DECIMAL(10,2) DEFAULT 0,
  discount_reason       TEXT,
  final_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_notes        TEXT,
  call_notes            TEXT,
  address               TEXT,
  city                  VARCHAR(100),
  assigned_to           UUID REFERENCES users(id),
  courier_id            UUID,
  tracking_number       VARCHAR(100),
  shipped_at            TIMESTAMP,
  delivered_at          TIMESTAMP,
  returned_at           TIMESTAMP,
  unreachable_count     INTEGER DEFAULT 0,
  merged_into_order_id  UUID REFERENCES orders(id),
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  deleted_at            TIMESTAMP
);

CREATE TABLE order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id),
  product_name VARCHAR(255),
  variant_info VARCHAR(100),
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total      DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  unassigned_at TIMESTAMP,
  is_active   BOOLEAN DEFAULT true
);

-- ============================================================
-- 7. COURIERS & SHIPPING
-- ============================================================
CREATE TABLE couriers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  api_type   VARCHAR(50),
  api_config JSONB,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE courier_status_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id      UUID REFERENCES couriers(id) ON DELETE CASCADE,
  external_status VARCHAR(100) NOT NULL,
  crm_status      VARCHAR(20) NOT NULL,
  UNIQUE(courier_id, external_status)
);

CREATE TABLE courier_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id    UUID REFERENCES couriers(id),
  invoice_number VARCHAR(100),
  file_url      TEXT,
  total_amount  DECIMAL(12,2),
  status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'disputed')),
  imported_at   TIMESTAMP DEFAULT NOW(),
  verified_by   UUID REFERENCES users(id),
  verified_at   TIMESTAMP
);

-- ============================================================
-- 8. RETURNS
-- ============================================================
CREATE TABLE returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID REFERENCES orders(id),
  tracking_number   VARCHAR(100),
  courier_id        UUID REFERENCES couriers(id),
  status            VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified_ok', 'verified_damaged', 'wrong_package')),
  stock_restored    BOOLEAN DEFAULT false,
  verified_by       UUID REFERENCES users(id),
  verified_at       TIMESTAMP,
  notes             TEXT,
  returned_at       TIMESTAMP DEFAULT NOW(),
  created_at        TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 9. COMMISSIONS
-- ============================================================
CREATE TABLE commission_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID REFERENCES users(id),
  product_id UUID REFERENCES products(id),
  category   VARCHAR(100),
  type       VARCHAR(30) NOT NULL CHECK (type IN ('fixed', 'percentage_sale', 'percentage_margin')),
  rate       DECIMAL(10,2) NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE commissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID REFERENCES orders(id),
  agent_id   UUID REFERENCES users(id),
  amount     DECIMAL(10,2) NOT NULL,
  status     VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'approved', 'paid', 'rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  paid_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 10. EXPENSES
-- ============================================================
CREATE TABLE expense_categories (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(50)
);

CREATE TABLE expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  is_recurring BOOLEAN DEFAULT false,
  frequency   VARCHAR(20) CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_due_date DATE,
  receipt_url TEXT,
  created_by  UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  paid_at     TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

-- ============================================================
-- 11. CALL CENTRE
-- ============================================================
CREATE TABLE assignment_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  method     VARCHAR(20) NOT NULL CHECK (method IN ('round_robin', 'workload', 'geographic', 'manual')),
  priority   INTEGER DEFAULT 50,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scheduled_callbacks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID REFERENCES orders(id),
  agent_id     UUID REFERENCES users(id),
  scheduled_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_locks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  locked_by  UUID REFERENCES users(id),
  locked_at  TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- ============================================================
-- 12. AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(50) NOT NULL,
  record_id  VARCHAR(100) NOT NULL,
  action     VARCHAR(30) NOT NULL,
  user_id    UUID REFERENCES users(id),
  old_values JSONB,
  new_values JSONB,
  details    TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 13. SETTINGS & NOTIFICATIONS
-- ============================================================
CREATE TABLE system_settings (
  key   VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  type       VARCHAR(50) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  message    TEXT,
  data       JSONB,
  is_read    BOOLEAN DEFAULT false,
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE status_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_type VARCHAR(20) NOT NULL CHECK (status_type IN ('confirmation', 'shipping', 'payment')),
  status_name VARCHAR(50) NOT NULL,
  status_slug VARCHAR(50) NOT NULL,
  color       VARCHAR(10),
  icon        VARCHAR(50),
  UNIQUE(status_type, status_slug)
);

-- ============================================================
-- 14. FILE UPLOADS
-- ============================================================
CREATE TABLE file_uploads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  VARCHAR(50),
  record_id   UUID,
  file_name   VARCHAR(255) NOT NULL,
  file_url    TEXT NOT NULL,
  file_type   VARCHAR(50),
  file_size   INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 15. DELIVERY QUEUE
-- ============================================================
CREATE TABLE delivery_export_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id),
  courier_id  UUID REFERENCES couriers(id),
  status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'permanent_failure')),
  attempts    INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error  TEXT,
  next_retry_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 16. WEBHOOK & SYNC LOGS
-- ============================================================
CREATE TABLE webhook_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload    JSONB,
  status     VARCHAR(20) DEFAULT 'received',
  error      TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sync_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID REFERENCES stores(id),
  source     VARCHAR(20) NOT NULL CHECK (source IN ('webhook', 'poll', 'manual')),
  event_type VARCHAR(50),
  records_processed INTEGER DEFAULT 0,
  records_created   INTEGER DEFAULT 0,
  records_updated   INTEGER DEFAULT 0,
  records_skipped   INTEGER DEFAULT 0,
  status     VARCHAR(20) DEFAULT 'success',
  error      TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 17. AD CAMPAIGNS (Profitability Tracking)
-- ============================================================
CREATE TABLE ad_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  platform    VARCHAR(50) NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE,
  budget      DECIMAL(12,2),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ad_daily_costs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  spend        DECIMAL(12,2) NOT NULL DEFAULT 0,
  impressions  INTEGER DEFAULT 0,
  clicks       INTEGER DEFAULT 0,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

-- ============================================================
-- 18. INDEXES
-- ============================================================
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_products_store ON products(store_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);

CREATE INDEX idx_customers_phone_norm ON customers(phone_norm);
CREATE INDEX idx_customers_name_trgm ON customers USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_customers_city ON customers(city);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_store ON orders(store_id);
CREATE INDEX idx_orders_confirmation ON orders(confirmation_status);
CREATE INDEX idx_orders_shipping ON orders(shipping_status);
CREATE INDEX idx_orders_assigned ON orders(assigned_to);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_external ON orders(external_order_id);
CREATE INDEX idx_orders_tracking ON orders(tracking_number);
CREATE INDEX idx_orders_number ON orders(order_number);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

CREATE INDEX idx_commissions_agent ON commissions(agent_id);
CREATE INDEX idx_commissions_order ON commissions(order_id);
CREATE INDEX idx_commissions_status ON commissions(status);

CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_tracking ON returns(tracking_number);

CREATE INDEX idx_sync_logs_store ON sync_logs(store_id);
CREATE INDEX idx_webhook_logs_source ON webhook_logs(source, created_at DESC);
