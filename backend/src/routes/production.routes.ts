import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── Schemas ─────────────────────────────────────

const productSchema = z.object({
    name: z.string().min(1).max(200),
    photoUrl: z.string().optional().nullable(),
});

const productTissuSchema = z.object({
    stockTissuId: z.string().uuid(),
    consumptionPerPiece: z.number().min(0),
});

const roloSchema = z.object({
    stockTissuId: z.string().uuid().optional().nullable(),
    color: z.string().max(80).optional().nullable(),
    quantity: z.number().int().min(1),
    metersPerRolo: z.number().min(0),
    expectedPieces: z.number().int().min(0).optional().default(0),
    actualPieces: z.number().int().min(0).optional().default(0),
});

const cuttingSchema = z.object({
    meters: z.number().min(0).optional().default(0),
    cm: z.number().min(0).optional().default(0),
    cuttingDate: z.string().optional().nullable(),
    workStartDate: z.string().optional().nullable(),
    workEndDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
});

const expenseSchema = z.object({
    expenseName: z.string().min(1).max(150),
    stockSupplyId: z.string().uuid().optional().nullable(),
    unitCost: z.number().min(0),
    qtyPerPiece: z.number().min(0).default(1),
});

// ═══════════════════════════════════════════════════
// PRODUCTS CRUD
// ═══════════════════════════════════════════════════

// GET /api/production/products
router.get('/products', requireAuth, requirePermission('manage_employers'), async (_req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT p.*,
                (SELECT COUNT(*)::int FROM product_tissus pt WHERE pt.product_id = p.id) as tissu_count,
                (SELECT COUNT(*)::int FROM product_rolos pr WHERE pr.product_id = p.id) as rolo_count,
                (SELECT COUNT(*)::int FROM product_cutting pc WHERE pc.product_id = p.id) as cutting_count,
                (SELECT COUNT(*)::int FROM product_expenses pe WHERE pe.product_id = p.id) as expense_count
            FROM products_atelier p
            ORDER BY p.created_at DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List products error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list products' } });
    }
});

// GET /api/production/products/:id
router.get('/products/:id', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const product = await query(`SELECT * FROM products_atelier WHERE id = $1`, [req.params.id]);
        if (product.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
            return;
        }

        const tissus = await query(`
            SELECT pt.*, st.tissu_name, st.color as tissu_color, st.largeur as tissu_largeur, st.price_per_unit, st.unit
            FROM product_tissus pt
            JOIN stock_tissus st ON st.id = pt.stock_tissu_id
            WHERE pt.product_id = $1
            ORDER BY st.tissu_name
        `, [req.params.id]);

        const rolos = await query(`
            SELECT pr.*, st.tissu_name
            FROM product_rolos pr
            LEFT JOIN stock_tissus st ON st.id = pr.stock_tissu_id
            WHERE pr.product_id = $1
            ORDER BY pr.created_at
        `, [req.params.id]);

        const cutting = await query(`SELECT * FROM product_cutting WHERE product_id = $1 ORDER BY cutting_date DESC`, [req.params.id]);

        const expenses = await query(`
            SELECT pe.*, ss.item_name as supply_item_name
            FROM product_expenses pe
            LEFT JOIN stock_supplies ss ON ss.id = pe.stock_supply_id
            WHERE pe.product_id = $1
            ORDER BY pe.expense_name
        `, [req.params.id]);

        res.json({
            success: true,
            data: {
                ...product.rows[0],
                tissus: tissus.rows,
                rolos: rolos.rows,
                cutting: cutting.rows,
                expenses: expenses.rows,
            },
        });
    } catch (error) {
        logger.error('Get product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get product' } });
    }
});

// POST /api/production/products
router.post('/products', requireAuth, requirePermission('manage_employers'), validateBody(productSchema), async (req: Request, res: Response) => {
    try {
        const { name, photoUrl } = req.body;
        const result = await query(
            `INSERT INTO products_atelier (name, photo_url) VALUES ($1, $2) RETURNING *`,
            [name, photoUrl || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create product' } });
    }
});

// PUT /api/production/products/:id
router.put('/products/:id', requireAuth, requirePermission('manage_employers'), validateBody(productSchema), async (req: Request, res: Response) => {
    try {
        const { name, photoUrl } = req.body;
        const result = await query(
            `UPDATE products_atelier SET name=$1, photo_url=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
            [name, photoUrl || null, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update product' } });
    }
});

// DELETE /api/production/products/:id
router.delete('/products/:id', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(`DELETE FROM products_atelier WHERE id=$1 RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
            return;
        }
        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        logger.error('Delete product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete product' } });
    }
});

