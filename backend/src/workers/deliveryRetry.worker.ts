import cron from 'node-cron';
import { query } from '../config/database';
import { exportOrder } from '../services/delivery.service';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

/**
 * Every 2 minutes: retry orders stuck in delivery_export_queue with status 'failed'.
 */
export function startDeliveryRetryWorker(): void {
    cron.schedule('*/2 * * * *', async () => {
        try {
            const pendingExports = await query(
                `SELECT deq.id, deq.order_id, deq.courier_id, deq.attempts,
                        o.final_amount, o.delivery_notes,
                        c.full_name as customer_name, c.phone as customer_phone,
                        c.address as customer_address, c.city as customer_city,
                        STRING_AGG(p.name, ', ') as merchandise,
                        SUM(oi.quantity) as total_qty
                 FROM delivery_export_queue deq
                 JOIN orders o ON o.id = deq.order_id
                 JOIN customers c ON c.id = o.customer_id
                 LEFT JOIN order_items oi ON oi.order_id = o.id
                 LEFT JOIN product_variants pv ON pv.id = oi.variant_id
                 LEFT JOIN products p ON p.id = pv.product_id
                 WHERE deq.status IN ('pending', 'failed')
                   AND deq.attempts < deq.max_attempts
                   AND (deq.next_retry_at IS NULL OR deq.next_retry_at <= NOW())
                 GROUP BY deq.id, o.id, c.id
                 LIMIT 10`,
                []
            );

            for (const item of pendingExports.rows) {
                await query(
                    `UPDATE delivery_export_queue SET status = 'processing', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
                    [item.id]
                );

                try {
                    const trackingCode = await exportOrder({
                        name: item.customer_name,
                        phone: item.customer_phone,
                        merchandise: item.merchandise || 'Merchandise',
                        merchandise_qty: parseInt(item.total_qty) || 1,
                        ville: item.customer_city || '',
                        adresse: item.customer_address || '',
                        note: item.delivery_notes || '',
                        price: parseFloat(item.final_amount),
                    });

                    await query(
                        `UPDATE delivery_export_queue SET status = 'success', updated_at = NOW() WHERE id = $1`,
                        [item.id]
                    );

                    await query(
                        `UPDATE orders SET tracking_number = $1, updated_at = NOW() WHERE id = $2`,
                        [trackingCode, item.order_id]
                    );

                    await createAuditLog({
                        tableName: 'orders', recordId: String(item.order_id), action: 'delivery_export',
                        userId: null, newValues: { trackingNumber: trackingCode },
                        details: `Delivery export retry succeeded — tracking: ${trackingCode}`,
                    });
                } catch (exportErr: any) {
                    const attempts = item.attempts + 1;
                    const status = attempts >= item.max_attempts ? 'permanent_failure' : 'failed';
                    const nextRetry = new Date(Date.now() + Math.pow(2, attempts) * 60_000); // Exponential backoff

                    await query(
                        `UPDATE delivery_export_queue
                         SET status = $1, last_error = $2, next_retry_at = $3, updated_at = NOW()
                         WHERE id = $4`,
                        [status, exportErr.message || 'Unknown error', nextRetry.toISOString(), item.id]
                    );

                    logger.warn(`[DELIVERY RETRY] Export failed for order ${item.order_id}: ${exportErr.message}`);
                }
            }
        } catch (err) {
            logger.error('[DELIVERY RETRY WORKER] Error:', err);
        }
    });

    logger.info('[WORKER] Delivery retry worker started (every 2 min)');
}
