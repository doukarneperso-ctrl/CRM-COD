import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import { parsePagination, paginationMeta, paginationSQL } from '../utils/pagination';
import { normalizePhone } from '../utils/phone';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── Schemas ──────────────────────────────────────
const createCustomerSchema = z.object({
    fullName: z.string().min(1).max(255),
    phone: z.string().min(5),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().max(100).optional(),
});

const updateCustomerSchema = z.object({
    fullName: z.string().min(1).max(255).optional(),
    phone: z.string().min(5).optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().max(100).optional(),
});

// ─── GET /api/customers ───────────────────────────
router.get('/', requireAuth, requirePermission('view_customers'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const search = req.query.search as string || '';
        const city = req.query.city as string || '';
        const tag = req.query.tag as string || '';

        let whereClause = 'WHERE c.deleted_at IS NULL';
        const params: any[] = [];
        let idx = 1;

        if (search) {
            whereClause += ` AND (c.full_name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.phone_norm ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }
        if (city) {
            whereClause += ` AND c.city = $${idx}`;
            params.push(city);
            idx++;
        }
        if (tag) {
            whereClause += ` AND EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id = c.id AND ct.tag = $${idx})`;
            params.push(tag);
            idx++;
        }

        const [dataResult, countResult] = await Promise.all([
            query(
                `SELECT c.*,
                COALESCE(json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL), '[]') as tags
         FROM customers c
         LEFT JOIN customer_tags ct ON ct.customer_id = c.id
         ${whereClause}
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            ),
            query(`SELECT COUNT(*) FROM customers c ${whereClause}`, params),
        ]);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(parseInt(countResult.rows[0].count), pagination),
        });
    } catch (error) {
        logger.error('List customers error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list customers' } });
    }
});

// ─── GET /api/customers/:id ───────────────────────
router.get('/:id', requireAuth, requirePermission('view_customers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT c.*,
              COALESCE(json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL), '[]') as tags,
              COALESCE(json_agg(DISTINCT jsonb_build_object('id', cn.id, 'note', cn.note, 'createdAt', cn.created_at)) 
                FILTER (WHERE cn.id IS NOT NULL), '[]') as notes
       FROM customers c
       LEFT JOIN customer_tags ct ON ct.customer_id = c.id
       LEFT JOIN customer_notes cn ON cn.customer_id = c.id
       WHERE c.id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
            return;
        }

        // Get order history
        const orders = await query(
            `SELECT id, order_number, confirmation_status, shipping_status, final_amount, created_at
       FROM orders WHERE customer_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 20`,
            [req.params.id]
        );

        const data = { ...result.rows[0], recentOrders: orders.rows };
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Get customer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get customer' } });
    }
});

// ─── POST /api/customers ──────────────────────────
router.post('/', requireAuth, requirePermission('create_customers'), validateBody(createCustomerSchema), async (req: Request, res: Response) => {
    try {
        const { fullName, phone, email, address, city } = req.body;
        const phoneNorm = normalizePhone(phone);

        // Check duplicate phone
        const existing = await query(
            'SELECT id, full_name FROM customers WHERE phone_norm = $1 AND deleted_at IS NULL',
            [phoneNorm]
        );
        if (existing.rows.length > 0) {
            res.status(409).json({
                success: false,
                error: { code: 'CONFLICT', message: `Customer already exists: ${existing.rows[0].full_name}` },
            });
            return;
        }

        const result = await query(
            `INSERT INTO customers (full_name, phone, phone_norm, email, address, city)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [fullName, phone, phoneNorm, email || null, address || null, city || null]
        );

        await createAuditLog({
            tableName: 'customers', recordId: result.rows[0].id, action: 'create',
            userId: req.session.userId!, newValues: { fullName, phone, city },
        });

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create customer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create customer' } });
    }
});

// ─── PUT /api/customers/:id ───────────────────────
router.put('/:id', requireAuth, requirePermission('edit_customers'), validateBody(updateCustomerSchema), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.fullName !== undefined) { fields.push(`full_name = $${idx++}`); values.push(updates.fullName); }
        if (updates.phone !== undefined) {
            fields.push(`phone = $${idx++}`); values.push(updates.phone);
            fields.push(`phone_norm = $${idx++}`); values.push(normalizePhone(updates.phone));
        }
        if (updates.email !== undefined) { fields.push(`email = $${idx++}`); values.push(updates.email); }
        if (updates.address !== undefined) { fields.push(`address = $${idx++}`); values.push(updates.address); }
        if (updates.city !== undefined) { fields.push(`city = $${idx++}`); values.push(updates.city); }

        if (fields.length === 0) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
            return;
        }
        fields.push('updated_at = NOW()');
        values.push(id);

        const result = await query(
            `UPDATE customers SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
            return;
        }

        await createAuditLog({ tableName: 'customers', recordId: req.params.id as string, action: 'update', userId: req.session.userId!, newValues: updates });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update customer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update customer' } });
    }
});

