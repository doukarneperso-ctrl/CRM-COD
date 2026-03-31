import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// ─── GET /api/notifications ────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId;
        const limit = parseInt(req.query.limit as string) || 30;
        const offset = parseInt(req.query.offset as string) || 0;

        const [dataResult, countResult] = await Promise.all([
            query(
                `SELECT id, type, title, message, data, is_read, read_at, created_at
                 FROM notifications
                 WHERE user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
                [userId, limit, offset]
            ),
            query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1`, [userId]),
        ]);

        res.json({
            success: true,
            data: dataResult.rows,
            total: parseInt(countResult.rows[0].count),
        });
    } catch (error) {
        logger.error('List notifications error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list notifications' } });
    }
});

// ─── GET /api/notifications/unread-count ───────────
router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
            [req.session.userId]
        );
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get unread count' } });
    }
});

// ─── PUT /api/notifications/:id/read ──────────────
router.put('/:id/read', requireAuth, async (req: Request, res: Response) => {
    try {
        await query(
            `UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark read' } });
    }
});

// ─── PUT /api/notifications/read-all ──────────────
router.put('/read-all', requireAuth, async (req: Request, res: Response) => {
    try {
        await query(
            `UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`,
            [req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark all read' } });
    }
});

export default router;
