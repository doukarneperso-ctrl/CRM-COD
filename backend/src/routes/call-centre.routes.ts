import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { parsePagination, paginationMeta, paginationSQL } from '../utils/pagination';
import { trackOrder } from '../services/delivery.service';
import { backfillMissingCommissionsForAgent } from '../services/commission.service';
import logger from '../utils/logger';

const router = Router();
const deliveredCountCondition = `o.confirmation_status = 'confirmed' AND o.shipping_status = 'delivered'`;

const setNoCacheHeaders = (res: Response) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
};

// ─── GET /api/call-centre/stats ───────────────────
// Agent KPI cards: Total Assigned, Pending, Confirmed, Delivered, Returned
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
    try {
        setNoCacheHeaders(res);
        const userId = req.session.userId!;
        const { from, to } = req.query as { from?: string; to?: string };
        const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
        const dateTo = to || new Date().toISOString().split('T')[0];

        const [statsResult, courierCountsResult] = await Promise.all([
            query(
                `SELECT
                    COUNT(*) as total_assigned,
                    COUNT(*) FILTER (WHERE o.confirmation_status = 'pending') as pending_calls,
                    COUNT(*) FILTER (WHERE o.confirmation_status = 'confirmed') as confirmed,
                    COUNT(*) FILTER (WHERE o.confirmation_status = 'fake') as fake,
                    COUNT(*) FILTER (WHERE ${deliveredCountCondition}) as delivered,
                    COUNT(*) FILTER (WHERE o.shipping_status = 'returned') as returned,
                    COUNT(*) FILTER (WHERE o.shipping_status = 'in_transit') as in_transit
                FROM orders o
                WHERE o.assigned_to = $1
                  AND o.deleted_at IS NULL
                  AND o.created_at >= $2
                  AND o.created_at <= $3::date + interval '1 day'`,
                [userId, dateFrom, dateTo]
            ),
            query(
                `SELECT courier_status as status, COUNT(*) as count
                 FROM orders o
                 WHERE o.assigned_to = $1
                   AND o.deleted_at IS NULL
                   AND o.created_at >= $2
                   AND o.created_at <= $3::date + interval '1 day'
                   AND o.courier_status IS NOT NULL
                   AND o.courier_status != ''
                 GROUP BY courier_status`,
                [userId, dateFrom, dateTo]
            )
        ]);

        res.json({ success: true, data: { ...statsResult.rows[0], courier_counts: courierCountsResult.rows } });
    } catch (error) {
        logger.error('Call centre stats error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } });
    }
});

