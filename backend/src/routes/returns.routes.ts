import { Router, Request, Response } from 'express';
import { query, transaction } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import { parsePagination, paginationMeta, paginationSQL } from '../utils/pagination';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

const verifyReturnSchema = z.object({
    result: z.enum(['ok', 'damaged', 'wrong_package']),
    note: z.string().max(500).optional(),
});

// ─── GET /api/returns/stats ────────────────────────
router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT
                COUNT(*) FILTER (WHERE o.shipping_status = 'returned' AND o.return_verified_at IS NULL) as pending_verification,
                COUNT(*) FILTER (WHERE o.return_verified_at::date = CURRENT_DATE) as verified_today,
                COUNT(*) FILTER (WHERE o.shipping_status = 'returned') as total_returned,
                ROUND(
                    COUNT(*) FILTER (WHERE o.shipping_status = 'returned')::numeric /
                    NULLIF(COUNT(*) FILTER (WHERE o.shipping_status IN ('delivered','returned')), 0) * 100,
                1) as return_rate
            FROM orders o
            WHERE o.deleted_at IS NULL
        `);
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Returns stats error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } });
    }
});

// ─── GET /api/returns ─────────────────────────────
router.get('/', requireAuth, requirePermission('view_orders'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const verified = req.query.verified === 'true';
        const search = req.query.search as string || '';
        const { from, to } = req.query as { from?: string; to?: string };
        const courierId = req.query.courierId as string || '';

        const params: any[] = [];
        let whereExtra = '';
        let idx = 1;

        if (verified) {
            whereExtra += ` AND o.return_verified_at IS NOT NULL`;
        } else {
            whereExtra += ` AND o.return_verified_at IS NULL`;
        }

        if (search) {
            whereExtra += ` AND (o.order_number ILIKE $${idx} OR c.full_name ILIKE $${idx} OR o.tracking_number ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }
        if (from) {
            whereExtra += ` AND o.created_at >= $${idx}`;
            params.push(from);
            idx++;
        }
        if (to) {
            whereExtra += ` AND o.created_at <= $${idx}::date + interval '1 day'`;
            params.push(to);
            idx++;
        }
        if (courierId) {
            whereExtra += ` AND o.courier_id = $${idx}`;
            params.push(courierId);
            idx++;
        }

        const [dataResult, countResult] = await Promise.all([
            query(
                `SELECT
                    o.id, o.order_number, o.final_amount, o.tracking_number,
                    o.shipping_status, o.return_verified_at, o.return_result, o.return_note,
                    o.returned_at,
                    c.full_name as customer_name,
                    cr.name as courier_name,
                    u.full_name as assigned_to_name,
                    COALESCE(json_agg(
                        json_build_object(
                            'productName', p.name,
                            'size', pv.size,
                            'color', pv.color,
                            'quantity', oi.quantity
                        ) ORDER BY oi.created_at
                    ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
                FROM orders o
                LEFT JOIN customers c ON c.id = o.customer_id
                LEFT JOIN couriers cr ON cr.id = o.courier_id
                LEFT JOIN users u ON u.id = o.assigned_to
                LEFT JOIN order_items oi ON oi.order_id = o.id
                LEFT JOIN product_variants pv ON pv.id = oi.variant_id
                LEFT JOIN products p ON p.id = pv.product_id
                WHERE o.shipping_status = 'returned' AND o.deleted_at IS NULL ${whereExtra}
                GROUP BY o.id, c.id, cr.id, u.id
                ORDER BY o.returned_at DESC NULLS LAST, o.created_at DESC
                LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            ),
            query(
                `SELECT COUNT(*) FROM orders o
                 LEFT JOIN customers c ON c.id = o.customer_id
                 WHERE o.shipping_status = 'returned' AND o.deleted_at IS NULL ${whereExtra}`,
                params
            ),
        ]);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(parseInt(countResult.rows[0].count), pagination),
        });
    } catch (error) {
        logger.error('List returns error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list returns' } });
    }
});

// ─── GET /api/returns/search ───────────────────────
// Find by tracking number (for QR scan workflow)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
    try {
        const tracking = req.query.tracking as string;
        if (!tracking) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tracking param required' } });
            return;
        }
        const result = await query(
            `SELECT o.id, o.order_number, o.final_amount, o.tracking_number, o.shipping_status,
                    o.return_verified_at, o.return_result,
                    c.full_name as customer_name, c.phone as customer_phone,
                    cr.name as courier_name
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             LEFT JOIN couriers cr ON cr.id = o.courier_id
             WHERE o.tracking_number ILIKE $1 AND o.deleted_at IS NULL
             LIMIT 1`,
            [`%${tracking}%`]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found for this tracking number' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Returns search error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to search' } });
    }
});

// ─── POST /api/returns/:orderId/verify ────────────
router.post('/:orderId/verify', requireAuth, requirePermission('update_order_status'), validateBody(verifyReturnSchema), async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;
        const { result: verifyResult, note } = req.body;

        const orderCheck = await query(
            `SELECT o.id, o.order_number, o.shipping_status
             FROM orders o WHERE o.id = $1 AND o.deleted_at IS NULL`,
            [orderId]
        );
        if (orderCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const order = orderCheck.rows[0];
        if (order.shipping_status !== 'returned') {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Order is not in returned status' } });
            return;
        }

        await transaction(async (client) => {
            // Mark return as verified
            await client.query(
                `UPDATE orders SET
                    return_verified_at = NOW(),
                    return_verified_by = $1,
                    return_result = $2,
                    return_note = $3,
                    updated_at = NOW()
                 WHERE id = $4`,
                [req.session.userId, verifyResult, note || null, orderId]
            );

            // Restore stock for OK returns
            if (verifyResult === 'ok') {
                const items = await client.query(
                    `SELECT oi.variant_id, oi.quantity
                     FROM order_items oi WHERE oi.order_id = $1`,
                    [orderId]
                );
                for (const item of items.rows) {
                    await client.query(
                        `UPDATE product_variants SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
                        [item.quantity, item.variant_id]
                    );
                }
            }

            // Log to status history
            await client.query(
                `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
                 VALUES ($1, 'return_result', NULL, $2, $3, $4)`,
                [orderId, verifyResult, req.session.userId, note || `Return verified: ${verifyResult}`]
            );
        });

        await createAuditLog({
            tableName: 'orders', recordId: String(orderId),
            action: 'update', userId: req.session.userId!,
            details: `Return verified (${verifyResult}) for order ${order.order_number}${note ? ': ' + note : ''}`,
        });

        res.json({ success: true, message: `Return verified as ${verifyResult}` });
    } catch (error) {
        logger.error('Verify return error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to verify return' } });
    }
});

export default router;
