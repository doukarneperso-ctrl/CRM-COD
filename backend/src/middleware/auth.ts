import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import logger from '../utils/logger';

// Extend Express session to include user data
declare module 'express-session' {
    interface SessionData {
        userId: string;
        username: string;
        fullName: string;
        roleId: string;
        roleName: string;
        permissions: string[];
        youcanOAuthState?: string; // CSRF protection for YouCan OAuth flow
    }
}

/**
 * Middleware: Require authenticated session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.session?.userId) {
        res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Please log in to continue' },
        });
        return;
    }
    next();
}

/**
 * Middleware: Load user permissions from DB and attach to session
 */
export async function loadPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.session?.userId) {
            next();
            return;
        }

        // Always load fresh permissions from DB (so role changes take effect immediately)
        const result = await query(
            `SELECT p.slug 
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN users u ON u.role_id = rp.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
            [req.session.userId]
        );

        req.session.permissions = result.rows.map((r: any) => r.slug);
        next();
    } catch (error) {
        logger.error('Failed to load permissions:', error);
        next(error);
    }
}
