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

const expenseSchema = z.object({
    categoryId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(500),
    amount: z.number().positive(),
    expenseDate: z.string(), // ISO date
    status: z.enum(['pending', 'approved', 'paid']).default('pending'),
    notes: z.string().max(1000).optional(),
    isRecurring: z.boolean().default(false),
    recurringInterval: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional().nullable(),
});

const categorySchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    description: z.string().max(255).optional(),
});

// ─── GET /api/expenses/categories ─────────────────
router.get('/categories', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT ec.*, COUNT(e.id) as expense_count
             FROM expense_categories ec
             LEFT JOIN expenses e ON e.category_id = ec.id AND e.deleted_at IS NULL
             WHERE ec.deleted_at IS NULL
             GROUP BY ec.id
             ORDER BY ec.name ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List expense categories error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list categories' } });
    }
});

// ─── POST /api/expenses/categories ────────────────
router.post('/categories', requireAuth, requirePermission('manage_settings'), validateBody(categorySchema), async (req: Request, res: Response) => {
    try {
        const { name, color, description } = req.body;
        const result = await query(
            `INSERT INTO expense_categories (name, color, description, created_by)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, color || '#8B5E3C', description || null, req.session.userId]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create expense category error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create category' } });
    }
});

// ─── GET /api/expenses ────────────────────────────
router.get('/', requireAuth, requirePermission('view_expenses'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const categoryId = req.query.categoryId as string || '';
        const status = req.query.status as string || '';
        const { from, to } = req.query as { from?: string; to?: string };
        const search = req.query.search as string || '';

        const params: any[] = [];
        let whereExtra = '';
        let idx = 1;

        if (search) {
            whereExtra += ` AND e.description ILIKE $${idx}`;
            params.push(`%${search}%`);
            idx++;
        }
        if (categoryId) {
            whereExtra += ` AND e.category_id = $${idx}`;
            params.push(categoryId);
            idx++;
        }
        if (status) {
            whereExtra += ` AND e.status = $${idx}`;
            params.push(status);
            idx++;
        }
        if (from) {
            whereExtra += ` AND e.expense_date >= $${idx}`;
            params.push(from);
            idx++;
        }
        if (to) {
            whereExtra += ` AND e.expense_date <= $${idx}`;
            params.push(to);
            idx++;
        }

        const [dataResult, countResult, statsResult] = await Promise.all([
            query(
                `SELECT e.*, ec.name as category_name, ec.color as category_color,
                        u.full_name as created_by_name
                 FROM expenses e
                 LEFT JOIN expense_categories ec ON ec.id = e.category_id
                 LEFT JOIN users u ON u.id = e.created_by
                 WHERE e.deleted_at IS NULL ${whereExtra}
                 ORDER BY e.expense_date DESC, e.created_at DESC
                 LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            ),
            query(
                `SELECT COUNT(*) FROM expenses e WHERE e.deleted_at IS NULL ${whereExtra}`,
                params
            ),
            query(
                `SELECT
                    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as total_paid,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as total_pending,
                    COALESCE(SUM(amount), 0) as total_all
                 FROM expenses WHERE deleted_at IS NULL`
            ),
        ]);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(parseInt(countResult.rows[0].count), pagination),
            stats: statsResult.rows[0],
        });
    } catch (error) {
        logger.error('List expenses error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list expenses' } });
    }
});

// ─── POST /api/expenses ───────────────────────────
router.post('/', requireAuth, requirePermission('create_expenses'), validateBody(expenseSchema), async (req: Request, res: Response) => {
    try {
        const { categoryId, description, amount, expenseDate, status, notes, isRecurring, recurringInterval } = req.body;
        const result = await query(
            `INSERT INTO expenses (category_id, description, amount, expense_date, status, notes, is_recurring, recurring_interval, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [categoryId || null, description, amount, expenseDate, status, notes || null, isRecurring, recurringInterval || null, req.session.userId]
        );
        await createAuditLog({
            tableName: 'expenses', recordId: result.rows[0].id,
            action: 'create', userId: req.session.userId!,
            details: `Created expense: ${description} (${amount} MAD)`,
        });
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create expense error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create expense' } });
    }
});

// ─── PUT /api/expenses/:id ────────────────────────
router.put('/:id', requireAuth, requirePermission('create_expenses'), validateBody(expenseSchema), async (req: Request, res: Response) => {
    try {
        const { categoryId, description, amount, expenseDate, status, notes, isRecurring, recurringInterval } = req.body;
        const result = await query(
            `UPDATE expenses SET
                category_id = $1, description = $2, amount = $3, expense_date = $4,
                status = $5, notes = $6, is_recurring = $7, recurring_interval = $8,
                updated_at = NOW()
             WHERE id = $9 AND deleted_at IS NULL RETURNING *`,
            [categoryId || null, description, amount, expenseDate, status, notes || null, isRecurring, recurringInterval || null, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update expense error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update expense' } });
    }
});

// ─── DELETE /api/expenses/:id ─────────────────────
router.delete('/:id', requireAuth, requirePermission('create_expenses'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE expenses SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
            return;
        }
        await createAuditLog({
            tableName: 'expenses', recordId: String(req.params.id),
            action: 'delete', userId: req.session.userId!,
            details: `Deleted expense`,
        });
        res.json({ success: true, message: 'Expense deleted' });
    } catch (error) {
        logger.error('Delete expense error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete expense' } });
    }
});

export default router;
