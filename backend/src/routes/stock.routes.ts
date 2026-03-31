import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── Schemas ─────────────────────────────────────

const tissuSchema = z.object({
    tissuName: z.string().min(1).max(150),
    color: z.string().max(80).optional().nullable(),
    largeur: z.number().min(0).optional().nullable(),
    quantity: z.number().min(0),
    unit: z.enum(['M', 'kg']).default('M'),
    pricePerUnit: z.number().min(0),
});

const supplySchema = z.object({
    itemName: z.string().min(1).max(150),
    category: z.string().max(80).optional().nullable(),
    quantity: z.number().min(0),
    unit: z.string().max(20).default('pcs'),
    pricePerUnit: z.number().min(0),
});

// ═══════════════════════════════════════════════════
// TISSUS
// ═══════════════════════════════════════════════════

// GET /api/stock/tissus
router.get('/tissus', requireAuth, requirePermission('manage_employers'), async (_req: Request, res: Response) => {
    try {
        const result = await query(`SELECT * FROM stock_tissus ORDER BY tissu_name, color`);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List tissus error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list tissus' } });
    }
});

// POST /api/stock/tissus
router.post('/tissus', requireAuth, requirePermission('manage_employers'), validateBody(tissuSchema), async (req: Request, res: Response) => {
    try {
        const { tissuName, color, largeur, quantity, unit, pricePerUnit } = req.body;
        const result = await query(
            `INSERT INTO stock_tissus (tissu_name, color, largeur, quantity, unit, price_per_unit)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [tissuName, color || null, largeur || null, quantity, unit, pricePerUnit]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create tissu error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create tissu' } });
    }
});

// PUT /api/stock/tissus/:id
router.put('/tissus/:id', requireAuth, requirePermission('manage_employers'), validateBody(tissuSchema), async (req: Request, res: Response) => {
    try {
        const { tissuName, color, largeur, quantity, unit, pricePerUnit } = req.body;
        const result = await query(
            `UPDATE stock_tissus SET tissu_name=$1, color=$2, largeur=$3, quantity=$4, unit=$5, price_per_unit=$6
             WHERE id=$7 RETURNING *`,
            [tissuName, color || null, largeur || null, quantity, unit, pricePerUnit, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tissu not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update tissu error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update tissu' } });
    }
});

// DELETE /api/stock/tissus/:id
router.delete('/tissus/:id', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(`DELETE FROM stock_tissus WHERE id=$1 RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tissu not found' } });
            return;
        }
        res.json({ success: true, message: 'Tissu deleted' });
    } catch (error) {
        logger.error('Delete tissu error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete tissu' } });
    }
});

// ═══════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════

// GET /api/stock/supplies
router.get('/supplies', requireAuth, requirePermission('manage_employers'), async (_req: Request, res: Response) => {
    try {
        const result = await query(`SELECT * FROM stock_supplies ORDER BY category, item_name`);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List supplies error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list supplies' } });
    }
});

// POST /api/stock/supplies
router.post('/supplies', requireAuth, requirePermission('manage_employers'), validateBody(supplySchema), async (req: Request, res: Response) => {
    try {
        const { itemName, category, quantity, unit, pricePerUnit } = req.body;
        const result = await query(
            `INSERT INTO stock_supplies (item_name, category, quantity, unit, price_per_unit)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [itemName, category || null, quantity, unit, pricePerUnit]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create supply error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create supply' } });
    }
});

// PUT /api/stock/supplies/:id
router.put('/supplies/:id', requireAuth, requirePermission('manage_employers'), validateBody(supplySchema), async (req: Request, res: Response) => {
    try {
        const { itemName, category, quantity, unit, pricePerUnit } = req.body;
        const result = await query(
            `UPDATE stock_supplies SET item_name=$1, category=$2, quantity=$3, unit=$4, price_per_unit=$5
             WHERE id=$6 RETURNING *`,
            [itemName, category || null, quantity, unit, pricePerUnit, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supply not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update supply error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update supply' } });
    }
});

// DELETE /api/stock/supplies/:id
router.delete('/supplies/:id', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(`DELETE FROM stock_supplies WHERE id=$1 RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supply not found' } });
            return;
        }
        res.json({ success: true, message: 'Supply deleted' });
    } catch (error) {
        logger.error('Delete supply error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete supply' } });
    }
});

export default router;
