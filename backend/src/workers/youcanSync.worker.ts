import cron from 'node-cron';
import { query } from '../config/database';
import { syncRecentOrders, getValidToken, processImportedOrder } from '../services/youcan.service';
import { emitOrderCreated } from '../services/socket.service';
import logger from '../utils/logger';

/**
 * YouCan Real-Time Sync Worker
 * Every 10 seconds: poll active stores for new orders.
 * When new orders are found, emit Socket.IO events for instant frontend refresh.
 */
export function startYouCanSyncWorker(): void {
    // Poll every 10 seconds for near-real-time sync
    cron.schedule('*/10 * * * * *', async () => {
        try {
            const stores = await query(
                `SELECT id, name, field_mapping, last_sync_at
                 FROM stores
                 WHERE is_active = true AND access_token IS NOT NULL`,
                []
            );

            if (stores.rows.length === 0) return;

            for (const store of stores.rows) {
                try {
                    const accessToken = await getValidToken(store.id);
                    const fieldMapping = store.field_mapping || {};

                    // Only fetch the latest 10 orders per poll for speed
                    const result = await syncRecentOrders(store.id, accessToken, 10, fieldMapping);

                    // If new orders were imported, emit Socket.IO events for instant UI update
                    if (result.imported > 0) {
                        // Fetch the recently imported orders and process them (auto-assign + notify)
                        const recentOrders = await query(
                            `SELECT id, order_number FROM orders 
                             WHERE source = 'youcan' AND store_id = $1 
                             AND created_at > NOW() - INTERVAL '30 seconds'
                             ORDER BY created_at DESC LIMIT $2`,
                            [store.id, result.imported]
                        );

                        for (const order of recentOrders.rows) {
                            // Auto-assign + notify managers
                            await processImportedOrder(order.id, store.id);

                            // Emit Socket.IO event so frontend refreshes instantly
                            emitOrderCreated({
                                orderId: order.id,
                                orderNumber: order.order_number,
                                source: 'youcan',
                            });
                        }

                        logger.info(`[YOUCAN SYNC] ⚡ ${result.imported} new orders from "${store.name}" — real-time push sent`);
                    }

                    // Update last_sync_at
                    await query(
                        `UPDATE stores SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1`,
                        [store.id]
                    );
                } catch (storeErr: any) {
                    logger.error(`[YOUCAN SYNC] Store "${store.name}" sync failed:`, storeErr.message);
                    // Log failure (non-blocking)
                    await query(
                        `INSERT INTO sync_logs (store_id, source, event_type, status, details, created_at)
                         VALUES ($1, 'poll', 'order_sync', 'error', $2, NOW())`,
                        [store.id, JSON.stringify({ error: storeErr.message })]
                    ).catch(() => { });
                }
            }
        } catch (err) {
            logger.error('[YOUCAN SYNC WORKER] Error:', err);
        }
    });
    logger.info('[WORKER] YouCan real-time sync worker started (every 10s)');
}
