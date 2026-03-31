import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import { parsePagination, paginationMeta, paginationSQL } from '../utils/pagination';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── Validation schemas ───────────────────────────
const createUserSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6),
    fullName: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    roleId: z.string().uuid(),
    commissionRules: z.array(z.object({
        ruleType: z.enum(['fixed', 'percentage_sale', 'percentage_margin']),
        rate: z.number().min(0),
        productId: z.string().uuid().optional().nullable(),
        notes: z.string().max(500).optional(),
    })).optional(),
});

const updateUserSchema = z.object({
    fullName: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    roleId: z.string().uuid().optional(),
    status: z.enum(['active', 'inactive']).optional(),
});

// ─── GET /api/users ───────────────────────────────
router.get('/', requireAuth, requirePermission('view_users'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);

        const [dataResult, countResult] = await Promise.all([
            query(
                `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status,
                u.role_id, r.name as role_name, u.created_at
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.deleted_at IS NULL
         ORDER BY u.created_at DESC
         LIMIT $1 OFFSET $2`,
                [limit, offset]
            ),
            query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
        ]);

        const total = parseInt(countResult.rows[0].count, 10);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(total, pagination),
        });
    } catch (error) {
        logger.error('List users error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list users' },
        });
    }
});

// ─── POST /api/users ──────────────────────────────
router.post('/', requireAuth, requirePermission('create_users'), validateBody(createUserSchema), async (req: Request, res: Response) => {
    try {
        const { username, password, fullName, email, phone, roleId, commissionRules } = req.body;

        // Check duplicate username
        const existing = await query(
            'SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL',
            [username]
        );
        if (existing.rows.length > 0) {
            res.status(409).json({
                success: false,
                error: { code: 'CONFLICT', message: 'Username already exists' },
            });
            return;
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        const result = await query(
            `INSERT INTO users (username, password_hash, full_name, email, phone, role_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
       RETURNING id, username, full_name, email, phone, status, role_id, created_at`,
            [username, passwordHash, fullName, email || null, phone || null, roleId]
        );

        const newUser = result.rows[0];

        // Insert commission rules if provided
        if (commissionRules && commissionRules.length > 0) {
            for (const rule of commissionRules) {
                await query(
                    `INSERT INTO commission_rules (agent_id, product_id, rule_type, rate, is_active, notes, created_by)
                     VALUES ($1, $2, $3, $4, true, $5, $6)`,
                    [newUser.id, rule.productId || null, rule.ruleType, rule.rate, rule.notes || null, req.session.userId]
                );
            }
            logger.info(`📋 Created ${commissionRules.length} commission rule(s) for ${username}`);
        }

        await createAuditLog({
            tableName: 'users',
            recordId: newUser.id,
            action: 'create',
            userId: req.session.userId!,
            newValues: { username, fullName, email, roleId, commissionRulesCount: commissionRules?.length || 0 },
            details: `Created user ${username}`,
        });

        logger.info(`✅ User ${username} created by ${req.session.username}`);

        res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        logger.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to create user' },
        });
    }
});

// ─── PUT /api/users/:id ───────────────────────────
router.put('/:id', requireAuth, requirePermission('edit_users'), validateBody(updateUserSchema), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Get current values for audit
        const current = await query(
            'SELECT full_name, email, phone, role_id, status FROM users WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );
        if (current.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
            return;
        }

        // Build dynamic update
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.fullName !== undefined) { fields.push(`full_name = $${idx++}`); values.push(updates.fullName); }
        if (updates.email !== undefined) { fields.push(`email = $${idx++}`); values.push(updates.email); }
        if (updates.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(updates.phone); }
        if (updates.roleId !== undefined) { fields.push(`role_id = $${idx++}`); values.push(updates.roleId); }
        if (updates.status !== undefined) { fields.push(`status = $${idx++}`); values.push(updates.status); }

        if (fields.length === 0) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'No fields to update' },
            });
            return;
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const result = await query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING id, username, full_name, email, phone, status, role_id`,
            values
        );

        await createAuditLog({
            tableName: 'users',
            recordId: String(id),
            action: 'update',
            userId: req.session.userId!,
            oldValues: current.rows[0],
            newValues: updates,
        });

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to update user' },
        });
    }
});

// ─── DELETE /api/users/:id ────────────────────────
router.delete('/:id', requireAuth, requirePermission('delete_users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Prevent self-delete
        if (id === req.session.userId) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'You cannot delete your own account' },
            });
            return;
        }

        const result = await query(
            `UPDATE users SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, username`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
            return;
        }

        await createAuditLog({
            tableName: 'users',
            recordId: String(id),
            action: 'delete',
            userId: req.session.userId!,
            details: `Deleted user ${result.rows[0].username}`,
        });

        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to delete user' },
        });
    }
});

// ─── POST /api/users/:id/reset-password ───────────
router.post('/:id/reset-password', requireAuth, requirePermission('edit_users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const newPassword = req.body.password || 'changeme123';

        const passwordHash = await bcrypt.hash(newPassword, 12);

        const result = await query(
            `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, username`,
            [passwordHash, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
            return;
        }

        await createAuditLog({
            tableName: 'users',
            recordId: String(id),
            action: 'update',
            userId: req.session.userId!,
            details: `Password reset for user ${result.rows[0].username}`,
        });

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to reset password' },
        });
    }
});

// ─── PUT /api/users/me/availability ───────────────
// Toggle break/available status for the current user
router.put('/me/availability', requireAuth, async (req: Request, res: Response) => {
    try {
        const { isAvailable } = req.body;
        if (typeof isAvailable !== 'boolean') {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'isAvailable (boolean) is required' },
            });
            return;
        }

        await query(
            `UPDATE users SET is_available = $1, availability_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [isAvailable, req.session.userId]
        );

        await createAuditLog({
            tableName: 'users',
            recordId: req.session.userId!,
            action: 'update',
            userId: req.session.userId!,
            details: `Availability changed to ${isAvailable ? 'Available' : 'On Break'}`,
        });

        res.json({ success: true, data: { isAvailable } });
    } catch (error) {
        logger.error('Toggle availability error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle availability' },
        });
    }
});

export default router;
