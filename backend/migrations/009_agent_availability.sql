-- Agent availability + new permissions
-- ────────────────────────────────────────

-- 1. Add availability columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_changed_at TIMESTAMP;

-- 2. Seed new permissions
INSERT INTO permissions (slug, name, description, created_at) VALUES
    ('bulk_assign_orders',       'Bulk Assign Orders',              'Bulk assign multiple orders to an agent',   NOW()),
    ('bulk_export_orders',       'Bulk Export Orders',               'Bulk export orders to CSV or courier',      NOW()),
    ('cancel_confirmed_orders',  'Cancel Confirmed Orders',          'Cancel orders that were already confirmed',  NOW()),
    ('view_all_orders',          'View All Orders',                  'View all orders (not just assigned)',        NOW()),
    ('toggle_agent_availability','Toggle Agent Availability',        'Toggle own break/available status',         NOW())
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