// ─── POST /api/customers/:id/tags ─────────────────
router.post('/:id/tags', requireAuth, requirePermission('manage_customer_tags'), async (req: Request, res: Response) => {
    try {
        const { tag } = req.body;
        const validTags = ['vip', 'blacklist', 'wholesale', 'repeat', 'high_return'];
        if (!validTags.includes(tag)) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid tag. Must be: ${validTags.join(', ')}` } });
            return;
        }

        await query(
            'INSERT INTO customer_tags (customer_id, tag, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.params.id, tag, req.session.userId]
        );

        res.json({ success: true, message: 'Tag added' });
    } catch (error) {
        logger.error('Add tag error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add tag' } });
    }
});

// ─── DELETE /api/customers/:id/tags/:tag ──────────
router.delete('/:id/tags/:tag', requireAuth, requirePermission('manage_customer_tags'), async (req: Request, res: Response) => {
    try {
        await query('DELETE FROM customer_tags WHERE customer_id = $1 AND tag = $2', [req.params.id, req.params.tag]);
        res.json({ success: true, message: 'Tag removed' });
    } catch (error) {
        logger.error('Remove tag error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove tag' } });
    }
});

// ─── POST /api/customers/:id/notes ────────────────
router.post('/:id/notes', requireAuth, requirePermission('edit_customers'), async (req: Request, res: Response) => {
    try {
        const { note } = req.body;
        if (!note || !note.trim()) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Note is required' } });
            return;
        }

        const result = await query(
            'INSERT INTO customer_notes (customer_id, note, created_by) VALUES ($1, $2, $3) RETURNING *',
            [req.params.id, note.trim(), req.session.userId]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Add note error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add note' } });
    }
});

// ─── GET /api/customers/:id/notes ─────────────────
router.get('/:id/notes', requireAuth, requirePermission('view_customers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT cn.*, u.full_name as created_by_name
             FROM customer_notes cn
             LEFT JOIN users u ON u.id = cn.created_by
             WHERE cn.customer_id = $1
             ORDER BY cn.created_at DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List notes error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list notes' } });
    }
});

// ─── DELETE /api/customers/:id ────────────────────
router.delete('/:id', requireAuth, requirePermission('edit_customers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            'UPDATE customers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
            return;
        }
        await createAuditLog({
            tableName: 'customers', recordId: req.params.id as string, action: 'delete',
            userId: req.session.userId!, details: `Deleted customer ${req.params.id}`,
        });
        res.json({ success: true, message: 'Customer deleted' });
    } catch (error) {
        logger.error('Delete customer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete customer' } });
    }
});

// ─── GET /api/customers/cities ────────────────────
router.get('/cities/list', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT DISTINCT city FROM customers WHERE city IS NOT NULL AND deleted_at IS NULL ORDER BY city`
        );
        res.json({ success: true, data: result.rows.map((r: any) => r.city) });
    } catch (error) {
        logger.error('List cities error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list cities' } });
    }
});

export default router;

