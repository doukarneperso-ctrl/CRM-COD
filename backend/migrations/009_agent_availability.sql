-- Agent availability + new permissions
-- ────────────────────────────────────────

-- 1. Add availability columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_changed_at TIMESTAMP;

-- 2. Seed new permissions
INSERT INTO permissions (slug, name, module) VALUES
    ('bulk_assign_orders',       'Bulk Assign Orders',              'orders'),
    ('bulk_export_orders',       'Bulk Export Orders',              'orders'),
    ('cancel_confirmed_orders',  'Cancel Confirmed Orders',         'orders'),
    ('view_all_orders',          'View All Orders',                 'orders'),
    ('toggle_agent_availability','Toggle Agent Availability',       'users')
ON CONFLICT (slug) DO NOTHING;

-- 3. Grant view_all_orders to Admin + Manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Admin', 'Manager', 'admin', 'manager')
  AND p.slug IN (
    'view_all_orders',
    'bulk_assign_orders',
    'bulk_export_orders',
    'cancel_confirmed_orders'
  )
ON CONFLICT DO NOTHING;

-- 4. Grant toggle_agent_availability to Agent role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Agent', 'agent', 'call_centre_agent')
  AND p.slug = 'toggle_agent_availability'
ON CONFLICT DO NOTHING;
