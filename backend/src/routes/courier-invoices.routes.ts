import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

const router = Router();

// ─── POST /api/courier-invoices/import ───────────
// Accepts JSON array of invoice rows (parsed CSV on frontend)
router.post('/import', requireAuth, requirePermission('approve_expenses'), async (req: Request, res: Response) => {
    try {
        const { rows, courier_name } = req.body;
        // rows = [{ tracking_number, amount, date }, ...]
        if (!Array.isArray(rows) || rows.length === 0) {
            res.status(400).json({ success: false, error: { code: 'INVALID_DATA', message: 'No rows provided' } });
            return;
        }

        const results = [];
        for (const row of rows) {
            // Try to match by tracking number
            const orderResult = await query(
                `SELECT id, order_number, tracking_number, final_amount, shipping_status
                 FROM orders WHERE tracking_number = $1 LIMIT 1`,
                [row.tracking_number]
            );

            const matched = orderResult.rows.length > 0;
            const order = matched ? orderResult.rows[0] : null;
            const amountMismatch = matched ? Math.abs(parseFloat(order.final_amount) - parseFloat(row.amount)) > 1 : false;

            // Insert into courier_invoices
            const insertResult = await query(
                `INSERT INTO courier_invoices
                 (tracking_number, invoice_amount, invoice_date, courier_name, order_id,
                  matched, amount_mismatch, status, imported_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING *`,
                [
                    row.tracking_number, row.amount, row.date || new Date(),
                    courier_name || 'Unknown', order?.id || null,
                    matched, amountMismatch, req.session.userId,
                ]
            );

            results.push({
                ...insertResult.rows[0],
                order_number: order?.order_number || null,
                order_amount: order?.final_amount || null,
            });
        }

        await createAuditLog({
            tableName: 'courier_invoices', recordId: 'bulk',
            action: 'create', userId: req.session.userId!,
            details: `Imported ${rows.length} courier invoice rows`,
        });

        res.json({
            success: true,
            data: {
                total: results.length,
                matched: results.filter(r => r.matched).length,
                unmatched: results.filter(r => !r.matched).length,
                mismatches: results.filter(r => r.amount_mismatch).length,
                rows: results,
            },
        });
    } catch (error) {
        logger.error('Courier invoice import error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Import failed' } });
    }
});

// ─── GET /api/courier-invoices ───────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string;
        let where = 'WHERE 1=1';
        const params: any[] = [];
        if (status) {
            params.push(status);
            where += ` AND ci.status = $${params.length}`;
        }

        const result = await query(
            `SELECT ci.*, o.order_number, o.final_amount as order_amount
             FROM courier_invoices ci
             LEFT JOIN orders o ON o.id = ci.order_id
             ${where}
             ORDER BY ci.created_at DESC
             LIMIT 500`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List courier invoices error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list invoices' } });
    }
});

// ─── PUT /api/courier-invoices/:id/approve ───────
router.put('/:id/approve', requireAuth, requirePermission('approve_expenses'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Get invoice
        const inv = await query('SELECT * FROM courier_invoices WHERE id = $1', [id]);
        if (inv.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
            return;
        }

        // Update to approved
        await query(
            `UPDATE courier_invoices SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
            [req.session.userId, id]
        );

        // Create shipping expense from this invoice
        const invoice = inv.rows[0];
        if (invoice.order_id) {
            await query(
                `INSERT INTO expenses (category, description, amount, status, related_entity_type, related_entity_id, created_by)
                 VALUES ('shipping', $1, $2, 'approved', 'order', $3, $4)`,
                [
                    `Courier invoice: ${invoice.tracking_number}`,
                    invoice.invoice_amount, invoice.order_id, req.session.userId,
                ]
            );
        }

        res.json({ success: true, message: 'Invoice approved and expense created' });
    } catch (error) {
        logger.error('Approve invoice error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Approval failed' } });
    }
});

// ─── PUT /api/courier-invoices/:id/reject ────────
router.put('/:id/reject', requireAuth, requirePermission('approve_expenses'), async (req: Request, res: Response) => {
    try {
        await query(
            `UPDATE courier_invoices SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), notes = $2 WHERE id = $3`,
            [req.session.userId, req.body.reason || null, req.params.id]
        );
        res.json({ success: true, message: 'Invoice rejected' });
    } catch (error) {
        logger.error('Reject invoice error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Rejection failed' } });
    }
});

export default router;
