import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();
const deliveredCountCondition = `o.confirmation_status = 'confirmed' AND o.shipping_status = 'delivered'`;

const setNoCacheHeaders = (res: Response) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
};

router.use((_req: Request, res: Response, next) => {
    setNoCacheHeaders(res);
    next();
});

// Shared filter builder
function buildDateFilters(req: Request) {
    const from = req.query.from as string;
    const to = req.query.to as string;
    const agentId = req.query.agentId as string;
    const storeId = req.query.storeId as string;
    const city = req.query.city as string;
    const productId = req.query.productId as string;

    const conditions: string[] = ["o.deleted_at IS NULL"];
    const params: any[] = [];
    let idx = 1;

    if (from) { conditions.push(`o.created_at >= $${idx++}::date`); params.push(from); }
    if (to) { conditions.push(`o.created_at < ($${idx++}::date + interval '1 day')`); params.push(to); }
    if (agentId) { conditions.push(`o.assigned_to = $${idx++}`); params.push(agentId); }
    if (storeId) { conditions.push(`o.store_id = $${idx++}`); params.push(storeId); }
    if (city) { conditions.push(`LOWER(o.city) = LOWER($${idx++})`); params.push(city); }
    if (productId) {
        conditions.push(`EXISTS (SELECT 1 FROM order_items oi JOIN product_variants pv ON pv.id = oi.variant_id WHERE oi.order_id = o.id AND pv.product_id = $${idx++})`);
        params.push(productId);
    }

    return { conditions, params, nextIdx: idx };
}

// ─── GET /api/analytics/dashboard ─────────────────
// KPIs: total orders, revenue, cost, profit + previous period comparison
router.get('/dashboard', requireAuth, async (req: Request, res: Response) => {
    try {
        const { conditions, params } = buildDateFilters(req);
        const where = conditions.join(' AND ');

        const [kpiResult, statusResult] = await Promise.all([
            query(
                `SELECT
                    COUNT(*) as total_orders,
                    COUNT(*) FILTER (WHERE confirmation_status = 'pending') as pending_orders,
                    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed') as confirmed_orders,
                    COUNT(*) FILTER (WHERE ${deliveredCountCondition}) as delivered_orders,
                    COUNT(*) FILTER (WHERE shipping_status = 'returned') as returned_orders,
                    COALESCE(SUM(final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as total_revenue,
                    0 as total_cost_delivered,
                    COALESCE(SUM(final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as gross_profit
                 FROM orders o WHERE ${where}`,
                params
            ),
            query(
                `SELECT confirmation_status, COUNT(*) as count
                 FROM orders o WHERE ${where}
                 GROUP BY confirmation_status ORDER BY count DESC`,
                params
            ),
        ]);

        const kpi = kpiResult.rows[0];
        const pendingOrders = parseInt(kpi.pending_orders || '0');
        const processedOrders = Math.max(0, parseInt(kpi.total_orders || '0') - pendingOrders);
        const confirmRate = processedOrders > 0
            ? ((kpi.confirmed_orders / processedOrders) * 100).toFixed(1)
            : 0;
        const deliveryRate = kpi.confirmed_orders > 0
            ? ((kpi.delivered_orders / kpi.confirmed_orders) * 100).toFixed(1)
            : 0;
        const returnRate = kpi.confirmed_orders > 0
            ? ((kpi.returned_orders / kpi.confirmed_orders) * 100).toFixed(1)
            : 0;

        res.json({
            success: true,
            data: {
                kpis: {
                    ...kpi,
                    processed_orders: processedOrders,
                    confirmation_rate: confirmRate,
                    delivery_rate: deliveryRate,
                    return_rate: returnRate,
                    avg_order_value: kpi.delivered_orders > 0
                        ? (kpi.total_revenue / kpi.delivered_orders).toFixed(2) : 0,
                },
                byStatus: statusResult.rows,
            },
        });
    } catch (error) {
        logger.error('Analytics dashboard error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load dashboard' } });
    }
});

