import { Router, Request, Response } from 'express';
import { query, transaction } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import logger from '../utils/logger';
import { z } from 'zod';
import { exportOrder, trackOrder, detectCrmStatus } from '../services/delivery.service';
import { createCommissionForOrder, voidPendingCommissionsForOrder } from '../services/commission.service';
import { createAuditLog } from '../services/audit.service';
import { notifyManagers } from '../services/notification.service';

const router = Router();

const courierSchema = z.object({
    name: z.string().min(1).max(100),
    apiEndpoint: z.string().url().optional().or(z.literal('')),
    apiKey: z.string().optional(),
    isActive: z.boolean().default(true),
    notes: z.string().max(500).optional(),
});

const cityFeeSchema = z.object({
    cityName: z.string().min(1),
    normalizedName: z.string().min(1),
    shippingFee: z.number().min(0),
    isActive: z.boolean().default(true),
});

async function insertColiixHistoryIfMissing(
    orderId: string,
    oldValue: string,
    newValue: string,
    note: string
) {
    await query(
        `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
         SELECT $1::uuid, 'courier_status', $2::text, $3::text, NULL::uuid, $4::text
         WHERE NOT EXISTS (
           SELECT 1 FROM status_history
           WHERE order_id = $1::uuid
             AND field = 'courier_status'
             AND new_value::text = $3::text
             AND note::text = $4::text
         )`,
        [orderId, oldValue || '', newValue || '', note || '']
    );
}

// ─── GET /api/delivery/companies ──────────────────
router.get('/companies', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT c.*, COUNT(csf.id) as city_count
             FROM couriers c
             LEFT JOIN city_shipping_fees csf ON csf.courier_id = c.id AND csf.is_active = true
             WHERE c.deleted_at IS NULL
             GROUP BY c.id
             ORDER BY c.name ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List couriers error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list couriers' } });
    }
});

// ─── POST /api/delivery/test-connection ───────────
router.post('/test-connection', requireAuth, requirePermission('manage_settings'), async (_req: Request, res: Response) => {
    try {
        // Try tracking a dummy code — if the token is valid Coliix responds with a parseable result
        const result = await trackOrder('TEST_CONNECTION_PING');
        // If we got here without error, Coliix accepted the token
        res.json({ success: true, message: 'Coliix API connection successful', state: result.state });
    } catch (error: any) {
        const msg = error?.response?.status === 401
            ? 'Invalid API token'
            : error?.message || 'Connection failed';
        logger.error('Coliix test-connection error:', error);
        res.status(400).json({ success: false, error: { code: 'CONNECTION_FAILED', message: msg } });
    }
});

