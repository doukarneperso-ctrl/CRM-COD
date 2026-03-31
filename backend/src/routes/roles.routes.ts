import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ─── Validation schemas ───────────────────────────
const createRoleSchema = z.object({
    name: z.string().min(2).max(50),
    description: z.string().max(200).optional(),
    permissionIds: z.array(z.string().uuid()).min(1),
});

const updateRoleSchema = z.object({
    name: z.string().min(2).max(50).optional(),
    description: z.string().max(200).optional(),
    permissionIds: z.array(z.string().uuid()).optional(),
});

// ─── GET /api/roles ───────────────────────────────
router.get('/', requireAuth, requirePermission('manage_roles'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT r.id, r.name, r.description, r.is_system, r.created_at,
              COALESCE(json_agg(
                json_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'module', p.module)
              ) FILTER (WHERE p.id IS NOT NULL), '[]') as permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.deleted_at IS NULL
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.name ASC`
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List roles error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list roles' },
        });
    }
});

// ─── GET /api/roles/permissions ───────────────────
router.get('/permissions', requireAuth, requirePermission('manage_roles'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            'SELECT id, slug, name, module FROM permissions ORDER BY module, name'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List permissions error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list permissions' },
        });
    }
});

// ─── POST /api/roles ──────────────────────────────
router.post('/', requireAuth, requirePermission('manage_roles'), validateBody(createRoleSchema), async (req: Request, res: Response) => {
    try {
        const { name, description, permissionIds } = req.body;

        // Create role
        const roleResult = await query(
            `INSERT INTO roles (name, description, is_system, created_at, updated_at)
       VALUES ($1, $2, false, NOW(), NOW())
       RETURNING id, name, description, is_system, created_at`,
            [name, description || null]
        );

        const role = roleResult.rows[0];

        // Assign permissions
        for (const permId of permissionIds) {
            await query(
                'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
                [role.id, permId]
            );
        }

        await createAuditLog({
            tableName: 'roles',
            recordId: role.id,
            action: 'create',
            userId: req.session.userId!,
            newValues: { name, permissionIds },
            details: `Created role ${name}`,
        });

        res.status(201).json({ success: true, data: role });
    } catch (error) {
        logger.error('Create role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to create role' },
        });
    }
});

// ─── PUT /api/roles/:id ───────────────────────────
router.put('/:id', requireAuth, requirePermission('manage_roles'), validateBody(updateRoleSchema), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, permissionIds } = req.body;

        // Check if system role
        const existing = await query('SELECT is_system, name FROM roles WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' },
            });
            return;
        }

        // Update role fields
        if (name || description !== undefined) {
            const fields: string[] = [];
            const values: any[] = [];
            let idx = 1;

            if (name) { fields.push(`name = $${idx++}`); values.push(name); }
            if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
            fields.push('updated_at = NOW()');
            values.push(id);

            await query(`UPDATE roles SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        }

        // Update permissions if provided
        if (permissionIds) {
            await query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
            for (const permId of permissionIds) {
                await query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [id, permId]);
            }
        }

        await createAuditLog({
            tableName: 'roles',
            recordId: String(id),
            action: 'update',
            userId: req.session.userId!,
            newValues: req.body,
            details: `Updated role ${existing.rows[0].name}`,
        });

        res.json({ success: true, message: 'Role updated' });
    } catch (error) {
        logger.error('Update role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to update role' },
        });
    }
});

// ─── DELETE /api/roles/:id ────────────────────────
router.delete('/:id', requireAuth, requirePermission('manage_roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await query('SELECT is_system, name FROM roles WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' },
            });
            return;
        }

        if (existing.rows[0].is_system) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Cannot delete system roles' },
            });
            return;
        }

        // Check if role is in use
        const usersWithRole = await query(
            'SELECT COUNT(*) FROM users WHERE role_id = $1 AND deleted_at IS NULL', [id]
        );
        if (parseInt(usersWithRole.rows[0].count) > 0) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Cannot delete a role that is assigned to users' },
            });
            return;
        }

        await query('UPDATE roles SET deleted_at = NOW() WHERE id = $1', [id]);
        await query('DELETE FROM role_permissions WHERE role_id = $1', [id]);

        await createAuditLog({
            tableName: 'roles',
            recordId: String(id),
            action: 'delete',
            userId: req.session.userId!,
            details: `Deleted role ${existing.rows[0].name}`,
        });

        res.json({ success: true, message: 'Role deleted' });
    } catch (error) {
        logger.error('Delete role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to delete role' },
        });
    }
});

export default router;