// ─── GET /api/call-centre/commissions ─────────────
// Agent commission summary cards: Paid, Owed (Pending), Deducted
router.get('/commissions', requireAuth, async (req: Request, res: Response) => {
    try {
        setNoCacheHeaders(res);
        const userId = req.session.userId!;
        // Self-heal historical gaps before computing commission cards.
        try {
            await backfillMissingCommissionsForAgent(String(userId));
        } catch (err) {
            logger.warn('Call centre commissions backfill warning:', err);
        }

        const result = await query(
            `SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as commission_paid,
                COALESCE(SUM(amount) FILTER (WHERE status IN ('new', 'approved')), 0) as commission_owed,
                COALESCE(SUM(amount) FILTER (WHERE status = 'rejected' AND review_note ILIKE 'Auto-debt:%'), 0) as pending_deductions
            FROM commissions
            WHERE agent_id = $1`,
            [userId]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Call centre commissions error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get commissions' } });
    }
});

// ─── GET /api/call-centre/duplicates ──────────────
// Find other pending orders for same phone (merge candidates)
router.get('/duplicates', requireAuth, async (req: Request, res: Response) => {
    try {
        const phone = req.query.phone as string;
        const excludeOrderId = req.query.excludeOrderId as string;
        if (!phone) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Phone is required' } });
            return;
        }

        const result = await query(
            `SELECT
                o.id, o.order_number, o.confirmation_status, o.total_amount, o.final_amount, o.created_at,
                c.full_name as customer_name, c.phone as customer_phone,
                COALESCE(json_agg(
                    json_build_object(
                        'id', oi.id,
                        'variantId', oi.variant_id,
                        'productName', COALESCE(p.name, oi.product_name, 'Unknown'),
                        'variantInfo', COALESCE(CONCAT_WS(' / ', pv.size, pv.color), oi.variant_info),
                        'quantity', oi.quantity,
                        'unitPrice', oi.unit_price,
                        'stock', pv.stock
                    ) ORDER BY oi.created_at
                ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
            FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN product_variants pv ON pv.id = oi.variant_id
            LEFT JOIN products p ON p.id = pv.product_id
            WHERE c.phone = $1
              AND o.confirmation_status = 'pending'
              AND o.deleted_at IS NULL
              AND ($2::uuid IS NULL OR o.id != $2)
            GROUP BY o.id, c.id
            ORDER BY o.created_at ASC`,
            [phone, excludeOrderId || null]
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Call centre duplicates error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get duplicates' } });
    }
});

// ─── GET /api/call-centre/customer-history ────────
// All past orders for a given phone number (full history)
router.get('/customer-history', requireAuth, async (req: Request, res: Response) => {
    try {
        const phone = req.query.phone as string;
        const excludeOrderId = req.query.excludeOrderId as string;
        if (!phone) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Phone is required' } });
            return;
        }

        const result = await query(
            `SELECT
                o.id, o.order_number, o.confirmation_status, o.shipping_status,
                o.total_amount, o.final_amount, o.created_at, o.note,
                c.full_name as customer_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'productName', COALESCE(p.name, oi.product_name),
                            'quantity', oi.quantity,
                            'unitPrice', oi.unit_price,
                            'variantInfo', CONCAT_WS(' / ', pv.size, pv.color)
                        )
                    ) FILTER (WHERE oi.id IS NOT NULL), '[]'
                ) as items
            FROM orders o
            JOIN customers c ON c.id = o.customer_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN product_variants pv ON pv.id = oi.variant_id
            LEFT JOIN products p ON p.id = pv.product_id
            WHERE c.phone = $1
              AND o.deleted_at IS NULL
              AND ($2::uuid IS NULL OR o.id != $2)
            GROUP BY o.id, c.id
            ORDER BY o.created_at DESC
            LIMIT 20`,
            [phone, excludeOrderId || null]
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Call centre customer history error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get customer history' } });
    }
});

// ─── GET /api/call-centre/shipping-history/:id ─────
// Shipping timeline for one assigned order (tracking API first, DB history fallback)
router.get('/shipping-history/:id', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const orderRes = await query(
            `SELECT id, order_number, tracking_number, courier_status
             FROM orders
             WHERE id = $1 AND assigned_to = $2 AND deleted_at IS NULL`,
            [req.params.id, userId]
        );

        if (orderRes.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const order = orderRes.rows[0];

        // 1) Prefer live courier timeline when tracking number exists.
        if (order.tracking_number) {
            try {
                const tracked = await trackOrder(order.tracking_number);
                if (Array.isArray(tracked.history) && tracked.history.length > 0) {
                    res.json({
                        success: true,
                        data: {
                            orderId: order.id,
                            orderNumber: order.order_number,
                            tracking: order.tracking_number,
                            source: 'courier',
                            history: tracked.history,
                        },
                    });
                    return;
                }
            } catch (trackErr: any) {
                logger.warn('Call centre shipping-history track fallback to DB:', trackErr?.message || trackErr);
            }
        }

        // 2) Fallback to stored CRM courier status history.
        const histRes = await query(
            `SELECT new_value, note, created_at
             FROM status_history
             WHERE order_id = $1 AND field = 'courier_status'
             ORDER BY created_at ASC`,
            [order.id]
        );

        const history = histRes.rows.map((h: any) => ({
            status: h.new_value || '',
            time: h.created_at,
            etat: '',
            note: h.note || '',
        }));

        res.json({
            success: true,
            data: {
                orderId: order.id,
                orderNumber: order.order_number,
                tracking: order.tracking_number || null,
                source: 'crm',
                history,
            },
        });
    } catch (error) {
        logger.error('Call centre shipping history error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load shipping history' } });
    }
});