// ─── POST /api/delivery/companies ─────────────────
router.post('/companies', requireAuth, requirePermission('manage_settings'), validateBody(courierSchema), async (req: Request, res: Response) => {
    try {
        const { name, apiEndpoint, apiKey, isActive, notes } = req.body;
        const result = await query(
            `INSERT INTO couriers (name, api_endpoint, api_key, is_active, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, apiEndpoint || null, apiKey || null, isActive, notes || null, req.session.userId]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create courier error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create courier' } });
    }
});

// ─── PUT /api/delivery/companies/:id ──────────────
router.put('/companies/:id', requireAuth, requirePermission('manage_settings'), validateBody(courierSchema), async (req: Request, res: Response) => {
    try {
        const { name, apiEndpoint, apiKey, isActive, notes } = req.body;
        const result = await query(
            `UPDATE couriers SET name = $1, api_endpoint = $2, api_key = $3, is_active = $4, notes = $5, updated_at = NOW()
             WHERE id = $6 AND deleted_at IS NULL RETURNING *`,
            [name, apiEndpoint || null, apiKey || null, isActive, notes || null, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Courier not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update courier error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update courier' } });
    }
});

// ─── DELETE /api/delivery/companies/:id ───────────
router.delete('/companies/:id', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE couriers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Courier not found' } });
            return;
        }
        res.json({ success: true, message: 'Courier deleted' });
    } catch (error) {
        logger.error('Delete courier error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete courier' } });
    }
});

// ═══════════════════════════════════════════════════
// STATUS MAPPINGS — per-courier external→CRM mapping
// ═══════════════════════════════════════════════════

// ─── GET /api/delivery/mappings/:courierId ────────
router.get('/mappings/:courierId', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM courier_status_mappings WHERE courier_id = $1 ORDER BY external_status ASC`,
            [req.params.courierId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List mappings error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list mappings' } });
    }
});

// ─── POST /api/delivery/mappings/:courierId ───────
// Replaces ALL mappings for a courier (bulk save)
const mappingBulkSchema = z.object({
    mappings: z.array(z.object({
        externalStatus: z.string().min(1),
        crmStatus: z.string().min(1),
    })).min(1),
});

router.post('/mappings/:courierId', requireAuth, requirePermission('manage_settings'), validateBody(mappingBulkSchema), async (req: Request, res: Response) => {
    try {
        const courierId = String(req.params.courierId);
        const { mappings } = req.body;

        await transaction(async (client) => {
            // Delete existing mappings for this courier
            await client.query('DELETE FROM courier_status_mappings WHERE courier_id = $1', [courierId]);
            // Insert new mappings
            for (const m of mappings) {
                await client.query(
                    `INSERT INTO courier_status_mappings (courier_id, external_status, crm_status) 
                     VALUES ($1, $2, $3)`,
                    [courierId, m.externalStatus, m.crmStatus]
                );
            }
        });

        const result = await query(
            `SELECT * FROM courier_status_mappings WHERE courier_id = $1 ORDER BY external_status ASC`,
            [courierId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Save mappings error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save mappings' } });
    }
});

// ─── DELETE /api/delivery/mappings/:courierId/:mappingId ──
router.delete('/mappings/:courierId/:mappingId', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        await query(
            'DELETE FROM courier_status_mappings WHERE id = $1 AND courier_id = $2',
            [req.params.mappingId, req.params.courierId]
        );
        res.json({ success: true, message: 'Mapping deleted' });
    } catch (error) {
        logger.error('Delete mapping error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete mapping' } });
    }
});


