import cron from 'node-cron';
import { query } from '../config/database';
import { trackOrder, detectCrmStatus } from '../services/delivery.service';
import { createCommissionForOrder } from '../services/commission.service';
import { createAuditLog } from '../services/audit.service';
import { notifyManagers } from '../services/notification.service';
import { emitDeliveryStatusUpdated } from '../services/socket.service';
import logger from '../utils/logger';

const DELAY_MS = 200;        // Delay between API calls to avoid rate limiting
const POLL_INTERVAL = '*/30 * * * * *'; // Every 30 seconds (6-field cron = seconds)

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Coliix Status Sync Worker
 * Polls Coliix API every 5 minutes for all orders with active shipments.
 * Updates courier_status (original Coliix state) and shipping_status (mapped CRM status).
 * Triggers side effects: commissions, stock restore, notifications.
 */
export function startColiixSyncWorker(): void {
    const runColiixSync = async () => {
        try {

            // Get ALL orders with tracking numbers that are not in a final state
            const ordersResult = await query(
                `SELECT id, tracking_number, shipping_status, courier_status, assigned_to, order_number
                 FROM orders
                 WHERE tracking_number IS NOT NULL
                   AND tracking_number != ''
                   AND shipping_status NOT IN ('delivered', 'returned')
                   AND deleted_at IS NULL
                 ORDER BY shipped_at ASC`
            );

            if (ordersResult.rows.length === 0) return;

            logger.info(`[COLIIX SYNC] Polling ${ordersResult.rows.length} active shipments...`);

            let updated = 0;
            let errors = 0;

            for (const order of ordersResult.rows) {
                try {
                    // Call Coliix track API
                    const result = await trackOrder(order.tracking_number);

                    if (!result.state) {
                        continue; // No state returned — skip
                    }

                    // Detect CRM status using keyword matching
                    const crmStatus = detectCrmStatus(result.state);

                    // Check if anything changed
                    const courierStatusChanged = result.state !== order.courier_status;
                    const shippingStatusChanged = crmStatus && crmStatus !== order.shipping_status;

                    if (!courierStatusChanged && !shippingStatusChanged) {
                        continue; // No change — skip
                    }

                    // Build update query
                    const updateFields: string[] = ['updated_at = NOW()'];
                    const updateParams: any[] = [];
                    let idx = 1;

                    // Always update courier_status if changed
                    if (courierStatusChanged) {
                        updateFields.push(`courier_status = $${idx}`);
                        updateParams.push(result.state);
                        idx++;
                        updateFields.push('courier_status_at = NOW()');
                    }

                    // Update shipping_status if CRM status changed
                    if (shippingStatusChanged && crmStatus) {
                        updateFields.push(`shipping_status = $${idx}`);
                        updateParams.push(crmStatus);
                        idx++;

                        if (crmStatus === 'delivered') {
                            updateFields.push('delivered_at = COALESCE(delivered_at, NOW())');
                            updateFields.push("payment_status = 'paid'");
                        }
                        if (crmStatus === 'returned') {
                            updateFields.push('returned_at = COALESCE(returned_at, NOW())');
                        }
                    }

                    // Execute update
                    updateParams.push(order.id);
                    await query(
                        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $${idx}`,
                        updateParams
                    );

                    // Log the change
                    if (shippingStatusChanged && crmStatus) {
                        await query(
                            `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
                             VALUES ($1, 'courier_status', $2, $3, NULL, $4)`,
                            [order.id, order.courier_status || '', result.state, `Coliix: ${result.state}`]
                        );

                        await createAuditLog({
                            tableName: 'orders', recordId: String(order.id), action: 'coliix_sync',
                            userId: null,
                            oldValues: { shippingStatus: order.shipping_status, courierStatus: order.courier_status },
                            newValues: { shippingStatus: crmStatus, courierStatus: result.state },
                            details: `Coliix sync: ${result.state} → ${crmStatus}`,
                        });

                        // ── Side effects ──

                        // Commission on delivery
                        if (crmStatus === 'delivered' && order.assigned_to) {
                            try {
                                await createCommissionForOrder(String(order.id), String(order.assigned_to));
                            } catch (commErr) {
                                logger.error(`[COLIIX SYNC] Commission calc failed for ${order.order_number}:`, commErr);
                            }
                        }

                        // Notify managers on return
                        if (crmStatus === 'returned') {
                            await notifyManagers({
                                type: 'order_status_changed',
                                title: '📦 Colis Retourné',
                                message: `${order.order_number} (${order.tracking_number}) returned — Coliix: ${result.state}`,
                                data: { orderId: order.id, trackingCode: order.tracking_number },
                            });
                        }
                    }

                    // Real-time push to frontend
                    emitDeliveryStatusUpdated(order.id, {
                        courierStatus: result.state,
                        shippingStatus: crmStatus || order.shipping_status,
                        trackingNumber: order.tracking_number,
                    });

                    updated++;
                    logger.info(
                        `[COLIIX SYNC] ${order.order_number} (${order.tracking_number}): ` +
                        `${result.state}${shippingStatusChanged ? ` → ${crmStatus}` : ' (courier status only)'}`
                    );
                } catch (trackErr: any) {
                    errors++;
                    // Don't log full error for expected failures (no tracking, network issues)
                    if (trackErr.response?.status === 404 || trackErr.code === 'ECONNABORTED') {
                        logger.warn(`[COLIIX SYNC] ${order.order_number}: tracking not found or timeout`);
                    } else {
                        logger.error(`[COLIIX SYNC] Error tracking ${order.order_number}:`, trackErr.message);
                    }
                }

                // Rate limit: wait between API calls
                await sleep(DELAY_MS);
            }

            if (updated > 0 || errors > 0) {
                logger.info(`[COLIIX SYNC] Done. Updated: ${updated}, Errors: ${errors}, Total: ${ordersResult.rows.length}`);
            }
        } catch (err) {
            logger.error('[COLIIX SYNC WORKER] Fatal error:', err);
        }
    };

    // Run once immediately
    runColiixSync();

    // Then schedule
    cron.schedule(POLL_INTERVAL, runColiixSync);

    logger.info('[WORKER] Coliix status sync worker started (every 30 seconds)');
}