// ─── GET /api/analytics/charts ────────────────────
// Time-series: revenue, cost, profit, order count — grouped by day/week/month
router.get('/charts', requireAuth, async (req: Request, res: Response) => {
    try {
        const { conditions, params, nextIdx } = buildDateFilters(req);
        const groupBy = (req.query.groupBy as string) || 'day'; // day | week | month
        const trunc = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

        const where = conditions.join(' AND ');

        const result = await query(
            `SELECT
                DATE_TRUNC('${trunc}', o.created_at) as period,
                COUNT(*) as orders,
                COUNT(*) FILTER (WHERE ${deliveredCountCondition}) as delivered,
                COUNT(*) FILTER (WHERE o.shipping_status = 'returned') as returned,
                COALESCE(SUM(o.final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as revenue,
                0 as cost,
                COALESCE(SUM(o.final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as profit
             FROM orders o WHERE ${where}
             GROUP BY period ORDER BY period ASC`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Analytics charts error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load chart data' } });
    }
});

// ─── GET /api/analytics/cities ────────────────────
router.get('/cities', requireAuth, async (req: Request, res: Response) => {
    try {
        const { conditions, params } = buildDateFilters(req);
        const where = conditions.join(' AND ');

        const result = await query(
            `SELECT
                COALESCE(o.city, 'Unknown') as city,
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE o.confirmation_status = 'confirmed') as confirmed,
                COUNT(*) FILTER (WHERE ${deliveredCountCondition}) as delivered,
                COUNT(*) FILTER (WHERE o.shipping_status = 'returned') as returned,
                COALESCE(SUM(o.final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as revenue
             FROM orders o WHERE ${where}
             GROUP BY o.city ORDER BY total_orders DESC
             LIMIT 20`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Analytics cities error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load city data' } });
    }
});

// ─── GET /api/analytics/products ──────────────────
router.get('/products', requireAuth, async (req: Request, res: Response) => {
    try {
        const { conditions, params } = buildDateFilters(req);
        const where = conditions.join(' AND ');

        const result = await query(
            `SELECT
                p.id, p.name AS product,
                COALESCE(p.category, 'Uncategorized') AS category,
                COUNT(oi.id) as order_count,
                SUM(oi.quantity) as units_sold,
                COALESCE(SUM(oi.unit_price * oi.quantity) FILTER (WHERE ${deliveredCountCondition}), 0) as revenue,
                COALESCE(SUM((oi.unit_price - oi.unit_cost) * oi.quantity) FILTER (WHERE ${deliveredCountCondition}), 0) as profit,
                COUNT(*) FILTER (WHERE o.shipping_status = 'returned') as returned
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             JOIN product_variants pv ON pv.id = oi.variant_id
             JOIN products p ON p.id = pv.product_id
             WHERE ${where}
             GROUP BY p.id ORDER BY revenue DESC
             LIMIT 30`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Analytics products error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load product data' } });
    }
});

// ─── GET /api/analytics/agents ────────────────────
router.get('/agents', requireAuth, async (req: Request, res: Response) => {
    try {
        const { conditions, params } = buildDateFilters(req);
        const where = conditions.join(' AND ');

        const result = await query(
            `SELECT
                u.id, u.full_name AS agent,
                COUNT(o.id) as total_orders,
                COUNT(o.id) FILTER (WHERE o.confirmation_status = 'pending') as pending,
                COUNT(o.id) FILTER (WHERE o.confirmation_status = 'confirmed') as confirmed,
                COUNT(o.id) FILTER (WHERE ${deliveredCountCondition}) as delivered,
                COUNT(o.id) FILTER (WHERE o.shipping_status = 'returned') as returned,
                COALESCE(SUM(o.final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as revenue,
                ROUND(COUNT(o.id) FILTER (WHERE o.confirmation_status = 'confirmed')::numeric /
                      NULLIF((COUNT(o.id) - COUNT(o.id) FILTER (WHERE o.confirmation_status = 'pending')), 0) * 100, 1) as confirmation_rate,
                COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0) as commissions_earned
             FROM orders o
             JOIN users u ON u.id = o.assigned_to
             LEFT JOIN commissions c ON c.agent_id = u.id AND c.order_id = o.id
             WHERE ${where} AND o.assigned_to IS NOT NULL
             GROUP BY u.id ORDER BY delivered DESC`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Analytics agents error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load agent data' } });
    }
});

// ─── GET /api/analytics/profitability ─────────────
router.get('/profitability', requireAuth, async (req: Request, res: Response) => {
    try {
        const { conditions, params } = buildDateFilters(req);
        const where = conditions.join(' AND ');

        const [ordersResult, expensesResult, commissionsResult] = await Promise.all([
            query(
                `SELECT
                    COALESCE(SUM(final_amount) FILTER (WHERE ${deliveredCountCondition}), 0) as gross_revenue,
                    0 as cogs,
                    0 as shipping_costs,
                    COALESCE(SUM(COALESCE(discount, 0)), 0) as total_discounts
                 FROM orders o WHERE ${where}`,
                params
            ),
            query(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE status = 'approved'`),
            query(`SELECT COALESCE(SUM(amount), 0) as total_commissions FROM commissions WHERE status = 'paid'`),
        ]);

        const o = ordersResult.rows[0];
        const grossRevenue = parseFloat(o.gross_revenue);
        const cogs = parseFloat(o.cogs);
        const shippingCosts = parseFloat(o.shipping_costs);
        const expenses = parseFloat(expensesResult.rows[0].total_expenses);
        const adSpend = 0;
        const commissions = parseFloat(commissionsResult.rows[0].total_commissions);

        const grossProfit = grossRevenue - cogs;
        const netProfit = grossProfit - shippingCosts - expenses - adSpend - commissions;

        res.json({
            success: true,
            data: {
                gross_revenue: grossRevenue,
                cogs,
                gross_profit: grossProfit,
                shipping_costs: shippingCosts,
                expenses,
                ad_spend: adSpend,
                commissions,
                net_profit: netProfit,
                gross_margin: grossRevenue > 0 ? ((grossProfit / grossRevenue) * 100).toFixed(1) : 0,
                net_margin: grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : 0,
            },
        });
    } catch (error) {
        logger.error('Analytics profitability error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load profitability data' } });
    }
});

export default router;
