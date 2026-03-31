import { query } from '../config/database';

/**
 * Create an audit log entry for any change in the system
 */
export async function createAuditLog(params: {
    tableName: string;
    recordId: string;
    action: 'create' | 'update' | 'delete' | 'status_change' | 'assign' | 'merge'
    | 'login' | 'logout' | 'delivery_export' | 'coliix_webhook' | 'coliix_sync' | 'stock_deduct'
    | 'stock_restore' | 'commission_calc' | 'youcan_import';
    userId: string | null;
    oldValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
    details?: string;
}): Promise<void> {
    await query(
        `INSERT INTO audit_logs (table_name, record_id, action, user_id, old_values, new_values, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
            params.tableName,
            params.recordId,
            params.action,
            params.userId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            params.newValues ? JSON.stringify(params.newValues) : null,
            params.details || null,
        ]
    );
}