// ═══════════════════════════════════════════════════
// PRODUCT TISSUS (link product ↔ tissu from stock)
// ═══════════════════════════════════════════════════

// GET /api/production/products/:id/tissus
router.get('/products/:id/tissus', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT pt.*, st.tissu_name, st.color as tissu_color, st.largeur as tissu_largeur, st.price_per_unit, st.unit, st.quantity as stock_quantity
            FROM product_tissus pt
            JOIN stock_tissus st ON st.id = pt.stock_tissu_id
            WHERE pt.product_id = $1
            ORDER BY st.tissu_name
        `, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List product tissus error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list product tissus' } });
    }
});

// POST /api/production/products/:id/tissus
router.post('/products/:id/tissus', requireAuth, requirePermission('manage_employers'), validateBody(productTissuSchema), async (req: Request, res: Response) => {
    try {
        const { stockTissuId, consumptionPerPiece } = req.body;
        const result = await query(
            `INSERT INTO product_tissus (product_id, stock_tissu_id, consumption_per_piece)
             VALUES ($1, $2, $3) RETURNING *`,
            [req.params.id, stockTissuId, consumptionPerPiece]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Add product tissu error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add tissu to product' } });
    }
});

// DELETE /api/production/products/:id/tissus/:tissuId
router.delete('/products/:id/tissus/:tissuId', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `DELETE FROM product_tissus WHERE id=$1 AND product_id=$2 RETURNING id`,
            [req.params.tissuId, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product tissu link not found' } });
            return;
        }
        res.json({ success: true, message: 'Tissu removed from product' });
    } catch (error) {
        logger.error('Delete product tissu error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove tissu' } });
    }
});

// ═══════════════════════════════════════════════════
// ROLOS
// ═══════════════════════════════════════════════════

// GET /api/production/products/:id/rolos
router.get('/products/:id/rolos', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT pr.*, st.tissu_name
            FROM product_rolos pr
            LEFT JOIN stock_tissus st ON st.id = pr.stock_tissu_id
            WHERE pr.product_id = $1
            ORDER BY pr.created_at
        `, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List rolos error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list rolos' } });
    }
});

