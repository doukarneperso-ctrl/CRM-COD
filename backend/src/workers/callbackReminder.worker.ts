import cron from 'node-cron';
import { query } from '../config/database';
import { createNotification } from '../services/notification.service';
import logger from '../utils/logger';

/**
 * Every 5 minutes: find scheduled callbacks due in the next 15 minutes
 * and notify the assigned agent.
 */
export function startCallbackReminderWorker(): void {
    cron.schedule('*/5 * * * *', async () => {
        try {
            const upcoming = await query(
                `SELECT sc.id, sc.order_id, sc.agent_id, sc.scheduled_at, sc.notes,
                        o.order_number
                 FROM scheduled_callbacks sc
                 JOIN orders o ON o.id = sc.order_id
                 WHERE sc.completed_at IS NULL
                   AND sc.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '15 minutes'`,
                []
            );

            for (const callback of upcoming.rows) {
                await createNotification({
                    userId: callback.agent_id,
                    type: 'callback_reminder',
                    title: '📞 Callback Reminder',
                    message: `Order ${callback.order_number} callback due at ${new Date(callback.scheduled_at).toLocaleTimeString()}${callback.notes ? ' — ' + callback.notes : ''}`,
                    data: { orderId: callback.order_id, callbackId: callback.id },
                });
            }

            if (upcoming.rows.length > 0) {
                logger.info(`[CALLBACK REMINDER] Sent ${upcoming.rows.length} reminder(s)`);
            }
        } catch (err) {
            logger.error('[CALLBACK REMINDER WORKER] Error:', err);
        }
    });
    logger.info('[WORKER] Callback reminder worker started (every 5 min)');
}
