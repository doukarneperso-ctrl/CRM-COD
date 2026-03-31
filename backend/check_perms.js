const { Client } = require('pg');
(async () => {
    const c = new Client({ connectionString: 'postgresql://crm_user:crm_pass_2026@localhost:5432/crm_cod' });
    await c.connect();

    // Check all users and their permissions
    const r = await c.query(`
        SELECT u.username, u.full_name, r.name as role_name, 
               array_agg(p.slug ORDER BY p.slug) as perms
        FROM users u 
        LEFT JOIN roles r ON r.id = u.role_id 
        LEFT JOIN role_permissions rp ON rp.role_id = r.id 
        LEFT JOIN permissions p ON p.id = rp.permission_id 
        WHERE u.deleted_at IS NULL 
        GROUP BY u.id, u.username, u.full_name, r.name 
        ORDER BY u.username
    `);
    r.rows.forEach(row => {
        const perms = row.perms ? row.perms.filter(Boolean).join(', ') : 'NO PERMS';
        console.log(`${row.username} (${row.role_name}): ${perms}`);
    });

    // Check if view_all_orders permission exists
    const r2 = await c.query("SELECT id, slug, name FROM permissions WHERE slug = 'view_all_orders'");
    console.log('\nview_all_orders permission:', r2.rows.length > 0 ? r2.rows[0] : 'DOES NOT EXIST');

    await c.end();
})();