// ─── GET /api/delivery/cities/:courierId ──────────
router.get('/cities/:courierId', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM city_shipping_fees
             WHERE courier_id = $1 AND is_active = true
             ORDER BY city_name ASC`,
            [req.params.courierId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List cities error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list cities' } });
    }
});

// ─── PUT /api/delivery/cities/:courierId/:cityId ──
router.put('/cities/:courierId/:cityId', requireAuth, requirePermission('manage_settings'), validateBody(cityFeeSchema), async (req: Request, res: Response) => {
    try {
        const { cityName, normalizedName, shippingFee, isActive } = req.body;
        const result = await query(
            `UPDATE city_shipping_fees SET city_name = $1, normalized_name = $2, shipping_fee = $3, is_active = $4
             WHERE id = $5 AND courier_id = $6 RETURNING *`,
            [cityName, normalizedName, shippingFee, isActive, req.params.cityId, req.params.courierId]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'City not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update city fee error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update city fee' } });
    }
});

// ─── POST /api/delivery/cities/import ─────────────
// CSV body: [{ cityName, shippingFee }]
router.post('/cities/import', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const { courierId, cities } = req.body as { courierId: number; cities: { cityName: string; shippingFee: number }[] };

        if (!courierId || !Array.isArray(cities) || cities.length === 0) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'courierId and cities array required' } });
            return;
        }

        let inserted = 0;
        let updated = 0;

        await transaction(async (client) => {
            for (const city of cities) {
                const normalizedName = city.cityName.toLowerCase().replace(/\s+/g, '_');
                const existing = await client.query(
                    'SELECT id FROM city_shipping_fees WHERE courier_id = $1 AND normalized_name = $2',
                    [courierId, normalizedName]
                );
                if (existing.rows.length > 0) {
                    await client.query(
                        'UPDATE city_shipping_fees SET shipping_fee = $1, is_active = true WHERE id = $2',
                        [city.shippingFee, existing.rows[0].id]
                    );
                    updated++;
                } else {
                    await client.query(
                        'INSERT INTO city_shipping_fees (courier_id, city_name, normalized_name, shipping_fee) VALUES ($1, $2, $3, $4)',
                        [courierId, city.cityName, normalizedName, city.shippingFee]
                    );
                    inserted++;
                }
            }
        });

        res.json({ success: true, data: { inserted, updated, total: cities.length } });
    } catch (error) {
        logger.error('Import cities error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to import cities' } });
    }
});


// ─── POST /api/delivery/export/:orderId ──────────
// Export an order to Coliix and save the tracking code
router.post('/export/:orderId', requireAuth, requirePermission('export_to_courier'), async (req: Request, res: Response) => {
    try {
        const orderId = String(req.params.orderId);

        const orderResult = await query(
            `SELECT o.id, o.final_amount, o.delivery_notes, o.call_notes, o.city, o.tracking_number,
                    c.full_name as customer_name, c.phone as customer_phone, c.address as customer_address, c.city as customer_city,
                    STRING_AGG(
                        TRIM(
                            COALESCE(p.name, oi.product_name, 'Merchandise') ||
                            CASE
                                WHEN pv.color IS NOT NULL AND pv.size IS NOT NULL
                                    THEN ' ' || pv.color || '(' || pv.size || ')'
                                WHEN pv.color IS NOT NULL
                                    THEN ' ' || pv.color
                                WHEN pv.size IS NOT NULL
                                    THEN '(' || pv.size || ')'
                                WHEN oi.variant_info IS NOT NULL AND oi.variant_info != ''
                                    THEN ' ' || oi.variant_info
                                ELSE ''
                            END ||
                            CASE WHEN oi.quantity > 1 THEN ' x' || oi.quantity ELSE '' END
                        ),
                        ', '
                    ) as merchandise,
                    SUM(oi.quantity) as total_qty
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN product_variants pv ON pv.id = oi.variant_id
             LEFT JOIN products p ON p.id = pv.product_id
             WHERE o.id = $1 AND o.deleted_at IS NULL
             GROUP BY o.id, c.id`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const order = orderResult.rows[0];

        if (order.tracking_number) {
            res.status(409).json({ success: false, error: { code: 'ALREADY_EXPORTED', message: 'Order already exported to Coliix', trackingNumber: order.tracking_number } });
            return;
        }

        // Pre-export validation
        const missing: string[] = [];
        if (!order.customer_name) missing.push('Customer name');
        if (!order.customer_phone) missing.push('Customer phone');
        if (!order.customer_city && !order.city) missing.push('City');
        if (!order.customer_address) missing.push('Address');
        if (missing.length > 0) {
            res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: `Missing: ${missing.join(', ')}. Please update the order before exporting.`, fields: missing } });
            return;
        }

        const trackingCode = await exportOrder({
            name: order.customer_name,
            phone: order.customer_phone,
            merchandise: order.merchandise || 'Merchandise',
            merchandise_qty: parseInt(order.total_qty) || 1,
            ville: order.customer_city || order.city || '',
            adresse: order.customer_address || '',
            note: order.delivery_notes || order.call_notes || '',
            price: parseFloat(order.final_amount),
        });

        // Save tracking number and update shipping status
        await query(
            `UPDATE orders
             SET tracking_number = $1, shipping_status = 'pickup_scheduled',
                 courier_status = 'Attente De Ramassage',
                 shipped_at = COALESCE(shipped_at, NOW()), updated_at = NOW()
             WHERE id = $2`,
            [trackingCode, orderId]
        );

        await query(
            `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
             VALUES ($1, 'shipping_status', 'not_shipped', 'pickup_scheduled', $2, 'Exported to Coliix')`,
            [orderId, req.session.userId]
        );

        await createAuditLog({
            tableName: 'orders', recordId: orderId, action: 'delivery_export',
            userId: req.session.userId!, newValues: { trackingNumber: trackingCode },
            details: `Exported to Coliix — tracking: ${trackingCode}`,
        });

        res.json({ success: true, data: { trackingNumber: trackingCode } });
    } catch (error) {
        const e = error as any;
        logger.error('Coliix export error:', e);
        res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: e.message || 'Failed to export order' } });
    }
});

// ─── POST /api/delivery/mark-printed/:orderId ──────
// Mark an order's label as printed
router.post('/mark-printed/:orderId', requireAuth, async (req: Request, res: Response) => {
    try {
        const orderId = String(req.params.orderId);
        await query(
            `UPDATE orders SET label_printed_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [orderId]
        );
        res.json({ success: true, message: 'Label marked as printed' });
    } catch (error) {
        logger.error('Mark printed error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark label as printed' } });
    }
});

