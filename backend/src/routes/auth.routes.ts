import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── Validation schemas ───────────────────────────
const loginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// ─── POST /api/auth/login ─────────────────────────
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        // Find user
        const result = await query(
            `SELECT u.id, u.username, u.password_hash, u.full_name, u.status,
              u.role_id, r.name as role_name, u.is_available
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1 AND u.deleted_at IS NULL`,
            [username]
        );

        if (result.rows.length === 0) {
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid username or password' },
            });
            return;
        }

        const user = result.rows[0];

        // Check if user is active
        if (user.status !== 'active') {
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Your account is deactivated. Contact admin.' },
            });
            return;
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid username or password' },
            });
            return;
        }

        // Load permissions
        const permsResult = await query(
            `SELECT p.slug FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1`,
            [user.role_id]
        );

        const permissions = permsResult.rows.map((r: any) => r.slug);

        // Save to session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.fullName = user.full_name;
        req.session.roleId = user.role_id;
        req.session.roleName = user.role_name;
        req.session.permissions = permissions;

        // Audit log
        await createAuditLog({
            tableName: 'users',
            recordId: user.id,
            action: 'login',
            userId: user.id,
            details: `User ${user.username} logged in`,
        });

        logger.info(`✅ User ${user.username} logged in`);

        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role_name,
                isAvailable: user.is_available !== false,
                permissions,
            },
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Login failed' },
        });
    }
});

// ─── POST /api/auth/logout ────────────────────────
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const username = req.session.username;

        await createAuditLog({
            tableName: 'users',
            recordId: userId,
            action: 'logout',
            userId,
            details: `User ${username} logged out`,
        });

        req.session.destroy((err) => {
            if (err) {
                logger.error('Session destroy error:', err);
                res.status(500).json({
                    success: false,
                    error: { code: 'INTERNAL_ERROR', message: 'Logout failed' },
                });
                return;
            }
            res.clearCookie('connect.sid');
            res.json({ success: true, message: 'Logged out successfully' });
        });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Logout failed' },
        });
    }
});

// ─── GET /api/auth/me ─────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT u.id, u.username, u.full_name, u.email, u.status,
              u.role_id, r.name as role_name, u.created_at, u.is_available
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            req.session.destroy(() => { });
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'User not found' },
            });
            return;
        }

        const user = result.rows[0];

        // Always reload fresh permissions from DB
        const permsResult = await query(
            `SELECT p.slug FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1`,
            [user.role_id]
        );
        const permissions = permsResult.rows.map((r: any) => r.slug);
        // Update session too
        req.session.permissions = permissions;

        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                email: user.email,
                role: user.role_name,
                roleId: user.role_id,
                isAvailable: user.is_available !== false,
                permissions,
                createdAt: user.created_at,
            },
        });
    } catch (error) {
        logger.error('Get me error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get user info' },
        });
    }
});

// ─── POST /api/auth/change-password ───────────────
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), async (req: Request, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get current hash
        const result = await query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.session.userId]
        );

        const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!isValid) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Current password is incorrect' },
            });
            return;
        }

        // Hash new password
        const newHash = await bcrypt.hash(newPassword, 12);
        await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
            newHash,
            req.session.userId,
        ]);

        await createAuditLog({
            tableName: 'users',
            recordId: req.session.userId!,
            action: 'update',
            userId: req.session.userId!,
            details: 'Password changed',
        });

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to change password' },
        });
    }
});

// ─── POST /api/auth/heartbeat ─────────────────────
// Called by frontend every 30s when user is actively working
router.post('/heartbeat', requireAuth, async (req: Request, res: Response) => {
    try {
        await query(
            'UPDATE users SET last_active_at = NOW() WHERE id = $1',
            [req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ─── GET /api/auth/online-agents ──────────────────
// Lists agents with their online status (active in last 2 minutes)
router.get('/online-agents', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT u.id, u.full_name, u.is_available, u.last_active_at,
                    r.name as role_name,
                    CASE WHEN u.last_active_at > NOW() - INTERVAL '2 minutes' THEN true ELSE false END as is_online
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.status = 'active'
               AND u.deleted_at IS NULL
               AND r.name NOT IN ('Admin')
             ORDER BY u.last_active_at DESC NULLS LAST`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Online agents error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get agents' } });
    }
});

// ─── POST /api/auth/reassign-order ────────────────
// Reassign an order from one agent to another
router.post('/reassign-order', requireAuth, async (req: Request, res: Response) => {
    try {
        const { orderId, agentId } = req.body;
        if (!orderId) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'orderId required' } });
            return;
        }

        // If agentId is null/empty, we unassign
        if (!agentId) {
            await query(
                `UPDATE order_assignments SET is_active = false, unassigned_at = NOW()
                 WHERE order_id = $1 AND is_active = true`,
                [orderId]
            );
            await query(
                `UPDATE orders SET assigned_to = NULL, updated_at = NOW() WHERE id = $1`,
                [orderId]
            );
            res.json({ success: true, message: 'Order unassigned' });
            return;
        }

        // Deactivate old assignment
        await query(
            `UPDATE order_assignments SET is_active = false, unassigned_at = NOW()
             WHERE order_id = $1 AND is_active = true`,
            [orderId]
        );

        // Create new assignment
        await query(
            `INSERT INTO order_assignments (order_id, agent_id, assigned_by, assigned_at, is_active)
             VALUES ($1, $2, $3, NOW(), true)`,
            [orderId, agentId, req.session.userId]
        );

        await query(
            `UPDATE orders SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
            [agentId, orderId]
        );

        // Get agent name for logging
        const agentResult = await query('SELECT full_name FROM users WHERE id = $1', [agentId]);
        const agentName = agentResult.rows[0]?.full_name || 'Unknown';

        await createAuditLog({
            tableName: 'orders', recordId: orderId, action: 'update',
            userId: req.session.userId!,
            details: `Order reassigned to ${agentName}`,
        });

        res.json({ success: true, message: `Order reassigned to ${agentName}` });
    } catch (error) {
        logger.error('Reassign order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reassign' } });
    }
});

export default router;
