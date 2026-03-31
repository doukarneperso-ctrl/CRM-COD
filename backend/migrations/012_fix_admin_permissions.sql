-- ============================================================
-- Migration 012: Fix Admin Permissions
-- Ensures Admin role has ALL permissions (including view_all_orders)
-- and adds view_all_orders permission if missing
-- ============================================================

-- Add view_all_orders permission (for admins/managers to see all orders, not just assigned)
INSERT INTO permissions (slug, name, module)
VALUES ('view_all_orders', 'View All Orders', 'orders')
ON CONFLICT (slug) DO NOTHING;

-- Give Admin role ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Also give Manager role all permissions (they should see everything too)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Manager'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