// POST /api/production/products/:id/rolos
router.post('/products/:id/rolos', requireAuth, requirePermission('manage_employers'), validateBody(roloSchema), async (req: Request, res: Response) => {
    try {
        const { stockTissuId, color, quantity, metersPerRolo, expectedPieces, actualPieces } = req.body;
        const result = await query(
            `INSERT INTO product_rolos (product_id, stock_tissu_id, color, quantity, meters_per_rolo, expected_pieces, actual_pieces)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.params.id, stockTissuId || null, color || null, quantity, metersPerRolo, expectedPieces || 0, actualPieces || 0]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create rolo error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create rolo' } });
    }
});

// PUT /api/production/products/:id/rolos/:roloId
router.put('/products/:id/rolos/:roloId', requireAuth, requirePermission('manage_employers'), validateBody(roloSchema), async (req: Request, res: Response) => {
    try {
        const { stockTissuId, color, quantity, metersPerRolo, expectedPieces, actualPieces } = req.body;
        const result = await query(
            `UPDATE product_rolos SET stock_tissu_id=$1, color=$2, quantity=$3, meters_per_rolo=$4, expected_pieces=$5, actual_pieces=$6
             WHERE id=$7 AND product_id=$8 RETURNING *`,
            [stockTissuId || null, color || null, quantity, metersPerRolo, expectedPieces || 0, actualPieces || 0, req.params.roloId, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rolo not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update rolo error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update rolo' } });
    }
});

// DELETE /api/production/products/:id/rolos/:roloId
router.delete('/products/:id/rolos/:roloId', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `DELETE FROM product_rolos WHERE id=$1 AND product_id=$2 RETURNING id`,
            [req.params.roloId, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rolo not found' } });
            return;
        }
        res.json({ success: true, message: 'Rolo deleted' });
    } catch (error) {
        logger.error('Delete rolo error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete rolo' } });
    }
});

// ═══════════════════════════════════════════════════
// CUTTING (Traçage)
// ═══════════════════════════════════════════════════

// GET /api/production/products/:id/cutting
router.get('/products/:id/cutting', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM product_cutting WHERE product_id = $1 ORDER BY cutting_date DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List cutting error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list cutting records' } });
    }
});

// POST /api/production/products/:id/cutting
router.post('/products/:id/cutting', requireAuth, requirePermission('manage_employers'), validateBody(cuttingSchema), async (req: Request, res: Response) => {
    try {
        const { meters, cm, cuttingDate, workStartDate, workEndDate, notes } = req.body;
        const result = await query(
            `INSERT INTO product_cutting (product_id, meters, cm, cutting_date, work_start_date, work_end_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.params.id, meters, cm, cuttingDate || null, workStartDate || null, workEndDate || null, notes || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create cutting error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create cutting record' } });
    }
});

// PUT /api/production/products/:id/cutting/:cuttingId
router.put('/products/:id/cutting/:cuttingId', requireAuth, requirePermission('manage_employers'), validateBody(cuttingSchema), async (req: Request, res: Response) => {
    try {
        const { meters, cm, cuttingDate, workStartDate, workEndDate, notes } = req.body;
        const result = await query(
            `UPDATE product_cutting SET meters=$1, cm=$2, cutting_date=$3, work_start_date=$4, work_end_date=$5, notes=$6
             WHERE id=$7 AND product_id=$8 RETURNING *`,
            [meters, cm, cuttingDate || null, workStartDate || null, workEndDate || null, notes || null, req.params.cuttingId, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cutting record not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update cutting error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update cutting record' } });
    }
});

// DELETE /api/production/products/:id/cutting/:cuttingId
router.delete('/products/:id/cutting/:cuttingId', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `DELETE FROM product_cutting WHERE id=$1 AND product_id=$2 RETURNING id`,
            [req.params.cuttingId, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cutting record not found' } });
            return;
        }
        res.json({ success: true, message: 'Cutting record deleted' });
    } catch (error) {
        logger.error('Delete cutting error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete cutting record' } });
    }
});

// ═══════════════════════════════════════════════════
// EXPENSES (Accessories per product)
// ═══════════════════════════════════════════════════

// GET /api/production/products/:id/expenses
router.get('/products/:id/expenses', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT pe.*, ss.item_name as supply_item_name
            FROM product_expenses pe
            LEFT JOIN stock_supplies ss ON ss.id = pe.stock_supply_id
            WHERE pe.product_id = $1
            ORDER BY pe.expense_name
        `, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List expenses error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list expenses' } });
    }
});

// POST /api/production/products/:id/expenses
router.post('/products/:id/expenses', requireAuth, requirePermission('manage_employers'), validateBody(expenseSchema), async (req: Request, res: Response) => {
    try {
        const { expenseName, stockSupplyId, unitCost, qtyPerPiece } = req.body;
        const result = await query(
            `INSERT INTO product_expenses (product_id, expense_name, stock_supply_id, unit_cost, qty_per_piece)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.params.id, expenseName, stockSupplyId || null, unitCost, qtyPerPiece]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create expense error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create expense' } });
    }
});

// DELETE /api/production/products/:id/expenses/:expenseId
router.delete('/products/:id/expenses/:expenseId', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `DELETE FROM product_expenses WHERE id=$1 AND product_id=$2 RETURNING id`,
            [req.params.expenseId, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
            return;
        }
        res.json({ success: true, message: 'Expense deleted' });
    } catch (error) {
        logger.error('Delete expense error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete expense' } });
    }
});

// ═══════════════════════════════════════════════════
// COST BREAKDOWN
// ═══════════════════════════════════════════════════