// ─── GET /api/delivery/track/:code ─────────────────
router.get('/track/:code', requireAuth, async (req: Request, res: Response) => {
    try {
        const trackingCode = String(req.params.code);
        const result = await trackOrder(trackingCode);
        res.json({ success: true, data: result });
    } catch (error) {
        const e = error as any;
        logger.error('Coliix track error:', e);
        res.status(500).json({ success: false, error: { code: 'TRACK_FAILED', message: e.message || 'Failed to track shipment' } });
    }
});

// ─── POST /api/delivery/sync-all ───────────────────
// Manually trigger a full Coliix status sync for all active shipments
router.post('/sync-all', requireAuth, requirePermission('manage_settings'), async (_req: Request, res: Response) => {
    try {
        const ordersResult = await query(
            `SELECT id, tracking_number, shipping_status, courier_status, assigned_to, order_number
             FROM orders
             WHERE tracking_number IS NOT NULL
               AND tracking_number != ''
               AND deleted_at IS NULL
             ORDER BY shipped_at ASC`
        );

        if (ordersResult.rows.length === 0) {
            res.json({ success: true, message: 'No active shipments to sync', updated: 0 });
            return;
        }

        let updated = 0;
        let errors = 0;

        for (const order of ordersResult.rows) {
            try {
                const result = await trackOrder(order.tracking_number);
                if (!result.state) continue;

                // Backfill detailed Coliix status timeline (deduped) including comments.
                if (Array.isArray(result.history) && result.history.length > 0) {
                    for (let i = 0; i < result.history.length; i++) {
                        const h = result.history[i];
                        if (!h?.status) continue;
                        const prev = i > 0 ? (result.history[i - 1]?.status || '') : (order.courier_status || '');
                        const historyNote = `Coliix: ${h.status}${h.time ? ` @ ${h.time}` : ''}${h.note ? ` - ${h.note}` : ''}`;
                        await insertColiixHistoryIfMissing(String(order.id), prev, h.status, historyNote);
                    }
                }

                const crmStatus = detectCrmStatus(result.state);
                const courierChanged = result.state !== order.courier_status;
                const shippingChanged = crmStatus && crmStatus !== order.shipping_status;

                if (!courierChanged && !shippingChanged) continue;

                const fields: string[] = ['updated_at = NOW()'];
                const params: any[] = [];
                let idx = 1;

                if (courierChanged) {
                    fields.push(`courier_status = $${idx}`);
                    params.push(result.state);
                    idx++;
                    fields.push('courier_status_at = NOW()');
                }
                if (shippingChanged && crmStatus) {
                    fields.push(`shipping_status = $${idx}`);
                    params.push(crmStatus);
                    idx++;
                    if (crmStatus === 'delivered') {
                        fields.push('delivered_at = COALESCE(delivered_at, NOW())');
                        fields.push("payment_status = 'paid'");
                    }
                    if (crmStatus === 'returned') {
                        fields.push('returned_at = COALESCE(returned_at, NOW())');
                    }
                }

                params.push(order.id);
                await query(`UPDATE orders SET ${fields.join(', ')} WHERE id = $${idx}`, params);

                const latestNote = `Coliix: ${result.state}${result.datereported ? ` @ ${result.datereported}` : ''}${result.note ? ` - ${result.note}` : ''}`;
                await insertColiixHistoryIfMissing(String(order.id), order.courier_status || '', result.state, latestNote);
                if (order.shipping_status === 'delivered' && crmStatus !== 'delivered') {
                    await voidPendingCommissionsForOrder(
                        String(order.id),
                        `Auto-void: sync-all corrected ${order.shipping_status} -> ${crmStatus}`
                    );
                }
                updated++;

                logger.info(`[SYNC-ALL] ${order.order_number}: ${result.state} → ${crmStatus}`);
            } catch (trackErr: any) {
                errors++;
                logger.warn(`[SYNC-ALL] Error syncing ${order.order_number}: ${trackErr.message}`);
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 300));
        }

        res.json({ success: true, message: `Sync complete`, updated, errors, total: ordersResult.rows.length });
    } catch (error) {
        logger.error('Sync-all error:', error);
        res.status(500).json({ success: false, error: { code: 'SYNC_FAILED', message: 'Failed to sync shipments' } });
    }
});

