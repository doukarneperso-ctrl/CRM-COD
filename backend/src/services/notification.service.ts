import { pool, query, transaction } from '../config/database';
import { emitNotification } from './socket.service';

export type NotificationType =
    | 'order_assigned'
    | 'order_status_changed'
    | 'order_youcan_imported'
    | 'stock_low'
    | 'stock_out'
    | 'callback_reminder'
    | 'commission_calculated'
    | 'commission_approved_paid'
    | 'delivery_export_failed'
    | 'merge_candidate_detected'
    | 'expense_needs_approval'
    | 'recurring_expense_due'
    | 'return_received'
    | 'system_alert';

export interface NotificationPayload {
    userId: string;
    type: NotificationType;
    title: string;
    message?: string;
    data?: Record<string, unknown>;
}

/**
 * Create an in-app notification for a user.
 * Emits real-time via Socket.IO.
 */
export async function createNotification(payload: NotificationPayload): Promise<string> {
    const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW())
     RETURNING id`,
        [
            payload.userId,
            payload.type,
            payload.title,
            payload.message || null,
            payload.data ? JSON.stringify(payload.data) : null,
        ]
    );

    const notificationId = result.rows[0].id;

    // Emit real-time notification to the user
    emitNotification(payload.userId, {
        id: notificationId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: payload.data,
        is_read: false,
        created_at: new Date().toISOString(),
    });

    return notificationId;
}

/**
 * Notify all users with a given role.
 */
export async function notifyRole(
    roleName: string,
    payload: Omit<NotificationPayload, 'userId'>
): Promise<void> {
    const usersResult = await pool.query(
        `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = $1 AND u.status = 'active' AND u.deleted_at IS NULL`,
        [roleName]
    );

    for (const user of usersResult.rows) {
        await createNotification({ ...payload, userId: user.id });
    }
}

/**
 * Notify managers and admins.
 */
export async function notifyManagers(
    payload: Omit<NotificationPayload, 'userId'>
): Promise<void> {
    await notifyRole('admin', payload);
    await notifyRole('manager', payload);
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
    const result = await pool.query(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
        [userId]
    );
    return parseInt(result.rows[0].count, 10);
}
