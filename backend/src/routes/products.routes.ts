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

// ─── Schemas ──────────────────────────────────────
const createProductSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    sku: z.string().max(100).optional(),
    imageUrl: z.string().optional(),
    variants: z.array(z.object({
        size: z.string().optional(),
        color: z.string().optional(),
        sku: z.string().optional(),
        price: z.number().min(0),
        costPrice: z.number().min(0).optional(),
        stock: z.number().int().min(0).default(0),
        lowStockThreshold: z.number().int().min(0).default(5),
    })).min(1),
});

const updateProductSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    sku: z.string().max(100).optional(),
    imageUrl: z.string().optional(),
    isActive: z.boolean().optional(),
});

const addVariantSchema = z.object({
    size: z.string().optional(),
    color: z.string().optional(),
    sku: z.string().optional(),
    price: z.number().min(0),
    costPrice: z.number().min(0).optional(),
    stock: z.number().int().min(0).default(0),
    lowStockThreshold: z.number().int().min(0).default(5),
});

const updateVariantSchema = z.object({
    size: z.string().optional(),
    color: z.string().optional(),
    sku: z.string().optional(),
    price: z.number().min(0).optional(),
    costPrice: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
});

// ─── GET /api/products ────────────────────────────
router.get('/', requireAuth, requirePermission('view_products'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const search = req.query.search as string || '';
        const category = req.query.category as string || '';

        let whereClause = 'WHERE p.deleted_at IS NULL';
        const params: any[] = [];
        let paramIdx = 1;

        if (search) {
            whereClause += ` AND (p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }
        if (category) {
            whereClause += ` AND p.category = $${paramIdx}`;
            params.push(category);
            paramIdx++;
        }

        const [dataResult, countResult] = await Promise.all([
            query(
                `SELECT p.id, p.name, p.description, p.category, p.sku, p.image_url, p.is_active,
                p.store_id, p.created_at,
                COALESCE(json_agg(
                  json_build_object(
                    'id', v.id, 'size', v.size, 'color', v.color, 'sku', v.sku,
                    'price', v.price, 'costPrice', v.cost_price, 'stock', v.stock,
                    'lowStockThreshold', v.low_stock_threshold, 'isActive', v.is_active
                  ) ORDER BY v.created_at
                ) FILTER (WHERE v.id IS NOT NULL), '[]') as variants,
                COALESCE(SUM(v.stock), 0) as total_stock
         FROM products p
         LEFT JOIN product_variants v ON v.product_id = p.id
         ${whereClause}
         GROUP BY p.id
         ORDER BY p.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
                [...params, limit, offset]
            ),
            query(
                `SELECT COUNT(*) FROM products p ${whereClause}`,
                params
            ),
        ]);

        const total = parseInt(countResult.rows[0].count, 10);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(total, pagination),
        });
    } catch (error) {
        logger.error('List products error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list products' } });
    }
});

// ─── GET /api/products/:id ────────────────────────
router.get('/:id', requireAuth, requirePermission('view_products'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT p.*,
              COALESCE(json_agg(
                json_build_object(
                  'id', v.id, 'size', v.size, 'color', v.color, 'sku', v.sku,
                  'price', v.price, 'costPrice', v.cost_price, 'stock', v.stock,
                  'lowStockThreshold', v.low_stock_threshold, 'isActive', v.is_active
                ) ORDER BY v.created_at
              ) FILTER (WHERE v.id IS NOT NULL), '[]') as variants
       FROM products p
       LEFT JOIN product_variants v ON v.product_id = p.id
       WHERE p.id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Get product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get product' } });
    }
});

// ─── POST /api/products ───────────────────────────
router.post('/', requireAuth, requirePermission('create_products'), validateBody(createProductSchema), async (req: Request, res: Response) => {
    try {
        const { name, description, category, sku, imageUrl, variants } = req.body;

        const product = await transaction(async (client) => {
            const prodResult = await client.query(
                `INSERT INTO products (name, description, category, sku, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
                [name, description || null, category || null, sku || null, imageUrl || null]
            );
            const prod = prodResult.rows[0];

            // Create variants
            for (const v of variants) {
                await client.query(
                    `INSERT INTO product_variants (product_id, size, color, sku, price, cost_price, stock, low_stock_threshold)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [prod.id, v.size || null, v.color || null, v.sku || null, v.price, v.costPrice || 0, v.stock, v.lowStockThreshold || 5]
                );
            }

            return prod;
        });

        await createAuditLog({
            tableName: 'products', recordId: product.id, action: 'create',
            userId: req.session.userId!, newValues: { name, variants: variants.length },
            details: `Created product "${name}" with ${variants.length} variant(s)`,
        });

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        logger.error('Create product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create product' } });
    }
});

