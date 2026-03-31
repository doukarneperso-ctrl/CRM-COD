import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';

const router = Router();

const createCampaignSchema = z.object({
    name: z.string().min(1).max(200),
    platform: z.enum(['facebook', 'instagram', 'google', 'tiktok', 'snapchat', 'other']),
    budget: z.number().min(0).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    notes: z.string().optional(),
});

const addCostSchema = z.object({
    date: z.string(),
    amount: z.number().min(0),
    impressions: z.number().int().min(0).optional(),
    clicks: z.number().int().min(0).optional(),
    conversions: z.number().int().min(0).optional(),
    notes: z.string().optional(),
});

// ─── GET /api/ads/campaigns ──────────────────────
router.get('/campaigns', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT c.*,
                COALESCE(SUM(d.spend), 0) as total_spent,
                COUNT(d.id) as cost_entries
            FROM ad_campaigns c
            LEFT JOIN ad_daily_costs d ON d.campaign_id = c.id
            WHERE c.deleted_at IS NULL
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List campaigns error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list campaigns' } });
    }
});

// ─── POST /api/ads/campaigns ─────────────────────
router.post('/campaigns', requireAuth, requirePermission('approve_expenses'), validateBody(createCampaignSchema), async (req: Request, res: Response) => {
    try {
        const { name, platform, budget, start_date, end_date, notes } = req.body;

        const result = await query(
            `INSERT INTO ad_campaigns (name, platform, budget, start_date, end_date, notes, is_active, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING *`,
            [name, platform, budget || 0, start_date || null, end_date || null, notes || null, req.session.userId]
        );

        await createAuditLog({
            tableName: 'ad_campaigns', recordId: result.rows[0].id, action: 'create',
            userId: req.session.userId!, newValues: req.body, details: `Campaign created: ${name}`,
        });

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create campaign error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create campaign' } });
    }
});

// ─── PUT /api/ads/campaigns/:id ──────────────────
router.put('/campaigns/:id', requireAuth, requirePermission('approve_expenses'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, platform, budget, start_date, end_date, notes, is_active } = req.body;

        await query(
            `UPDATE ad_campaigns SET name = COALESCE($1, name), platform = COALESCE($2, platform),
             budget = COALESCE($3, budget), start_date = COALESCE($4, start_date),
             end_date = COALESCE($5, end_date), notes = COALESCE($6, notes),
             is_active = COALESCE($7, is_active), updated_at = NOW() WHERE id = $8`,
            [name, platform, budget, start_date, end_date, notes, is_active, id]
        );

        res.json({ success: true, message: 'Campaign updated' });
    } catch (error) {
        logger.error('Update campaign error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update campaign' } });
    }
});

// ─── DELETE /api/ads/campaigns/:id ───────────────
router.delete('/campaigns/:id', requireAuth, requirePermission('approve_expenses'), async (req: Request, res: Response) => {
    try {
        await query('UPDATE ad_campaigns SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Campaign deleted' });
    } catch (error) {
        logger.error('Delete campaign error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete campaign' } });
    }
});

// ─── GET /api/ads/campaigns/:id/costs ────────────
router.get('/campaigns/:id/costs', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM ad_daily_costs WHERE campaign_id = $1 ORDER BY date DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List daily costs error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list costs' } });
    }
});

// ─── POST /api/ads/campaigns/:id/costs ───────────
router.post('/campaigns/:id/costs', requireAuth, requirePermission('approve_expenses'), validateBody(addCostSchema), async (req: Request, res: Response) => {
    try {
        const { date, amount, impressions, clicks, conversions, notes } = req.body;

        const result = await query(
            `INSERT INTO ad_daily_costs (campaign_id, date, spend, impressions, clicks, conversions, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.params.id, date, amount, impressions || 0, clicks || 0, conversions || 0, notes || null]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Add daily cost error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add cost' } });
    }
});

export default router;
