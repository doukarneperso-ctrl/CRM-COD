import { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory: Require specific permission(s)
 * Usage: router.get('/orders', requirePermission('view_orders'), handler)
 */
export function requirePermission(...requiredPermissions: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const userPermissions = req.session?.permissions || [];

        // Check if user has ALL required permissions
        const hasAll = requiredPermissions.every((p) => userPermissions.includes(p));

        if (!hasAll) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: `You don't have permission to perform this action`,
                    required: requiredPermissions,
                },
            });
            return;
        }

        next();
    };
}

/**
 * Middleware: Require any one of the specified permissions
 */
export function requireAnyPermission(...permissions: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const userPermissions = req.session?.permissions || [];
        const hasAny = permissions.some((p) => userPermissions.includes(p));

        if (!hasAny) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: `You don't have permission to perform this action`,
                },
            });
            return;
        }

        next();
    };
}