// ─── PUT /api/products/:id ────────────────────────
router.put('/:id', requireAuth, requirePermission('edit_products'), validateBody(updateProductSchema), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
        if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }
        if (updates.category !== undefined) { fields.push(`category = $${idx++}`); values.push(updates.category); }
        if (updates.sku !== undefined) { fields.push(`sku = $${idx++}`); values.push(updates.sku); }
        if (updates.imageUrl !== undefined) { fields.push(`image_url = $${idx++}`); values.push(updates.imageUrl); }
        if (updates.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(updates.isActive); }

        if (fields.length === 0) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
            return;
        }

        fields.push('updated_at = NOW()');
        values.push(id);

        const result = await query(
            `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
            return;
        }

        await createAuditLog({
            tableName: 'products', recordId: String(id), action: 'update',
            userId: req.session.userId!, newValues: updates,
        });

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update product' } });
    }
});

// ─── DELETE /api/products/:id ─────────────────────
router.delete('/:id', requireAuth, requirePermission('delete_products'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, name`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
            return;
        }

        await createAuditLog({
            tableName: 'products', recordId: String(req.params.id), action: 'delete',
            userId: req.session.userId!, details: `Deleted product "${result.rows[0].name}"`,
        });

        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        logger.error('Delete product error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete product' } });
    }
});

// ─── POST /api/products/:id/variants ──────────────
router.post('/:id/variants', requireAuth, requirePermission('edit_products'), validateBody(addVariantSchema), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const v = req.body;

        const result = await query(
            `INSERT INTO product_variants (product_id, size, color, sku, price, cost_price, stock, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [id, v.size || null, v.color || null, v.sku || null, v.price, v.costPrice || 0, v.stock, v.lowStockThreshold || 5]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Add variant error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add variant' } });
    }
});

// ─── PUT /api/products/:id/variants/:variantId ────
router.put('/:id/variants/:variantId', requireAuth, requirePermission('edit_products'), validateBody(updateVariantSchema), async (req: Request, res: Response) => {
    try {
        const { variantId } = req.params;
        const updates = req.body;

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.size !== undefined) { fields.push(`size = $${idx++}`); values.push(updates.size); }
        if (updates.color !== undefined) { fields.push(`color = $${idx++}`); values.push(updates.color); }
        if (updates.sku !== undefined) { fields.push(`sku = $${idx++}`); values.push(updates.sku); }
        if (updates.price !== undefined) { fields.push(`price = $${idx++}`); values.push(updates.price); }
        if (updates.costPrice !== undefined) { fields.push(`cost_price = $${idx++}`); values.push(updates.costPrice); }
        if (updates.stock !== undefined) { fields.push(`stock = $${idx++}`); values.push(updates.stock); }
        if (updates.lowStockThreshold !== undefined) { fields.push(`low_stock_threshold = $${idx++}`); values.push(updates.lowStockThreshold); }
        if (updates.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(updates.isActive); }

        if (fields.length === 0) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
            return;
        }

        fields.push('updated_at = NOW()');
        values.push(variantId);

        const result = await query(
            `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } });
            return;
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update variant error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update variant' } });
    }
});

// ─── DELETE /api/products/:id/variants/:variantId ──
router.delete('/:id/variants/:variantId', requireAuth, requirePermission('edit_products'), async (req: Request, res: Response) => {
    try {
        const { id, variantId } = req.params;

        const result = await query(
            `DELETE FROM product_variants WHERE id = $1 AND product_id = $2 RETURNING id`,
            [variantId, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } });
            return;
        }

        res.json({ success: true, message: 'Variant deleted' });
    } catch (error) {
        logger.error('Delete variant error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete variant' } });
    }
});

// ─── GET /api/products/stock/overview ─────────────
router.get('/stock/overview', requireAuth, requirePermission('view_products'), async (_req: Request, res: Response) => {
    try {
        const result = await query(`
      SELECT p.id as product_id, p.name as product_name, p.category, p.image_url,
             v.id as variant_id, v.size, v.color, v.sku, v.stock,
             v.low_stock_threshold, v.price, v.cost_price,
             CASE
               WHEN v.stock = 0 THEN 'out_of_stock'
               WHEN v.stock <= v.low_stock_threshold THEN 'low_stock'
               ELSE 'in_stock'
             END as stock_status
      FROM products p
      JOIN product_variants v ON v.product_id = p.id AND v.is_active = true
      WHERE p.deleted_at IS NULL AND p.is_active = true
      ORDER BY v.stock ASC, p.name ASC
    `);

        // Compute summary KPIs
        const totalVariants = result.rows.length;
        const outOfStock = result.rows.filter((r: any) => r.stock_status === 'out_of_stock').length;
        const lowStock = result.rows.filter((r: any) => r.stock_status === 'low_stock').length;
        const totalUnits = result.rows.reduce((sum: number, r: any) => sum + parseInt(r.stock), 0);

        res.json({
            success: true,
            data: result.rows,
            summary: { totalVariants, outOfStock, lowStock, inStock: totalVariants - outOfStock - lowStock, totalUnits },
        });
    } catch (error) {
        logger.error('Stock overview error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get stock overview' } });
    }
});

// ─── GET /api/products/categories ─────────────────
router.get('/categories/list', requireAuth, requirePermission('view_products'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND deleted_at IS NULL ORDER BY category`
        );
        res.json({ success: true, data: result.rows.map((r: any) => r.category) });
    } catch (error) {
        logger.error('List categories error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list categories' } });
    }
});

export default router;