// ─── GET /webhooks/coliix ──────────────────────────
// Coliix sends GET with: code, state, datereported, note
// Registered in app.ts at /webhooks/coliix
export async function handleColiixWebhook(req: Request, res: Response): Promise<void> {
    try {
        const { code: trackingCode, state, datereported, note } = req.query as Record<string, string>;

        if (!trackingCode || !state) {
            res.status(400).send('Missing code or state');
            return;
        }

        const crmStatus = detectCrmStatus(state);
        logger.info(`[COLIIX WEBHOOK] Tracking: ${trackingCode} | Coliix: ${state} | CRM: ${crmStatus}`);

        const orderResult = await query(
            `SELECT id, shipping_status, assigned_to, courier_status FROM orders WHERE tracking_number = $1 AND deleted_at IS NULL`,
            [trackingCode]
        );

        if (orderResult.rows.length === 0) {
            logger.warn(`[COLIIX WEBHOOK] No order found for tracking: ${trackingCode}`);
            res.status(200).send('OK');
            return;
        }

        const order = orderResult.rows[0];
        const oldStatus = order.shipping_status;
        const incomingNote = typeof note === 'string' ? note.trim() : '';
        const incomingDate = typeof datereported === 'string' ? datereported.trim() : '';
        const shippingChanged = oldStatus !== crmStatus;
        const courierChanged = (order.courier_status || '') !== state;

        if (!shippingChanged && !courierChanged && !incomingNote && !incomingDate) {
            res.status(200).send('OK');
            return;
        }

        const updateFields: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let idx = 1;

        if (shippingChanged) {
            updateFields.push(`shipping_status = $${idx}`);
            params.push(crmStatus);
            idx++;
        }
        if (courierChanged) {
            updateFields.push(`courier_status = $${idx}`);
            params.push(state);
            idx++;
            updateFields.push('courier_status_at = NOW()');
        }
        if (shippingChanged && crmStatus === 'delivered') {
            updateFields.push('delivered_at = COALESCE(delivered_at, NOW())');
            updateFields.push("payment_status = 'paid'");
        }
        if (shippingChanged && crmStatus === 'returned') {
            updateFields.push('returned_at = COALESCE(returned_at, NOW())');
        }

        params.push(order.id);
        await query(`UPDATE orders SET ${updateFields.join(', ')} WHERE id = $${idx}`, params);

        if (courierChanged || incomingNote || incomingDate) {
            await insertColiixHistoryIfMissing(
                String(order.id),
                order.courier_status || oldStatus,
                state,
                `Coliix: ${state}${incomingDate ? ` @ ${incomingDate}` : ''}${incomingNote ? ` - ${incomingNote}` : ''}`
            );
        }

        await createAuditLog({
            tableName: 'orders',
            recordId: String(order.id),
            action: 'coliix_webhook',
            userId: null,
            oldValues: { shippingStatus: oldStatus },
            newValues: { shippingStatus: crmStatus },
            details: `Coliix state: ${state} -> ${crmStatus}`,
        });

        if (crmStatus === 'delivered' && order.assigned_to) {
            try {
                await createCommissionForOrder(String(order.id), String(order.assigned_to));
            } catch (commErr) {
                logger.error('[COLIIX WEBHOOK] Commission calc failed:', commErr);
            }
        }
        if (oldStatus === 'delivered' && crmStatus !== 'delivered') {
            try {
                await voidPendingCommissionsForOrder(
                    String(order.id),
                    `Auto-void: webhook corrected ${oldStatus} -> ${crmStatus}`
                );
            } catch (commErr) {
                logger.error('[COLIIX WEBHOOK] Commission void failed:', commErr);
            }
        }

        if (crmStatus === 'returned') {
            await notifyManagers({
                type: 'order_status_changed',
                title: 'Order Returned via Coliix',
                message: `Tracking ${trackingCode} returned`,
                data: { orderId: order.id, trackingCode },
            });
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('[COLIIX WEBHOOK] Error:', error);
        res.status(500).send('Error');
    }
}

export default router;
