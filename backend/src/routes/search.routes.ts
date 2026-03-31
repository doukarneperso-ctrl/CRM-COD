import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// ─── GET /api/search?q=&types=orders,customers,products ──
router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const q = (req.query.q as string || '').trim();
        const types = (req.query.types as string || 'orders,customers,products').split(',');

        if (q.length < 2) {
            res.json({ success: true, data: {} });
            return;
        }

        const results: Record<string, any[]> = {};

        await Promise.all([
            types.includes('orders') && query(
                `SELECT 'order' as type, o.id, o.order_number as title,
                         CONCAT(c.full_name, ' — ', o.confirmation_status) as subtitle,
                         o.created_at
                 FROM orders o
                 LEFT JOIN customers c ON c.id = o.customer_id
                 WHERE o.deleted_at IS NULL
                   AND (o.order_number ILIKE $1 OR c.full_name ILIKE $1 OR c.phone ILIKE $1)
                 ORDER BY o.created_at DESC
                 LIMIT 5`,
                [`%${q}%`]
            ).then(r => { results.orders = r.rows; }),

            types.includes('customers') && query(
                `SELECT 'customer' as type, id, full_name as title,
                         CONCAT(phone, ' — ', COALESCE(city, 'No city')) as subtitle,
                         created_at
                 FROM customers
                 WHERE deleted_at IS NULL
                   AND (full_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)
                 ORDER BY order_count DESC
                 LIMIT 5`,
                [`%${q}%`]
            ).then(r => { results.customers = r.rows; }),

            types.includes('products') && query(
                `SELECT 'product' as type, p.id, p.name as title,
                         CONCAT(COALESCE(p.category, 'No category'), ' — SKU: ', COALESCE(p.sku, 'N/A')) as subtitle,
                         p.created_at
                 FROM products p
                 WHERE p.deleted_at IS NULL AND p.is_active = true
                   AND (p.name ILIKE $1 OR p.sku ILIKE $1)
                 ORDER BY p.name ASC
                 LIMIT 5`,
                [`%${q}%`]
            ).then(r => { results.products = r.rows; }),
        ]);

        res.json({ success: true, data: results });
    } catch (error) {
        logger.error('Search error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Search failed' } });
    }
});

export default router;
