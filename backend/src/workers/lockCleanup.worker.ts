import cron from 'node-cron';
import { query } from '../config/database';
import logger from '../utils/logger';

/**
 * Every 1 minute: expire order locks that have passed their expires_at timestamp.
 */
export function startLockCleanupWorker(): void {
    cron.schedule('* * * * *', async () => {
        try {
            const result = await query(
                `DELETE FROM order_locks WHERE expires_at < NOW() RETURNING order_id`,
                []
            );
            if (result.rows.length > 0) {
                logger.info(`[LOCK CLEANUP] Released ${result.rows.length} expired lock(s)`);
                // TODO: When Socket.IO is wired, emit order:unlocked for each expired lock
                // result.rows.forEach(row => io.to(`order:${row.order_id}`).emit('order:unlocked'));
            }
        } catch (err) {
            logger.error('[LOCK CLEANUP WORKER] Error:', err);
        }
    });
    logger.info('[WORKER] Lock cleanup worker started (every 1 min)');
}
