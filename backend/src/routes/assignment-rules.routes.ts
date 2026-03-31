import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── GET /api/assignment-config ───────────────────
// Get current assignment configuration
router.get('/', requireAuth, requirePermission('manage_assignment_rules'), async (_req: Request, res: Response) => {
    try {
        const result = await query('SELECT * FROM assignment_config LIMIT 1');
        res.json({ success: true, data: result.rows[0] || null });
    } catch (error) {
        logger.error('Get assignment config error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get config' } });
    }
});

// ─── PUT /api/assignment-config ───────────────────
// Update assignment mode + config
const configSchema = z.object({
    mode: z.enum(['round_robin', 'by_product', 'by_performance', 'manual']),
    is_active: z.boolean().optional(),
    config: z.object({
        agents: z.array(z.object({
            agent_id: z.string().uuid(),
            quota: z.number().int().min(1).max(1000).optional().default(10),
        })).optional(),
    }).optional().default({}),
});

router.put('/', requireAuth, requirePermission('manage_assignment_rules'), validateBody(configSchema), async (req: Request, res: Response) => {
    try {
        const { mode, is_active, config } = req.body;
        
        const result = await query(
            `UPDATE assignment_config 
             SET mode = $1, 
                 is_active = COALESCE($2, is_active),
                 config = $3, 
                 state = '{"current_index": 0, "current_count": 0}',
                 updated_at = NOW()
             RETURNING *`,
            [mode, is_active ?? null, JSON.stringify(config)]
        );

        if (result.rows.length === 0) {
            // Create if not exists
            const ins = await query(
                `INSERT INTO assignment_config (mode, is_active, config, state)
                 VALUES ($1, COALESCE($2, true), $3, '{"current_index": 0, "current_count": 0}')
                 RETURNING *`,
                [mode, is_active ?? null, JSON.stringify(config)]
            );
            return void res.json({ success: true, data: ins.rows[0] });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update assignment config error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update config' } });
    }
});

// ─── PUT /api/assignment-config/toggle ────────────
router.put('/toggle', requireAuth, requirePermission('manage_assignment_rules'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE assignment_config SET is_active = NOT is_active, updated_at = NOW() RETURNING *`
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Toggle assignment config error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle' } });
    }
});

// ─── GET /api/assignment-config/agents ────────────
// List available agents with their performance stats
router.get('/agents', requireAuth, requirePermission('manage_assignment_rules'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT u.id, u.full_name, u.email, u.is_available, r.name as role_name,
                    COUNT(o.id) FILTER (WHERE o.confirmation_status = 'confirmed') as confirmed_count,
                    COUNT(o.id) FILTER (WHERE o.confirmation_status IN ('confirmed','cancelled','unreachable','fake')) as total_processed,
                    COUNT(o.id) FILTER (WHERE o.confirmation_status = 'pending') as pending_count,
                    ROUND(
                        COUNT(o.id) FILTER (WHERE o.confirmation_status = 'confirmed')::numeric /
                        NULLIF(COUNT(o.id) FILTER (WHERE o.confirmation_status IN ('confirmed','cancelled','unreachable','fake')), 0) * 100,
                    1) as confirmation_rate
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN orders o ON o.assigned_to = u.id AND o.deleted_at IS NULL
             WHERE u.status = 'active'
               AND u.deleted_at IS NULL
               AND r.name NOT IN ('Admin')
             GROUP BY u.id, r.id
             ORDER BY u.full_name ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List assignment agents error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list agents' } });
    }
});

// ─── GET /api/assignment-config/state ─────────────
// Get runtime state (current position in the queue)
router.get('/state', requireAuth, requirePermission('manage_assignment_rules'), async (_req: Request, res: Response) => {
    try {
        const result = await query('SELECT state, mode, config FROM assignment_config LIMIT 1');
        if (result.rows.length === 0) {
            return void res.json({ success: true, data: null });
        }
        const row = result.rows[0];
        
        // Enrich state: show which agent is current and how many assigned
        const state = row.state || {};
        const agents = row.config?.agents || [];
        const currentAgent = agents[state.current_index || 0];
        
        let agentName = null;
        if (currentAgent) {
            const nameResult = await query('SELECT full_name FROM users WHERE id = $1', [currentAgent.agent_id]);
            agentName = nameResult.rows[0]?.full_name || null;
        }
        
        res.json({
            success: true,
            data: {
                ...state,
                current_agent_id: currentAgent?.agent_id || null,
                current_agent_name: agentName,
                current_quota: currentAgent?.quota || 0,
            },
        });
    } catch (error) {
        logger.error('Get assignment state error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get state' } });
    }
});

// ─── Product → Agent Mappings ─────────────────────

// GET /api/assignment-config/product-mappings
router.get('/product-mappings', requireAuth, requirePermission('manage_assignment_rules'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT pam.id, pam.product_id, pam.agent_id,
                    p.name as product_name,
                    u.full_name as agent_name
             FROM product_agent_mappings pam
             JOIN products p ON p.id = pam.product_id
             JOIN users u ON u.id = pam.agent_id
             ORDER BY p.name ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List product mappings error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list mappings' } });
    }
});

const mappingSchema = z.object({
    product_id: z.string().uuid(),
    agent_id: z.string().uuid(),
});

// POST /api/assignment-config/product-mappings
router.post('/product-mappings', requireAuth, requirePermission('manage_assignment_rules'), validateBody(mappingSchema), async (req: Request, res: Response) => {
    try {
        const { product_id, agent_id } = req.body;
        const result = await query(
            `INSERT INTO product_agent_mappings (product_id, agent_id)
             VALUES ($1, $2)
             ON CONFLICT (product_id) DO UPDATE SET agent_id = $2
             RETURNING *`,
            [product_id, agent_id]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create product mapping error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create mapping' } });
    }
});

// DELETE /api/assignment-config/product-mappings/:id
router.delete('/product-mappings/:id', requireAuth, requirePermission('manage_assignment_rules'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `DELETE FROM product_agent_mappings WHERE id = $1 RETURNING id`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return void res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } });
        }
        res.json({ success: true, message: 'Mapping deleted' });
    } catch (error) {
        logger.error('Delete product mapping error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete mapping' } });
    }
});

export default router;