// GET /api/production/products/:id/cost — full cost per piece + batch
router.get('/products/:id/cost', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        // 1. Tissu cost
        const tissus = await query(`
            SELECT pt.consumption_per_piece, st.price_per_unit, st.tissu_name, st.unit
            FROM product_tissus pt
            JOIN stock_tissus st ON st.id = pt.stock_tissu_id
            WHERE pt.product_id = $1
        `, [req.params.id]);

        let tissuCostPerPiece = 0;
        const tissuDetails = tissus.rows.map((t: any) => {
            const cost = parseFloat(t.consumption_per_piece) * parseFloat(t.price_per_unit);
            tissuCostPerPiece += cost;
            return { tissuName: t.tissu_name, consumptionPerPiece: parseFloat(t.consumption_per_piece), pricePerUnit: parseFloat(t.price_per_unit), unit: t.unit, costPerPiece: Math.round(cost * 100) / 100 };
        });

        // 2. Accessories cost
        const expenses = await query(`
            SELECT expense_name, unit_cost, qty_per_piece
            FROM product_expenses WHERE product_id = $1
        `, [req.params.id]);

        let accessoriesCostPerPiece = 0;
        const accessoryDetails = expenses.rows.map((e: any) => {
            const cost = parseFloat(e.unit_cost) * parseFloat(e.qty_per_piece);
            accessoriesCostPerPiece += cost;
            return { name: e.expense_name, unitCost: parseFloat(e.unit_cost), qtyPerPiece: parseFloat(e.qty_per_piece), costPerPiece: Math.round(cost * 100) / 100 };
        });

        // 3. Total actual pieces from rolos
        const roloResult = await query(
            `SELECT COALESCE(SUM(actual_pieces), 0)::int as total_actual_pieces FROM product_rolos WHERE product_id = $1`,
            [req.params.id]
        );
        const totalActualPieces = roloResult.rows[0]?.total_actual_pieces || 0;

        // 4. Labor cost — from employer attendance during the product's work dates
        let laborCostPerPiece = 0;
        let totalLaborCost = 0;
        const cutting = await query(
            `SELECT work_start_date, work_end_date FROM product_cutting WHERE product_id = $1 AND work_start_date IS NOT NULL AND work_end_date IS NOT NULL`,
            [req.params.id]
        );

        if (cutting.rows.length > 0) {
            // Get the widest date range from cutting records
            const startDate = cutting.rows.reduce((min: string, r: any) => r.work_start_date < min ? r.work_start_date : min, cutting.rows[0].work_start_date);
            const endDate = cutting.rows.reduce((max: string, r: any) => r.work_end_date > max ? r.work_end_date : max, cutting.rows[0].work_end_date);

            // Find how many products share those same work dates
            const sharedProducts = await query(
                `SELECT COUNT(DISTINCT product_id)::int as count FROM product_cutting
                 WHERE work_start_date <= $2 AND work_end_date >= $1`,
                [startDate, endDate]
            );
            const sharedCount = Math.max(1, sharedProducts.rows[0]?.count || 1);

            // Total employer labor cost for those days
            const laborResult = await query(`
                SELECT SUM(
                    CASE WHEN ea.status = 'full' THEN (e.salary / 6.0)
                         WHEN ea.status = 'half' THEN (e.salary / 12.0)
                         ELSE 0
                    END
                )::numeric as total_labor
                FROM employer_attendance ea
                JOIN employers e ON e.id = ea.employer_id AND e.deleted_at IS NULL
                WHERE ea.date >= $1 AND ea.date <= $2
            `, [startDate, endDate]);

            totalLaborCost = Math.round((parseFloat(laborResult.rows[0]?.total_labor || '0') / sharedCount) * 100) / 100;
            laborCostPerPiece = totalActualPieces > 0 ? Math.round((totalLaborCost / totalActualPieces) * 100) / 100 : 0;
        }

        const totalCostPerPiece = Math.round((tissuCostPerPiece + laborCostPerPiece + accessoriesCostPerPiece) * 100) / 100;
        const totalBatchCost = Math.round((totalCostPerPiece * totalActualPieces) * 100) / 100;

        res.json({
            success: true,
            data: {
                tissu: { details: tissuDetails, costPerPiece: Math.round(tissuCostPerPiece * 100) / 100 },
                labor: { totalLaborCost, costPerPiece: laborCostPerPiece },
                accessories: { details: accessoryDetails, costPerPiece: Math.round(accessoriesCostPerPiece * 100) / 100 },
                totalPieces: totalActualPieces,
                totalCostPerPiece,
                totalBatchCost,
            },
        });
    } catch (error) {
        logger.error('Get cost breakdown error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get cost breakdown' } });
    }
});

export default router;
