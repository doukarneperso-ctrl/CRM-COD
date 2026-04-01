-- ============================================================
-- CRM ANAQATOKI — SEED DATA
-- Default roles, permissions, admin user, and status definitions
-- ============================================================

-- ─── Permissions ──────────────────────────────────
INSERT INTO permissions (slug, name, module) VALUES
-- Orders
('view_orders', 'View Orders', 'orders'),
('create_orders', 'Create Orders', 'orders'),
('edit_orders', 'Edit Orders', 'orders'),
('delete_orders', 'Delete Orders', 'orders'),
('update_order_status', 'Update Order Status', 'orders'),
('assign_orders', 'Assign Orders', 'orders'),
('apply_discount', 'Apply Discount', 'orders'),
('merge_orders', 'Merge Orders', 'orders'),
('view_order_history', 'View Order History', 'orders'),
('export_orders', 'Export Orders', 'orders'),
-- Products
('view_products', 'View Products', 'products'),
('create_products', 'Create Products', 'products'),
('edit_products', 'Edit Products', 'products'),
('delete_products', 'Delete Products', 'products'),
('manage_stock', 'Manage Stock', 'products'),
-- Customers
('view_customers', 'View Customers', 'customers'),
('create_customers', 'Create Customers', 'customers'),
('edit_customers', 'Edit Customers', 'customers'),
('delete_customers', 'Delete Customers', 'customers'),
('manage_customer_tags', 'Manage Customer Tags', 'customers'),
-- Delivery
('view_delivery', 'View Delivery', 'delivery'),
('export_to_courier', 'Export to Courier', 'delivery'),
('manage_returns', 'Manage Returns', 'delivery'),
('verify_returns', 'Verify Returns', 'delivery'),
-- Commissions
('view_commissions', 'View Commissions', 'commissions'),
('view_assigned_commissions', 'View Own Commissions', 'commissions'),
('manage_commissions', 'Manage Commissions', 'commissions'),
('approve_commissions', 'Approve Commissions', 'commissions'),
('manage_commission_rules', 'Manage Commission Rules', 'commissions'),
-- Expenses
('view_expenses', 'View Expenses', 'expenses'),
('create_expenses', 'Create Expenses', 'expenses'),
('approve_expenses', 'Approve Expenses', 'expenses'),
-- Analytics
('view_analytics', 'View Analytics', 'analytics'),
('view_dashboard', 'View Dashboard', 'analytics'),
-- Call Centre
('view_call_centre', 'View Call Centre', 'call_centre'),
('manage_assignment_rules', 'Manage Assignment Rules', 'call_centre'),
-- Users
('view_users', 'View Users', 'users'),
('create_users', 'Create Users', 'users'),
('edit_users', 'Edit Users', 'users'),
('delete_users', 'Delete Users', 'users'),
('manage_roles', 'Manage Roles', 'users'),
-- Settings
('manage_settings', 'Manage Settings', 'settings'),
('manage_integrations', 'Manage Integrations', 'settings'),
-- Notifications
('view_notifications', 'View Notifications', 'notifications');

-- ─── Roles ────────────────────────────────────────
INSERT INTO roles (name, description, is_system) VALUES
('Admin', 'Full system access — all permissions', true),
('Manager', 'Manage orders, agents, and reports', true),
('Agent', 'Confirm orders, manage assigned queue', true);

-- ─── Admin gets ALL permissions ───────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Admin';

-- ─── Manager gets most permissions (except user/role/settings management) ─
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Manager'
  AND p.slug NOT IN ('manage_settings', 'manage_roles', 'delete_users', 'create_users');

-- ─── Agent gets limited permissions ───────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Agent'
  AND p.slug IN (
    'view_orders', 'create_orders', 'edit_orders', 'update_order_status',
    'apply_discount', 'view_order_history',
    'view_products',
    'view_customers', 'create_customers',
    'view_assigned_commissions',
    'view_call_centre',
    'view_dashboard',
    'view_notifications'
  );

-- ─── Default Admin User ──────────────────────────
-- Password: admin123 (bcrypt hash with 12 rounds)
INSERT INTO users (username, password_hash, full_name, role_id, status)
SELECT 'admin', '$2b$12$oqEykdlFVPmlPHlo0D.qOOufTeNfdmMjluv6YMnl9wAbr0RiMUIfW', 'System Administrator', r.id, 'active'
FROM roles r WHERE r.name = 'Admin';

-- ─── Status Definitions ──────────────────────────
INSERT INTO status_definitions (status_type, status_name, status_slug, color, icon) VALUES
-- Confirmation statuses
('confirmation', 'Pending', 'pending', '#faad14', 'ClockCircleOutlined'),
('confirmation', 'Confirmed', 'confirmed', '#52c41a', 'CheckCircleOutlined'),
('confirmation', 'Cancelled', 'cancelled', '#ff4d4f', 'CloseCircleOutlined'),
('confirmation', 'Unreachable', 'unreachable', '#8c8c8c', 'PhoneOutlined'),
('confirmation', 'Fake', 'fake', '#000000', 'WarningOutlined'),
('confirmation', 'Reported', 'reported', '#1890ff', 'CalendarOutlined'),
('confirmation', 'Out of Stock', 'out_of_stock', '#fa8c16', 'InboxOutlined'),
('confirmation', 'Merged', 'merged_into', '#722ed1', 'MergeCellsOutlined'),
-- Shipping statuses
('shipping', 'Not Shipped', 'not_shipped', '#d9d9d9', 'InboxOutlined'),
('shipping', 'Pickup Scheduled', 'pickup_scheduled', '#1890ff', 'CarOutlined'),
('shipping', 'In Transit', 'in_transit', '#faad14', 'SendOutlined'),
('shipping', 'Delivered', 'delivered', '#52c41a', 'CheckCircleOutlined'),
('shipping', 'Returned', 'returned', '#ff4d4f', 'RollbackOutlined'),
-- Payment statuses
('payment', 'Unpaid', 'unpaid', '#ff4d4f', 'DollarOutlined'),
('payment', 'Paid', 'paid', '#52c41a', 'CheckCircleOutlined');

-- ─── Default System Settings ─────────────────────
INSERT INTO system_settings (key, value) VALUES
('default_commission_rate', '{"type": "fixed", "rate": 10}'),
('round_robin_index', '0'),
('order_number_prefix', '"ORD"'),
('order_number_counter', '1000'),
('currency', '"MAD"'),
('timezone', '"Africa/Casablanca"'),
('date_format', '"DD/MM/YYYY"');

-- ─── Default Expense Categories ──────────────────
INSERT INTO expense_categories (name, icon) VALUES
('Shipping', '🚚'),
('Commission Payouts', '💰'),
('Marketing & Ads', '📢'),
('Supplies', '📦'),
('Salaries', '👤'),
('Office', '🏢'),
('Other', '📋');
