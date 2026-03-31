import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

const settingsUpdateSchema = z.object({
    settings: z.array(z.object({
        key: z.string(),
        value: z.any(),
    })).min(1),
});

const storeSettingsSchema = z.object({
    syncInterval: z.number().int().min(1).max(1440).optional(),
    syncType: z.enum(['products', 'orders', 'both']).optional(),
    isActive: z.boolean().optional(),
    fieldMapping: z.record(z.string(), z.any()).optional(),
});

// ─── GET /api/settings ────────────────────────────
router.get('/', requireAuth, requirePermission('manage_settings'), async (_req: Request, res: Response) => {
    try {
        const result = await query(`SELECT key, value, description, category FROM system_settings ORDER BY category, key`);
        // Group by category
        const grouped: Record<string, any> = {};
        for (const row of result.rows) {
            if (!grouped[row.category]) grouped[row.category] = {};
            grouped[row.category][row.key] = { value: row.value, description: row.description };
        }
        res.json({ success: true, data: grouped, raw: result.rows });
    } catch (error) {
        logger.error('Get settings error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get settings' } });
    }
});

// ─── PUT /api/settings ────────────────────────────
router.put('/', requireAuth, requirePermission('manage_settings'), validateBody(settingsUpdateSchema), async (req: Request, res: Response) => {
    try {
        const { settings } = req.body as { settings: { key: string; value: any }[] };
        for (const item of settings) {
            await query(
                `INSERT INTO system_settings (key, value) VALUES ($1, to_jsonb($2::text))
                 ON CONFLICT (key) DO UPDATE SET value = to_jsonb($2::text), updated_at = NOW()`,
                [item.key, typeof item.value === 'string' ? item.value : JSON.stringify(item.value)]
            );
        }
        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        logger.error('Update settings error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update settings' } });
    }
});

// ─── GET /api/settings/stores ─────────────────────
router.get('/stores', requireAuth, requirePermission('manage_settings'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT id, name, platform, is_active, sync_interval, sync_type, field_mapping, last_sync_at, created_at,
                    (access_token IS NOT NULL) as is_connected,
                    (SELECT COUNT(*) FROM products WHERE store_id = stores.id) as product_count,
                    (SELECT COUNT(*) FROM orders WHERE store_id = stores.id) as order_count
             FROM stores WHERE deleted_at IS NULL ORDER BY created_at DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List stores error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list stores' } });
    }
});

// ─── GET /api/settings/stores/:id ─────────────────
router.get('/stores/:id', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT id, name, platform, is_active, sync_interval, sync_type, field_mapping, last_sync_at, created_at FROM stores WHERE id=$1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Get store error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get store' } });
    }
});

// ─── PUT /api/settings/stores/:id ─────────────────
router.put('/stores/:id', requireAuth, requirePermission('manage_settings'), validateBody(storeSettingsSchema), async (req: Request, res: Response) => {
    try {
        const { syncInterval, syncType, isActive, fieldMapping } = req.body;
        const fields: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let idx = 1;
        if (syncInterval !== undefined) { fields.push(`sync_interval=$${idx}`); params.push(syncInterval); idx++; }
        if (syncType !== undefined) { fields.push(`sync_type=$${idx}`); params.push(syncType); idx++; }
        if (isActive !== undefined) { fields.push(`is_active=$${idx}`); params.push(isActive); idx++; }
        if (fieldMapping !== undefined) { fields.push(`field_mapping=$${idx}`); params.push(JSON.stringify(fieldMapping)); idx++; }
        params.push(req.params.id);
        const result = await query(`UPDATE stores SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, params);
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update store error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update store' } });
    }
});

// ─── DELETE /api/settings/stores/:id ──────────────
router.delete('/stores/:id', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        // Soft delete + clear credentials so it shows as disconnected
        const result = await query(
            `UPDATE stores SET deleted_at = NOW(), access_token = NULL, refresh_token = NULL, is_active = false
             WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id]
        );
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        res.json({ success: true, message: 'Store removed' });
    } catch (error) {
        logger.error('Delete store error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove store' } });
    }
});

// ─── POST /api/settings/stores/:id/sync ───────────
// Trigger manual sync — records timestamp; actual sync handled by worker
router.post('/stores/:id/sync', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const result = await query(`UPDATE stores SET sync_requested_at=NOW() WHERE id=$1 RETURNING id, name`, [req.params.id]);
        if (result.rows.length === 0) return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        res.json({ success: true, message: `Manual sync queued for ${result.rows[0].name}` });
    } catch (error) {
        logger.error('Sync store error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to queue sync' } });
    }
});

// ─── GET /api/settings/stores/:id/logs ────────────
router.get('/stores/:id/logs', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM sync_logs WHERE store_id=$1 ORDER BY created_at DESC LIMIT 50`,
            [req.params.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Store logs error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get logs' } });
    }
});

export default router;
