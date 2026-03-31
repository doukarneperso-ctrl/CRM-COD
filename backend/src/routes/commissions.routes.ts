import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import { parsePagination, paginationMeta, paginationSQL } from '../utils/pagination';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

const ruleSchema = z.object({
    agentId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    ruleType: z.enum(['fixed', 'percentage_sale', 'percentage_margin']),
    rate: z.number().min(0),
    isActive: z.boolean().default(true),
    notes: z.string().max(500).optional(),
});

// ─── GET /api/commissions/rules ───────────────────
router.get('/rules', requireAuth, requirePermission('manage_settings'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT cr.*,
                    u.full_name as agent_name,
                    p.name as product_name,
                    pc.name as category_name
             FROM commission_rules cr
             LEFT JOIN users u ON u.id = cr.agent_id
             LEFT JOIN products p ON p.id = cr.product_id
             LEFT JOIN product_categories pc ON pc.id = cr.category_id
             WHERE cr.deleted_at IS NULL ORDER BY cr.created_at DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List commission rules error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list commission rules' } });
    }
});

// ─── POST /api/commissions/rules ──────────────────
router.post('/rules', requireAuth, requirePermission('manage_settings'), validateBody(ruleSchema), async (req: Request, res: Response) => {
    try {
        const { agentId, productId, categoryId, ruleType, rate, isActive, notes } = req.body;
        const result = await query(
            `INSERT INTO commission_rules (agent_id, product_id, category_id, rule_type, rate, is_active, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [agentId || null, productId || null, categoryId || null, ruleType, rate, isActive, notes || null, req.session.userId]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create commission rule error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create rule' } });
    }
});

// ─── PUT /api/commissions/rules/:id ───────────────
router.put('/rules/:id', requireAuth, requirePermission('manage_settings'), validateBody(ruleSchema), async (req: Request, res: Response) => {
    try {
        const { agentId, productId, categoryId, ruleType, rate, isActive, notes } = req.body;
        const result = await query(
            `UPDATE commission_rules SET
                agent_id=$1, product_id=$2, category_id=$3, rule_type=$4, rate=$5, is_active=$6, notes=$7, updated_at=NOW()
             WHERE id=$8 AND deleted_at IS NULL RETURNING *`,
            [agentId || null, productId || null, categoryId || null, ruleType, rate, isActive, notes || null, req.params.id]
        );
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update commission rule error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update rule' } });
    }
});

// ─── DELETE /api/commissions/rules/:id ────────────
router.delete('/rules/:id', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const result = await query(`UPDATE commission_rules SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
        res.json({ success: true, message: 'Rule deleted' });
    } catch (error) {
        logger.error('Delete commission rule error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete rule' } });
    }
});

// ─── GET /api/commissions ─────────────────────────
router.get('/', requireAuth, requirePermission('view_commissions'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const agentId = req.query.agentId as string || '';
        const status = req.query.status as string || '';
        const { from, to } = req.query as { from?: string; to?: string };
        const isAdmin = (req.session as any).permissions?.includes('manage_settings');

        const params: any[] = [];
        let where = '';
        let idx = 1;

        if (!isAdmin) { where += ` AND c.agent_id=$${idx}`; params.push(req.session.userId); idx++; }
        else if (agentId) { where += ` AND c.agent_id=$${idx}`; params.push(agentId); idx++; }
        if (status) { where += ` AND c.status=$${idx}`; params.push(status); idx++; }
        if (from) { where += ` AND c.created_at>=$${idx}`; params.push(from); idx++; }
        if (to) { where += ` AND c.created_at<=$${idx}::date+interval '1 day'`; params.push(to); idx++; }

        const [data, count, stats] = await Promise.all([
            query(
                `SELECT c.*, u.full_name as agent_name, o.order_number, p.name as product_name, rev.full_name as reviewed_by_name
                 FROM commissions c
                 LEFT JOIN users u ON u.id=c.agent_id
                 LEFT JOIN orders o ON o.id=c.order_id
                 LEFT JOIN products p ON p.id=c.product_id
                 LEFT JOIN users rev ON rev.id=c.reviewed_by
                 WHERE c.deleted_at IS NULL ${where}
                 ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            ),
            query(`SELECT COUNT(*) FROM commissions c WHERE c.deleted_at IS NULL ${where}`, params),
            query(`SELECT
                COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) as total_paid,
                COALESCE(SUM(amount) FILTER (WHERE status IN ('new','approved')),0) as total_pending,
                COALESCE(SUM(amount) FILTER (WHERE status='rejected'),0) as total_rejected
             FROM commissions WHERE deleted_at IS NULL`),
        ]);

        res.json({ success: true, data: data.rows, pagination: paginationMeta(parseInt(count.rows[0].count), pagination), stats: stats.rows[0] });
    } catch (error) {
        logger.error('List commissions error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list commissions' } });
    }
});

// ─── POST /api/commissions/:id/approve ────────────
router.post('/:id/approve', requireAuth, requirePermission('view_commissions'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE commissions SET status='approved', reviewed_by=$1, review_note=$2, reviewed_at=NOW(), updated_at=NOW()
             WHERE id=$3 AND status='new' AND deleted_at IS NULL RETURNING id`,
            [req.session.userId, req.body.note || null, req.params.id]
        );
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Commission not found or already reviewed' } });
        await createAuditLog({ tableName: 'commissions', recordId: String(req.params.id), action: 'update', userId: req.session.userId!, details: 'Commission approved' });
        res.json({ success: true, message: 'Commission approved' });
    } catch (error: any) {
        logger.error('Approve commission error:', error?.message, error?.code, error?.detail);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to approve' } });
    }
});

// ─── POST /api/commissions/:id/reject ─────────────
router.post('/:id/reject', requireAuth, requirePermission('view_commissions'), async (req: Request, res: Response) => {
    try {
        const { note } = req.body;
        if (!note) return void res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rejection reason required' } });
        const result = await query(
            `UPDATE commissions SET status='rejected', reviewed_by=$1, review_note=$2, reviewed_at=NOW(), updated_at=NOW()
             WHERE id=$3 AND status IN ('new','approved') AND deleted_at IS NULL RETURNING id`,
            [req.session.userId, note, req.params.id]
        );
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Commission not found or already paid' } });
        await createAuditLog({ tableName: 'commissions', recordId: String(req.params.id), action: 'update', userId: req.session.userId!, details: `Commission rejected: ${note}` });
        res.json({ success: true, message: 'Commission rejected' });
    } catch (error) {
        logger.error('Reject commission error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reject' } });
    }
});

// ─── POST /api/commissions/:id/pay ────────────────
router.post('/:id/pay', requireAuth, requirePermission('view_commissions'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE commissions SET status='paid', paid_at=NOW(), paid_by=$1, updated_at=NOW()
             WHERE id=$2 AND status='approved' AND deleted_at IS NULL RETURNING id`,
            [req.session.userId, req.params.id]
        );
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Commission not approved yet' } });
        res.json({ success: true, message: 'Commission marked as paid' });
    } catch (error) {
        logger.error('Pay commission error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark as paid' } });
    }
});

export default router;