// ─── GET /api/call-centre/queue ───────────────────
// Paginated queue of assigned orders, filterable by status tab
router.get('/queue', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const status = req.query.status as string || 'pending';
        const search = req.query.search as string || '';
        const { from, to } = req.query as { from?: string; to?: string };

        const params: any[] = [userId];
        let whereExtra = '';
        let idx = 2;

        if (status === 'pending') {
            whereExtra += ` AND o.confirmation_status = 'pending'`;
        } else if (status === 'rescheduled') {
            whereExtra += ` AND o.confirmation_status = 'reported'`;
        } else if (status === 'failed') {
            whereExtra += ` AND o.confirmation_status = 'unreachable'`;
        } else if (status === 'confirmed') {
            whereExtra += ` AND o.confirmation_status = 'confirmed' AND (o.courier_status IS NULL OR o.courier_status = '')`;
        } else if (status.startsWith('coliix_')) {
            whereExtra += ` AND o.courier_status = $${idx}`;
            params.push(status.replace('coliix_', ''));
            idx++;
        } else if (status === 'cancelled') {
            whereExtra += ` AND o.confirmation_status = 'cancelled'`;
        } else if (status === 'out_of_stock') {
            whereExtra += ` AND o.confirmation_status = 'out_of_stock'`;
        }

        if (search) {
            whereExtra += ` AND (o.order_number ILIKE $${idx} OR c.full_name ILIKE $${idx} OR c.phone ILIKE $${idx})`;
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

        const [dataResult, countResult, countsResult, courierCountsResult] = await Promise.all([
            query(
                `SELECT
                    o.id, o.order_number, o.confirmation_status, o.shipping_status, o.courier_status, o.tracking_number,
                    o.final_amount, o.total_amount, o.created_at, o.note, o.delivery_notes,
                    o.discount, o.discount_type, o.shipping_cost, o.call_attempts,
                    c.full_name as customer_name, c.phone as customer_phone, c.city as customer_city,
                    c.address as customer_address, c.total_orders as customer_order_count, c.id as customer_id,
                    (SELECT scheduled_at FROM scheduled_callbacks WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) as callback_scheduled_at,
                    COALESCE(json_agg(
                        json_build_object(
                            'id', oi.id,
                            'variantId', oi.variant_id,
                            'productName', COALESCE(p.name, oi.product_name, 'Unknown'),
                            'variantInfo', COALESCE(CONCAT_WS(' / ', pv.size, pv.color), oi.variant_info),
                            'quantity', oi.quantity,
                            'unitPrice', oi.unit_price,
                            'stock', pv.stock
                        ) ORDER BY oi.created_at
                    ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
                FROM orders o
                LEFT JOIN customers c ON c.id = o.customer_id
                LEFT JOIN order_items oi ON oi.order_id = o.id
                LEFT JOIN product_variants pv ON pv.id = oi.variant_id
                LEFT JOIN products p ON p.id = pv.product_id
                WHERE o.assigned_to = $1 AND o.deleted_at IS NULL ${whereExtra}
                GROUP BY o.id, c.id
                ORDER BY o.created_at ASC
                LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            ),
            query(
                `SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
                 WHERE o.assigned_to = $1 AND o.deleted_at IS NULL ${whereExtra}`,
                params
            ),
            // Status tab counts (respects date range)
            query(
                `SELECT
                    COUNT(*) FILTER (WHERE confirmation_status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE confirmation_status = 'reported') as rescheduled,
                    COUNT(*) FILTER (WHERE confirmation_status = 'unreachable') as failed,
                    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed' AND (courier_status IS NULL OR courier_status = '')) as confirmed,
                    COUNT(*) FILTER (WHERE confirmation_status = 'cancelled') as cancelled,
                    COUNT(*) FILTER (WHERE confirmation_status = 'out_of_stock') as out_of_stock
                FROM orders
                WHERE assigned_to = $1 AND deleted_at IS NULL
                  ${from ? `AND created_at >= '${from}'` : ''}
                  ${to ? `AND created_at <= '${to}'::date + interval '1 day'` : ''}`,
                [userId]
            ),
            // Dynamic Coliix status counts (respects date range)
            query(
                `SELECT courier_status, COUNT(*) as count
                 FROM orders
                 WHERE assigned_to = $1 AND deleted_at IS NULL
                   AND courier_status IS NOT NULL
                   AND courier_status != ''
                   ${from ? `AND created_at >= '${from}'` : ''}
                   ${to ? `AND created_at <= '${to}'::date + interval '1 day'` : ''}
                 GROUP BY courier_status`,
                [userId]
            )
        ]);

        const tabCounts = countsResult.rows[0];
        const courierCounts = courierCountsResult.rows;

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(parseInt(countResult.rows[0].count), pagination),
            tabCounts: { ...tabCounts, courierCounts }
        });
    } catch (error) {
        logger.error('Call centre queue error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get queue' } });
    }
});

// ─── POST /api/call-centre/relink-items ───────────
// Re-link orphan order items (variant_id IS NULL) to matching products by name
router.post('/relink-items', requireAuth, async (req: Request, res: Response) => {
    try {
        const { orderId } = req.body;
        if (!orderId) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'orderId is required' } });
            return;
        }

        // Find order items with no variant linked
        const orphans = await query(
            `SELECT oi.id, oi.product_name, oi.variant_info
             FROM order_items oi
             WHERE oi.order_id = $1 AND oi.variant_id IS NULL`,
            [orderId]
        );

        let linked = 0;
        for (const item of orphans.rows) {
            if (!item.product_name) continue;

            // Try to match by product name → get variants
            const match = await query(
                `SELECT pv.id as variant_id, p.name as product_name, pv.size, pv.color, pv.stock
                 FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 WHERE p.name ILIKE $1 AND p.deleted_at IS NULL AND pv.is_active = true
                 ORDER BY pv.created_at ASC
                 LIMIT 5`,
                [`%${item.product_name.trim()}%`]
            );

            if (match.rows.length > 0) {
                // If we have variant_info, try to match by size/color
                let bestMatch = match.rows[0];
                if (item.variant_info) {
                    const parts = item.variant_info.split('/').map((s: string) => s.trim().toLowerCase());
                    for (const row of match.rows) {
                        const rowParts = [row.size, row.color].filter(Boolean).map((s: string) => s.toLowerCase());
                        const matchScore = parts.filter((p: string) => rowParts.some((r: string) => r.includes(p) || p.includes(r))).length;
                        if (matchScore > 0) { bestMatch = row; break; }
                    }
                }

                await query(
                    `UPDATE order_items SET variant_id = $1 WHERE id = $2`,
                    [bestMatch.variant_id, item.id]
                );
                linked++;
            }
        }

        // Return updated items for the order
        const updatedItems = await query(
            `SELECT oi.id, oi.variant_id,
                    COALESCE(p.name, oi.product_name, 'Unknown') as "productName",
                    COALESCE(CONCAT_WS(' / ', pv.size, pv.color), oi.variant_info) as "variantInfo",
                    oi.quantity, oi.unit_price as "unitPrice", pv.stock
             FROM order_items oi
             LEFT JOIN product_variants pv ON pv.id = oi.variant_id
             LEFT JOIN products p ON p.id = pv.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.created_at`,
            [orderId]
        );

        res.json({
            success: true,
            linked,
            total: orphans.rows.length,
            items: updatedItems.rows,
        });
    } catch (error) {
        logger.error('Relink items error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to relink items' } });
    }
});

export default router;

