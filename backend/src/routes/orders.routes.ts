import { Router, Request, Response } from 'express';
import { query, transaction } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import { createAuditLog } from '../services/audit.service';
import { emitOrderCreated, emitOrderUpdate, emitOrderStatusChanged } from '../services/socket.service';
import { parsePagination, paginationMeta, paginationSQL } from '../utils/pagination';
import { normalizePhone } from '../utils/phone';
import logger from '../utils/logger';
import { z } from 'zod';
import { deductStock, restoreStock, checkStockAvailability } from '../services/stock.service';
import { isValidConfirmationTransition, isValidShippingTransition, handleUnreachable, getOrderItems } from '../services/order.service';
import { createCommissionForOrder } from '../services/commission.service';
import { manualAssign } from '../services/assignment.service';
import { createNotification, notifyManagers } from '../services/notification.service';

const router = Router();

// ─── Schemas ──────────────────────────────────────
const createOrderSchema = z.object({
    customerName: z.string().min(1),
    customerPhone: z.string().min(5),
    customerAddress: z.string().optional(),
    customerCity: z.string().optional(),
    items: z.array(z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0),
    })).min(1),
    shippingCost: z.number().min(0).default(0),
    discount: z.number().min(0).default(0),
    note: z.string().optional(),
    source: z.string().default('manual'),
});

const updateStatusSchema = z.object({
    status: z.string().min(1),
    note: z.string().optional(),
});

// Generate sequential order number
async function nextOrderNumber(): Promise<string> {
    const result = await query(
        `UPDATE system_settings SET value = to_jsonb((value::text)::int + 1) WHERE key = 'order_number_counter' RETURNING value`
    );
    const counter = result.rows[0]?.value || 1000;
    const prefixResult = await query(`SELECT value FROM system_settings WHERE key = 'order_number_prefix'`);
    const prefix = String(prefixResult.rows[0]?.value || 'ORD').replace(/"/g, '');
    return `${prefix}-${counter}`;
}

// ─── GET /api/orders ──────────────────────────────
router.get('/', requireAuth, requirePermission('view_orders'), async (req: Request, res: Response) => {
    try {
        const pagination = parsePagination(req.query as any);
        const { limit, offset } = paginationSQL(pagination);
        const search = req.query.search as string || '';
        const confirmationStatus = req.query.confirmationStatus as string || '';
        const shippingStatus = req.query.shippingStatus as string || '';
        const assignedTo = req.query.assignedTo as string || '';
        const dateFrom = req.query.dateFrom as string || '';
        const dateTo = req.query.dateTo as string || '';
        const city = req.query.city as string || '';

        let whereClause = 'WHERE o.deleted_at IS NULL';
        const params: any[] = [];
        let idx = 1;

        // Agent visibility: if user lacks view_all_orders, show only their assigned orders
        const permissions: string[] = req.session.permissions || [];
        if (!permissions.includes('view_all_orders')) {
            whereClause += ` AND o.assigned_to = $${idx}`;
            params.push(req.session.userId);
            idx++;
        }

        if (search) {
            whereClause += ` AND (o.order_number ILIKE $${idx} OR c.full_name ILIKE $${idx} OR c.phone ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }
        if (confirmationStatus) {
            whereClause += ` AND o.confirmation_status = $${idx}`;
            params.push(confirmationStatus);
            idx++;
        }
        if (shippingStatus) {
            whereClause += ` AND o.shipping_status = $${idx}`;
            params.push(shippingStatus);
            idx++;
        }
        if (assignedTo) {
            whereClause += ` AND o.assigned_to = $${idx}`;
            params.push(assignedTo);
            idx++;
        }
        if (dateFrom) {
            whereClause += ` AND o.created_at >= $${idx}`;
            params.push(dateFrom);
            idx++;
        }
        if (dateTo) {
            whereClause += ` AND o.created_at <= $${idx}`;
            params.push(dateTo + ' 23:59:59');
            idx++;
        }
        if (city) {
            whereClause += ` AND c.city ILIKE $${idx}`;
            params.push(`%${city}%`);
            idx++;
        }

        const [dataResult, countResult] = await Promise.all([
            query(
                `SELECT o.id, o.order_number, o.confirmation_status, o.shipping_status, o.payment_status,
                o.total_amount, o.shipping_cost, o.discount, o.final_amount, o.source,
                o.note, o.delivery_notes, o.call_attempts, o.tracking_number, o.label_printed_at, o.created_at, o.confirmed_at, o.shipped_at,
                o.courier_status, o.courier_status_at,
                c.id as customer_id, c.full_name as customer_name, c.phone as customer_phone, c.city as customer_city, c.address as customer_address,
                u.full_name as assigned_to_name, u.id as assigned_to_id,
                cu.full_name as confirmed_by_name,
                COALESCE(json_agg(
                  json_build_object(
                    'id', oi.id, 'productName', COALESCE(p.name, oi.product_name, 'Unknown Product'), 'variantId', oi.variant_id,
                    'variantInfo', COALESCE(oi.variant_info, CONCAT_WS(' / ', pv.size, pv.color)),
                    'size', pv.size, 'color', pv.color, 'stock', pv.stock, 'quantity', oi.quantity,
                    'unitPrice', oi.unit_price, 'totalPrice', oi.total
                  ) ORDER BY oi.created_at
                ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = o.assigned_to
         LEFT JOIN users cu ON cu.id = o.confirmed_by
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         LEFT JOIN products p ON p.id = pv.product_id
         ${whereClause}
         GROUP BY o.id, c.id, u.id, u.full_name, cu.id, cu.full_name
         ORDER BY o.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            ),
            query(`SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ${whereClause}`, params),
        ]);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: paginationMeta(parseInt(countResult.rows[0].count), pagination),
        });
    } catch (error: any) {
        logger.error('List orders error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list orders' } });
    }
});

// ─── GET /api/orders/:id ──────────────────────────
router.get('/:id', requireAuth, requirePermission('view_orders'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT o.*,
              c.full_name as customer_name, c.phone as customer_phone, c.address as customer_address, c.city as customer_city,
              u.full_name as assigned_to_name,
              cu.full_name as confirmed_by_name,
              COALESCE(json_agg(
                json_build_object(
                  'id', oi.id, 'productName', COALESCE(p.name, oi.product_name, 'Unknown Product'), 'variantId', oi.variant_id,
                  'variantInfo', COALESCE(oi.variant_info, CONCAT_WS(' / ', pv.size, pv.color)),
                  'size', pv.size, 'color', pv.color, 'sku', pv.sku, 'stock', pv.stock,
                  'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'totalPrice', oi.total
                ) ORDER BY oi.created_at
              ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_to
       LEFT JOIN users cu ON cu.id = o.confirmed_by
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.id = $1 AND o.deleted_at IS NULL
       GROUP BY o.id, c.id, u.id, u.full_name, cu.id, cu.full_name`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        // Get status history
        const history = await query(
            `SELECT sh.*, u.full_name as changed_by_name
       FROM status_history sh
       LEFT JOIN users u ON u.id = sh.changed_by
       WHERE sh.order_id = $1
       ORDER BY sh.created_at DESC`,
            [req.params.id]
        );

        // Get edit history
        const editHistory = await query(
            `SELECT al.*, u.full_name as changed_by_name
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             WHERE al.table_name = 'orders' AND al.record_id = $1 AND al.action = 'update'
             ORDER BY al.created_at DESC`,
            [req.params.id]
        );

        // Get assignment history
        const assignmentHistory = await query(
            `SELECT oa.*, u_agent.full_name as assigned_to_name, u_admin.full_name as assigned_by_name
             FROM order_assignments oa
             LEFT JOIN users u_agent ON u_agent.id = oa.agent_id
             LEFT JOIN users u_admin ON u_admin.id = oa.assigned_by
             WHERE oa.order_id = $1
             ORDER BY oa.assigned_at DESC`,
            [req.params.id]
        );

        // Get customer order history (all orders by the same customer)
        const customerOrders = await query(
            `SELECT o.id, o.order_number, o.confirmation_status, o.shipping_status,
                    o.final_amount, o.created_at
             FROM orders o
             WHERE o.customer_id = $1 AND o.deleted_at IS NULL
             ORDER BY o.created_at DESC`,
            [result.rows[0].customer_id]
        );

        res.json({
            success: true,
            data: {
                ...result.rows[0],
                statusHistory: history.rows,
                editHistory: editHistory.rows,
                assignmentHistory: assignmentHistory.rows,
                customerOrders: customerOrders.rows,
            },
        });
    } catch (error) {
        logger.error('Get order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get order' } });
    }
});

// ─── POST /api/orders ─────────────────────────────
router.post('/', requireAuth, requirePermission('create_orders'), validateBody(createOrderSchema), async (req: Request, res: Response) => {
    try {
        const { customerName, customerPhone, customerAddress, customerCity, items, shippingCost, discount, note, deliveryNotes, source } = req.body;
        const phoneNorm = normalizePhone(customerPhone);

        const order = await transaction(async (client) => {
            // Find or create customer
            let customerResult = await client.query(
                'SELECT id FROM customers WHERE phone_norm = $1 AND deleted_at IS NULL',
                [phoneNorm]
            );

            let customerId;
            if (customerResult.rows.length > 0) {
                customerId = customerResult.rows[0].id;
                // Update name and address if changed
                await client.query(
                    'UPDATE customers SET full_name = $1, address = COALESCE($2, address), city = COALESCE($3, city), total_orders = total_orders + 1, updated_at = NOW() WHERE id = $4',
                    [customerName, customerAddress || null, customerCity || null, customerId]
                );
            } else {
                const newCustomer = await client.query(
                    'INSERT INTO customers (full_name, phone, phone_norm, address, city, total_orders) VALUES ($1, $2, $3, $4, $5, 1) RETURNING id',
                    [customerName, customerPhone, phoneNorm, customerAddress || null, customerCity || null]
                );
                customerId = newCustomer.rows[0].id;
            }

            // Get order number
            const orderNumber = await nextOrderNumber();

            // Compute totals
            let totalAmount = 0;
            for (const item of items) {
                totalAmount += item.unitPrice * item.quantity;
            }
            const finalAmount = totalAmount + shippingCost - discount;

            // Create order
            const orderResult = await client.query(
                `INSERT INTO orders (order_number, customer_id, total_amount, shipping_cost, discount, final_amount,
                             confirmation_status, shipping_status, payment_status, source, note, delivery_notes, assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'not_shipped', 'unpaid', $7, $8, $9, $10, $10)
         RETURNING *`,
                [orderNumber, customerId, totalAmount, shippingCost, discount, finalAmount, source, note || null, deliveryNotes || null, req.session.userId]
            );
            const order = orderResult.rows[0];

            // Create order items + deduct stock
            for (const item of items) {
                await client.query(
                    `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total)
           VALUES ($1, $2, $3, $4, $5)`,
                    [order.id, item.variantId, item.quantity, item.unitPrice, item.unitPrice * item.quantity]
                );

                // Deduct stock
                await client.query(
                    'UPDATE product_variants SET stock = GREATEST(stock - $1, 0), updated_at = NOW() WHERE id = $2',
                    [item.quantity, item.variantId]
                );
            }

            // Log initial status
            await client.query(
                `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
         VALUES ($1, 'confirmation_status', NULL, 'pending', $2, 'Order created')`,
                [order.id, req.session.userId]
            );

            return order;
        });

        await createAuditLog({
            tableName: 'orders', recordId: order.id, action: 'create',
            userId: req.session.userId!, newValues: { orderNumber: order.order_number, items: items.length },
            details: `Created order ${order.order_number}`,
        });

        // Real-time notification
        emitOrderCreated({ orderId: order.id, orderNumber: order.order_number });

        res.status(201).json({ success: true, data: order });
    } catch (error) {
        const e = error as any;
        logger.error('Create order error:', { message: e.message, detail: e.detail, code: e.code, constraint: e.constraint });
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message || 'Failed to create order', detail: e.detail } });
    }
});

// ─── PUT /api/orders/:id (general edit) ───────────
router.put('/:id', requireAuth, requirePermission('create_orders'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { customerName, customerPhone, customerCity, customerAddress, note, deliveryNotes, source, shippingCost, discount, items } = req.body;

        // Check order exists
        const existingResult = await query(
            `SELECT o.*, c.full_name as customer_name, c.phone as customer_phone, c.city as customer_city, c.address as customer_address
             FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
             WHERE o.id = $1 AND o.deleted_at IS NULL`,
            [id]
        );
        if (existingResult.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const existing = existingResult.rows[0];
        const customerId = existing.customer_id;

        // Fetch existing items for audit
        const existingItemsResult = await query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id]);

        const oldValues: any = {};
        const newValues: any = {};

        if (customerName !== undefined && customerName !== existing.customer_name) {
            oldValues.customerName = existing.customer_name;
            newValues.customerName = customerName;
        }
        if (customerPhone !== undefined && customerPhone !== existing.customer_phone) {
            oldValues.customerPhone = existing.customer_phone;
            newValues.customerPhone = customerPhone;
        }
        if (customerCity !== undefined && customerCity !== existing.customer_city) {
            oldValues.customerCity = existing.customer_city;
            newValues.customerCity = customerCity;
        }
        if (customerAddress !== undefined && customerAddress !== existing.customer_address) {
            oldValues.customerAddress = existing.customer_address;
            newValues.customerAddress = customerAddress;
        }
        if (note !== undefined && note !== existing.note) {
            oldValues.note = existing.note;
            newValues.note = note;
        }
        if (deliveryNotes !== undefined && deliveryNotes !== existing.delivery_notes) {
            oldValues.deliveryNotes = existing.delivery_notes;
            newValues.deliveryNotes = deliveryNotes;
        }
        if (source !== undefined && source !== existing.source) {
            oldValues.source = existing.source;
            newValues.source = source;
        }
        if (shippingCost !== undefined && Number(shippingCost) !== Number(existing.shipping_cost)) {
            oldValues.shippingCost = Number(existing.shipping_cost);
            newValues.shippingCost = Number(shippingCost);
        }
        if (discount !== undefined && Number(discount) !== Number(existing.discount)) {
            oldValues.discount = Number(existing.discount);
            newValues.discount = Number(discount);
        }

        // Update customer info if provided
        if (customerName || customerPhone || customerCity || customerAddress) {
            const custFields: string[] = [];
            const custParams: any[] = [];
            let ci = 1;
            if (customerName) { custFields.push(`full_name = $${ci}`); custParams.push(customerName); ci++; }
            if (customerPhone) { custFields.push(`phone = $${ci}`); custParams.push(customerPhone); ci++; }
            if (customerCity !== undefined) { custFields.push(`city = $${ci}`); custParams.push(customerCity || null); ci++; }
            if (customerAddress !== undefined) { custFields.push(`address = $${ci}`); custParams.push(customerAddress || null); ci++; }
            if (custFields.length > 0) {
                custParams.push(customerId);
                await query(`UPDATE customers SET ${custFields.join(', ')} WHERE id = $${ci}`, custParams);
            }
        }

        // Update order items if provided
        let newTotalAmount: number | null = null;
        if (items && Array.isArray(items) && items.length > 0) {
            // Compare items for audit log
            const oldItemsStr = existingItemsResult.rows.map((i: any) => `${i.product_name} (${i.variant_info || 'No variant'}) x${i.quantity}`).join(', ');
            const newItemsStr = items.map((i: any) => `${i.productName} (${i.variantInfo || 'No variant'}) x${i.quantity || 1}`).join(', ');

            if (oldItemsStr !== newItemsStr) {
                oldValues.items = oldItemsStr;
                newValues.items = newItemsStr;
            }

            // Delete existing items
            await query('DELETE FROM order_items WHERE order_id = $1', [id]);

            // Insert new items
            let totalAmount = 0;
            for (const item of items) {
                const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
                totalAmount += itemTotal;
                await query(
                    `INSERT INTO order_items (order_id, variant_id, product_name, variant_info, quantity, unit_price, total, total_price)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
                    [id, item.variantId || null, item.productName || '', item.variantInfo || '', item.quantity || 1, item.unitPrice || 0, itemTotal]
                );
            }
            newTotalAmount = totalAmount;
        }

        // Update order fields
        const fields: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let idx = 1;
        if (note !== undefined) { fields.push(`note = $${idx}`); params.push(note || null); idx++; }
        if (deliveryNotes !== undefined) { fields.push(`delivery_notes = $${idx}`); params.push(deliveryNotes || null); idx++; }
        if (source) { fields.push(`source = $${idx}`); params.push(source); idx++; }
        if (shippingCost !== undefined) { fields.push(`shipping_cost = $${idx}`); params.push(shippingCost); idx++; }
        if (discount !== undefined) { fields.push(`discount = $${idx}`); params.push(discount); idx++; }
        if (newTotalAmount !== null) { fields.push(`total_amount = $${idx}`); params.push(newTotalAmount); idx++; }

        params.push(id);
        await query(`UPDATE orders SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL`, params);

        // Recalculate final_amount
        if (shippingCost !== undefined || discount !== undefined || newTotalAmount !== null) {
            await query(
                `UPDATE orders SET final_amount = total_amount + shipping_cost - discount WHERE id = $1`,
                [id]
            );
        }

        // Add to audit logs if there are changes
        if (Object.keys(newValues).length > 0) {
            await createAuditLog({
                tableName: 'orders', recordId: id as string, action: 'update',
                userId: req.session.userId!, oldValues, newValues,
                details: `Order updated`,
            });
        }

        res.json({ success: true, message: 'Order updated' });
    } catch (error) {
        logger.error('Update order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update order' } });
    }
});

// ─── PUT /api/orders/:id/confirmation-status ──────
router.put('/:id/confirmation-status', requireAuth, requirePermission('update_order_status'), validateBody(updateStatusSchema), async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const { status, note } = req.body;

        const current = await query(
            `SELECT o.confirmation_status, o.assigned_to, c.id as customer_id
             FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
             WHERE o.id = $1 AND o.deleted_at IS NULL`,
            [id]
        );
        if (current.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const oldStatus = current.rows[0].confirmation_status;
        const agentId = current.rows[0].assigned_to;

        // ── Transition validation ──
        if (!isValidConfirmationTransition(oldStatus, status)) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_TRANSITION', message: `Cannot change confirmation from '${oldStatus}' to '${status}'` }
            });
            return;
        }

        // ── Handle unreachable: auto-promote to fake at 5 attempts ──
        if (status === 'unreachable') {
            const { count, autoFaked } = await handleUnreachable(id);
            if (autoFaked) {
                await query(
                    `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
                     VALUES ($1, 'confirmation_status', $2, 'fake', $3, 'Auto-promoted to fake after 5 unreachable attempts')`,
                    [id, oldStatus, req.session.userId]
                );
                res.json({ success: true, message: 'Order auto-marked as fake after 5 unreachable attempts', autoFaked: true, count });
                return;
            }
        }

        // ── Stock operations ──
        if (status === 'confirmed') {
            // Check and deduct stock for all items
            const items = await getOrderItems(id);
            const stockIssues = await checkStockAvailability(
                items.map(i => ({ variantId: i.variantId, qty: i.qty }))
            );
            if (stockIssues.length > 0) {
                // Mark as out_of_stock instead
                await query(
                    `UPDATE orders SET confirmation_status = 'out_of_stock', updated_at = NOW() WHERE id = $1`,
                    [id]
                );
                await query(
                    `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
                     VALUES ($1, 'confirmation_status', $2, 'out_of_stock', $3, 'Insufficient stock')`,
                    [id, oldStatus, req.session.userId]
                );
                res.status(409).json({
                    success: false,
                    error: { code: 'OUT_OF_STOCK', message: 'Insufficient stock — order marked out_of_stock' },
                    stockIssues
                });
                return;
            }
            // Deduct atomically
            for (const item of items) {
                await deductStock(item.variantId, item.qty, id, 'order_confirmed', req.session.userId);
            }
        }

        if (status === 'cancelled' && oldStatus === 'confirmed') {
            // Restore stock for confirmed-then-cancelled orders
            const items = await getOrderItems(id);
            for (const item of items) {
                await restoreStock(item.variantId, item.qty, id, 'order_cancelled', req.session.userId);
            }
        }

        // ── Update order ──
        await query(
            `UPDATE orders SET
               confirmation_status = $1,
               confirmed_at = ${status === 'confirmed' ? 'NOW()' : 'confirmed_at'},
               confirmed_by = ${status === 'confirmed' ? `'${req.session.userId}'` : 'confirmed_by'},
               unreachable_count = ${status === 'unreachable' ? 'unreachable_count + 1' : 'unreachable_count'},
               updated_at = NOW()
             WHERE id = $2`,
            [status, id]
        );

        await query(
            `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
             VALUES ($1, 'confirmation_status', $2, $3, $4, $5)`,
            [id, oldStatus, status, req.session.userId, note || null]
        );

        await createAuditLog({
            tableName: 'orders', recordId: id as string, action: 'status_change',
            userId: req.session.userId!, oldValues: { status: oldStatus }, newValues: { status },
            details: `Confirmation: ${oldStatus} → ${status}`,
        });

        // ── Notifications ──
        if (status === 'confirmed') {
            if (agentId) {
                await createNotification({
                    userId: agentId, type: 'order_status_changed', title: 'Order Confirmed',
                    message: `Order confirmed successfully`, data: { orderId: id }
                });
            }
            await notifyManagers({
                type: 'order_status_changed', title: '✅ Order Confirmed',
                message: `An order has been confirmed`, data: { orderId: id }
            });
        }
        if (status === 'cancelled') {
            await notifyManagers({
                type: 'order_status_changed', title: '❌ Order Cancelled',
                message: `An order has been cancelled`, data: { orderId: id }
            });
        }

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        logger.error('Update confirmation status error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update status' } });
    }
});

// ─── POST /api/orders/merge ───────────────────────
// Merge secondary orders into a primary order
router.post('/merge', requireAuth, requirePermission('merge_orders'), async (req: Request, res: Response) => {
    try {
        const { primaryOrderId, secondaryOrderIds } = req.body;
        if (!primaryOrderId || !secondaryOrderIds?.length) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'primaryOrderId and secondaryOrderIds required' } });
            return;
        }

        await transaction(async (client) => {
            // Validate primary order exists and is pending
            const primaryResult = await client.query(
                `SELECT id, order_number, confirmation_status, total_amount, final_amount, discount, shipping_cost
                 FROM orders WHERE id = $1 AND deleted_at IS NULL`,
                [primaryOrderId]
            );
            if (primaryResult.rows.length === 0) {
                throw new Error('Primary order not found');
            }
            const primary = primaryResult.rows[0];
            if (primary.confirmation_status !== 'pending') {
                throw new Error('Primary order must be pending');
            }

            let addedItemsTotal = 0;

            for (const secId of secondaryOrderIds) {
                // Validate secondary order
                const secResult = await client.query(
                    `SELECT id, order_number, confirmation_status
                     FROM orders WHERE id = $1 AND deleted_at IS NULL`,
                    [secId]
                );
                if (secResult.rows.length === 0) continue;
                const sec = secResult.rows[0];
                if (sec.confirmation_status !== 'pending') continue;

                // Copy items from secondary → primary
                const itemsResult = await client.query(
                    `SELECT variant_id, product_name, variant_info, quantity, unit_price, unit_cost
                     FROM order_items WHERE order_id = $1`,
                    [secId]
                );
                for (const item of itemsResult.rows) {
                    const itemTotal = (item.unit_price || 0) * (item.quantity || 1);
                    addedItemsTotal += itemTotal;
                    await client.query(
                        `INSERT INTO order_items (order_id, variant_id, product_name, variant_info, quantity, unit_price, unit_cost, total, total_price, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())`,
                        [primaryOrderId, item.variant_id, item.product_name, item.variant_info, item.quantity, item.unit_price, item.unit_cost || 0, itemTotal]
                    );
                }

                // Mark secondary as merged_into
                await client.query(
                    `UPDATE orders SET
                        confirmation_status = 'merged_into',
                        merged_into_order_id = $1,
                        updated_at = NOW()
                     WHERE id = $2`,
                    [primaryOrderId, secId]
                );

                // Status history for secondary
                await client.query(
                    `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
                     VALUES ($1, 'confirmation_status', 'pending', 'merged_into', $2, $3)`,
                    [secId, req.session.userId, `Merged into ${primary.order_number}`]
                );

                // Audit log for secondary
                await createAuditLog({
                    tableName: 'orders', recordId: secId, action: 'merge',
                    userId: req.session.userId!, oldValues: { status: 'pending' },
                    newValues: { status: 'merged_into', merged_into: primary.order_number },
                    details: `${sec.order_number} merged into ${primary.order_number}`,
                });
            }

            // Recalculate primary total
            const newTotal = parseFloat(primary.total_amount || 0) + addedItemsTotal;
            const discount = parseFloat(primary.discount || 0);
            const shippingCost = parseFloat(primary.shipping_cost || 0);
            const newFinal = newTotal - discount + shippingCost;

            await client.query(
                `UPDATE orders SET total_amount = $1, final_amount = $2, updated_at = NOW() WHERE id = $3`,
                [newTotal, newFinal, primaryOrderId]
            );

            // Audit log for primary
            await createAuditLog({
                tableName: 'orders', recordId: primaryOrderId, action: 'merge',
                userId: req.session.userId!, oldValues: { total_amount: primary.total_amount },
                newValues: { total_amount: newTotal, merged_from: secondaryOrderIds },
                details: `Merged ${secondaryOrderIds.length} order(s) into ${primary.order_number}`,
            });
        });

        res.json({ success: true, message: 'Orders merged successfully' });
    } catch (error: any) {
        logger.error('Order merge error:', error);
        res.status(500).json({ success: false, error: { code: 'MERGE_FAILED', message: error.message || 'Failed to merge orders' } });
    }
});

// ─── PUT /api/orders/:id/shipping-status ──────────
router.put('/:id/shipping-status', requireAuth, requirePermission('update_order_status'), validateBody(updateStatusSchema), async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const { status, note } = req.body;

        const current = await query(
            'SELECT shipping_status, assigned_to FROM orders WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );
        if (current.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const oldStatus = current.rows[0].shipping_status;
        const agentId = current.rows[0].assigned_to;

        // ── Transition validation ──
        if (!isValidShippingTransition(oldStatus, status)) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_TRANSITION', message: `Cannot change shipping from '${oldStatus}' to '${status}'` }
            });
            return;
        }

        const updateFields: string[] = ['shipping_status = $1', 'updated_at = NOW()'];
        const updateParams: any[] = [status, id];

        if (status === 'in_transit' || status === 'pickup_scheduled') {
            updateFields.push('shipped_at = COALESCE(shipped_at, NOW())');
        }
        if (status === 'delivered') {
            updateFields.push('delivered_at = NOW()');
            updateFields.push("payment_status = 'paid'");
        }
        if (status === 'returned') {
            updateFields.push('returned_at = NOW()');
        }

        await query(`UPDATE orders SET ${updateFields.join(', ')} WHERE id = $2`, updateParams);

        await query(
            `INSERT INTO status_history (order_id, field, old_value, new_value, changed_by, note)
             VALUES ($1, 'shipping_status', $2, $3, $4, $5)`,
            [id, oldStatus, status, req.session.userId, note || null]
        );

        await createAuditLog({
            tableName: 'orders', recordId: id as string, action: 'status_change',
            userId: req.session.userId!, oldValues: { shippingStatus: oldStatus }, newValues: { shippingStatus: status },
            details: `Shipping: ${oldStatus} → ${status}`,
        });

        // ── Post-transition side effects ──
        if (status === 'delivered' && agentId) {
            // Auto-calculate commission for the delivering agent
            try {
                const commissionId = await createCommissionForOrder(id, agentId);
                if (commissionId) {
                    await createNotification({
                        userId: agentId, type: 'commission_calculated', title: 'Commission Calculated',
                        message: `Commission added for delivered order`, data: { orderId: id, commissionId }
                    });
                }
            } catch (commErr) {
                logger.error('Commission calculation failed (non-blocking):', commErr);
            }
        }

        if (status === 'returned') {
            // NOTE: Stock is NOT auto-restored here.
            // Returns must be physically verified first via the Returns section
            // (POST /api/returns/:orderId/verify with result 'ok')
            // before stock is restored. Packages take 1+ weeks from Coliix.
            await notifyManagers({
                type: 'order_status_changed', title: '📦 Order Returned',
                message: `Order ${id} marked as returned — pending verification`, data: { orderId: id }
            });
        }

        res.json({ success: true, message: 'Shipping status updated' });
    } catch (error) {
        logger.error('Update shipping status error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update shipping status' } });
    }
});

// ─── PUT /api/orders/:id/assign ───────────────────
router.put('/:id/assign', requireAuth, requirePermission('assign_orders'), async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;
        const orderId = String(req.params.id);

        const orderCheck = await query(
            'SELECT id, order_number FROM orders WHERE id = $1 AND deleted_at IS NULL',
            [orderId]
        );
        if (orderCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        await manualAssign(orderId, userId, req.session.userId!);

        // Notify the assigned agent
        await createNotification({
            userId, type: 'order_assigned', title: 'New Order Assigned',
            message: `Order ${orderCheck.rows[0].order_number} assigned to you`,
            data: { orderId }
        });

        await createAuditLog({
            tableName: 'orders', recordId: orderId as string, action: 'assign',
            userId: req.session.userId!, newValues: { assignedTo: userId },
            details: `Order ${orderCheck.rows[0].order_number} manually assigned`,
        });

        res.json({ success: true, message: 'Order assigned' });
    } catch (error) {
        logger.error('Assign order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to assign order' } });
    }
});

// ─── DELETE /api/orders/:id ───────────────────────
router.delete('/:id', requireAuth, requirePermission('delete_orders'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            'UPDATE orders SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, order_number',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        await createAuditLog({
            tableName: 'orders', recordId: req.params.id as string, action: 'delete',
            userId: req.session.userId!, details: `Deleted order ${result.rows[0].order_number}`,
        });

        res.json({ success: true, message: 'Order deleted' });
    } catch (error) {
        logger.error('Delete order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete order' } });
    }
});

// ─── GET /api/orders/stats ────────────────────────
router.get('/stats/summary', requireAuth, async (req: Request, res: Response) => {
    try {
        // Apply same agent visibility filter as the order list
        const permissions: string[] = req.session.permissions || [];
        const isAgent = !permissions.includes('view_all_orders');
        const agentFilter = isAgent ? 'AND assigned_to = $1' : '';
        const params = isAgent ? [req.session.userId] : [];

        const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE deleted_at IS NULL ${agentFilter}) as total_orders,
        COUNT(*) FILTER (WHERE confirmation_status = 'pending' AND deleted_at IS NULL ${agentFilter}) as pending,
        COUNT(*) FILTER (WHERE confirmation_status = 'confirmed' AND deleted_at IS NULL ${agentFilter}) as confirmed,
        COUNT(*) FILTER (WHERE shipping_status = 'in_transit' AND deleted_at IS NULL ${agentFilter}) as in_transit,
        COUNT(*) FILTER (WHERE shipping_status = 'delivered' AND deleted_at IS NULL ${agentFilter}) as delivered,
        COUNT(*) FILTER (WHERE shipping_status = 'returned' AND deleted_at IS NULL ${agentFilter}) as returned,
        COALESCE(SUM(final_amount) FILTER (WHERE shipping_status = 'delivered' AND deleted_at IS NULL ${agentFilter}), 0) as total_revenue,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND deleted_at IS NULL ${agentFilter}) as today_orders
      FROM orders
    `, params);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Order stats error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } });
    }
});

// ─── GET /api/orders/stats/dashboard ─────────────
// Dashboard KPIs with date filtering + period comparison
router.get('/stats/dashboard', requireAuth, async (req: Request, res: Response) => {
    try {
        const { from, to, product_id, agent_id, city } = req.query as { from?: string; to?: string; product_id?: string; agent_id?: string; city?: string };

        const dateTo = to ? `'${to}'::date + interval '1 day'` : `CURRENT_DATE + interval '1 day'`;
        const dateFrom = from ? `'${from}'::date` : `CURRENT_DATE`;
        const prevTo = from ? `'${from}'::date` : `CURRENT_DATE`;
        const prevFrom = from && to
            ? `'${from}'::date - ('${to}'::date - '${from}'::date + 1)`
            : `CURRENT_DATE - interval '1 day'`;

        // Build dynamic filters
        const joins: string[] = [];
        const wheres: string[] = [];
        if (product_id) {
            joins.push(`JOIN order_items oi_f ON oi_f.order_id = orders.id JOIN product_variants pv_f ON oi_f.variant_id = pv_f.id AND pv_f.product_id = '${product_id}'`);
        }
        if (agent_id) wheres.push(`AND orders.assigned_to = '${agent_id}'`);
        if (city) {
            joins.push(`JOIN customers c_f ON orders.customer_id = c_f.id`);
            wheres.push(`AND LOWER(c_f.city) = LOWER('${city}')`);
        }
        const joinStr = joins.join(' ');
        const whereStr = wheres.join(' ');

        const result = await query(`
            WITH current_period AS (
                SELECT 
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.deleted_at IS NULL) as total_orders,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.confirmation_status = 'pending' AND orders.deleted_at IS NULL) as pending,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.confirmation_status = 'confirmed' AND orders.deleted_at IS NULL) as confirmed,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.confirmation_status = 'cancelled' AND orders.deleted_at IS NULL) as cancelled,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.shipping_status = 'in_transit' AND orders.deleted_at IS NULL) as in_transit,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.shipping_status = 'delivered' AND orders.deleted_at IS NULL) as delivered,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.shipping_status = 'returned' AND orders.deleted_at IS NULL) as returned,
                    COALESCE(SUM(DISTINCT orders.final_amount) FILTER (WHERE orders.confirmation_status = 'confirmed' AND orders.deleted_at IS NULL), 0) as total_revenue,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.created_at >= CURRENT_DATE AND orders.deleted_at IS NULL) as today_orders
                FROM orders ${joinStr}
                WHERE orders.created_at >= ${dateFrom} AND orders.created_at < ${dateTo} ${whereStr}
            ),
            prev_period AS (
                SELECT 
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.deleted_at IS NULL) as total_orders,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.confirmation_status = 'confirmed' AND orders.deleted_at IS NULL) as confirmed,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.shipping_status = 'delivered' AND orders.deleted_at IS NULL) as delivered,
                    COUNT(DISTINCT orders.id) FILTER (WHERE orders.shipping_status = 'returned' AND orders.deleted_at IS NULL) as returned,
                    COALESCE(SUM(DISTINCT orders.final_amount) FILTER (WHERE orders.confirmation_status = 'confirmed' AND orders.deleted_at IS NULL), 0) as total_revenue
                FROM orders ${joinStr}
                WHERE orders.created_at >= ${prevFrom} AND orders.created_at < ${prevTo} ${whereStr}
            ),
            status_breakdown AS (
                SELECT orders.confirmation_status, COUNT(DISTINCT orders.id) as count
                FROM orders ${joinStr}
                WHERE orders.created_at >= ${dateFrom} AND orders.created_at < ${dateTo}
                    AND orders.deleted_at IS NULL ${whereStr}
                GROUP BY orders.confirmation_status
            )
            SELECT 
                row_to_json(c) as current,
                row_to_json(p) as previous,
                (SELECT json_agg(row_to_json(s)) FROM status_breakdown s) as status_breakdown
            FROM current_period c, prev_period p
        `);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Dashboard stats error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get dashboard stats' } });
    }
});

// ─── GET /api/orders/stats/revenue-trend ─────────
router.get('/stats/revenue-trend', requireAuth, async (req: Request, res: Response) => {
    try {
        const { from, to, product_id, agent_id, city } = req.query as { from?: string; to?: string; product_id?: string; agent_id?: string; city?: string };
        const dateTo = to || new Date().toISOString().split('T')[0];
        const dateFrom = from || new Date().toISOString().split('T')[0];

        const joins: string[] = [];
        const wheres: string[] = [];
        const params: any[] = [dateFrom, dateTo];
        let paramIdx = 3;
        if (product_id) {
            joins.push(`LEFT JOIN order_items oi_f ON oi_f.order_id = o.id LEFT JOIN product_variants pv_f ON oi_f.variant_id = pv_f.id`);
            wheres.push(`AND pv_f.product_id = $${paramIdx}`);
            params.push(product_id);
            paramIdx++;
        }
        if (agent_id) { wheres.push(`AND o.assigned_to = $${paramIdx}`); params.push(agent_id); paramIdx++; }
        if (city) {
            joins.push(`LEFT JOIN customers c_f ON o.customer_id = c_f.id`);
            wheres.push(`AND LOWER(c_f.city) = LOWER($${paramIdx})`);
            params.push(city); paramIdx++;
        }

        const result = await query(`
            SELECT 
                d::date as date,
                COALESCE(SUM(o.final_amount) FILTER (WHERE o.confirmation_status = 'confirmed'), 0) as revenue,
                COUNT(DISTINCT o.id) as orders
            FROM generate_series($1::date, $2::date, '1 day'::interval) d
            LEFT JOIN orders o ON o.created_at::date = d::date AND o.deleted_at IS NULL
            ${joins.join(' ')}
            WHERE 1=1 ${wheres.join(' ')}
            GROUP BY d::date
            ORDER BY d::date
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Revenue trend error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get revenue trend' } });
    }
});

// ─── GET /api/orders/stats/top-agents ────────────
router.get('/stats/top-agents', requireAuth, async (req: Request, res: Response) => {
    try {
        const { from, to, product_id, agent_id, city } = req.query as { from?: string; to?: string; product_id?: string; agent_id?: string; city?: string };
        const dateTo = to ? `'${to}'::date + interval '1 day'` : `CURRENT_DATE + interval '1 day'`;
        const dateFrom = from ? `'${from}'::date` : `CURRENT_DATE`;

        const joins: string[] = [];
        const wheres: string[] = [];
        if (product_id) joins.push(`JOIN order_items oi_f ON oi_f.order_id = o.id JOIN product_variants pv_f ON oi_f.variant_id = pv_f.id AND pv_f.product_id = '${product_id}'`);
        if (agent_id) wheres.push(`AND o.assigned_to = '${agent_id}'`);
        if (city) { joins.push(`JOIN customers c_f ON o.customer_id = c_f.id`); wheres.push(`AND LOWER(c_f.city) = LOWER('${city}')`); }

        const result = await query(`
            SELECT 
                u.id, u.full_name as name,
                COUNT(DISTINCT o.id) as total_orders,
                COUNT(DISTINCT o.id) FILTER (WHERE o.confirmation_status = 'confirmed') as confirmed,
                COUNT(DISTINCT o.id) FILTER (WHERE o.shipping_status = 'delivered') as delivered,
                COALESCE(SUM(DISTINCT o.final_amount) FILTER (WHERE o.confirmation_status = 'confirmed'), 0) as revenue
            FROM orders o
            JOIN users u ON o.assigned_to = u.id
            ${joins.join(' ')}
            WHERE o.created_at >= ${dateFrom} AND o.created_at < ${dateTo}
                AND o.deleted_at IS NULL ${wheres.join(' ')}
            GROUP BY u.id, u.full_name
            ORDER BY confirmed DESC
            LIMIT 5
        `);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Top agents error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get top agents' } });
    }
});

// ─── GET /api/orders/stats/top-cities ────────────
router.get('/stats/top-cities', requireAuth, async (req: Request, res: Response) => {
    try {
        const { from, to, product_id, agent_id, city } = req.query as { from?: string; to?: string; product_id?: string; agent_id?: string; city?: string };
        const dateTo = to ? `'${to}'::date + interval '1 day'` : `CURRENT_DATE + interval '1 day'`;
        const dateFrom = from ? `'${from}'::date` : `CURRENT_DATE`;

        const joins: string[] = [];
        const wheres: string[] = [];
        if (product_id) joins.push(`JOIN order_items oi_f ON oi_f.order_id = o.id JOIN product_variants pv_f ON oi_f.variant_id = pv_f.id AND pv_f.product_id = '${product_id}'`);
        if (agent_id) wheres.push(`AND o.assigned_to = '${agent_id}'`);
        if (city) wheres.push(`AND LOWER(c.city) = LOWER('${city}')`);

        const result = await query(`
            SELECT 
                c.city,
                COUNT(DISTINCT o.id) as total_orders,
                COUNT(DISTINCT o.id) FILTER (WHERE o.shipping_status = 'delivered') as delivered,
                COUNT(DISTINCT o.id) FILTER (WHERE o.shipping_status = 'returned') as returned,
                ROUND(
                    COUNT(DISTINCT o.id) FILTER (WHERE o.shipping_status = 'delivered')::numeric / 
                    NULLIF(COUNT(DISTINCT o.id), 0) * 100, 1
                ) as delivery_rate
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            ${joins.join(' ')}
            WHERE o.created_at >= ${dateFrom} AND o.created_at < ${dateTo}
                AND o.deleted_at IS NULL
                AND c.city IS NOT NULL AND c.city != '' ${wheres.join(' ')}
            GROUP BY c.city
            ORDER BY delivered DESC
            LIMIT 5
        `);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Top cities error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get top cities' } });
    }
});

// ─── GET /api/orders/stats/top-products ──────────
router.get('/stats/top-products', requireAuth, async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query as { from?: string; to?: string };
        const dateTo = to ? `'${to}'::date + interval '1 day'` : 'NOW()';
        const dateFrom = from ? `'${from}'::date` : `NOW() - interval '30 days'`;

        const result = await query(`
            SELECT 
                p.id, p.name, p.image_url,
                COUNT(DISTINCT o.id) as total_orders,
                COUNT(DISTINCT o.id) FILTER (WHERE o.shipping_status = 'delivered') as delivered_orders,
                SUM(oi.quantity) as total_qty,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN product_variants pv ON oi.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE o.created_at >= ${dateFrom} AND o.created_at < ${dateTo}
                AND o.deleted_at IS NULL
            GROUP BY p.id, p.name, p.image_url
            ORDER BY total_qty DESC
            LIMIT 5
        `);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Top products error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get top products' } });
    }
});

// ─── POST /api/orders/relink-all ──────────────────
// Bulk relink all orphan order items (variant_id IS NULL) to matching products
router.post('/relink-all', requireAuth, async (req: Request, res: Response) => {
    try {
        // Find ALL order items with no variant linked
        const orphans = await query(
            `SELECT oi.id, oi.product_name, oi.variant_info, oi.order_id
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE oi.variant_id IS NULL AND o.deleted_at IS NULL
             ORDER BY oi.created_at`
        );

        let linked = 0;
        const total = orphans.rows.length;

        for (const item of orphans.rows) {
            if (!item.product_name) continue;

            // Try to match by product name
            const match = await query(
                `SELECT pv.id as variant_id, p.name, pv.size, pv.color
                 FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 WHERE p.name ILIKE $1 AND p.deleted_at IS NULL AND pv.is_active = true
                 ORDER BY pv.created_at ASC
                 LIMIT 5`,
                [`%${item.product_name.trim()}%`]
            );

            if (match.rows.length > 0) {
                let bestMatch = match.rows[0];
                if (item.variant_info) {
                    const parts = item.variant_info.split('/').map((s: string) => s.trim().toLowerCase());
                    for (const row of match.rows) {
                        const rowParts = [row.size, row.color].filter(Boolean).map((s: string) => s.toLowerCase());
                        const matchScore = parts.filter((p: string) => rowParts.some((r: string) => r.includes(p) || p.includes(r))).length;
                        if (matchScore > 0) { bestMatch = row; break; }
                    }
                }

                await query(
                    `UPDATE order_items SET variant_id = $1 WHERE id = $2`,
                    [bestMatch.variant_id, item.id]
                );
                linked++;
            }
        }

        logger.info(`Bulk relink: ${linked}/${total} orphan items linked`);
        res.json({ success: true, linked, total });
    } catch (error) {
        logger.error('Bulk relink error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to relink items' } });
    }
});


// ═══════════════════════════════════════════════════
// ORDER LOCKS (Concurrent Editing)
// ═══════════════════════════════════════════════════

// ─── POST /api/orders/:id/lock ────────────────────
router.post('/:id/lock', requireAuth, async (req: Request, res: Response) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId!;

        // Check if already locked by someone else
        const existing = await query(
            `SELECT ol.*, u.full_name as locked_by_name
             FROM order_locks ol
             JOIN users u ON u.id = ol.locked_by
             WHERE ol.order_id = $1 AND ol.expires_at > NOW()`,
            [orderId]
        );

        if (existing.rows.length > 0 && existing.rows[0].locked_by !== userId) {
            res.status(409).json({
                success: false,
                error: {
                    code: 'ORDER_LOCKED',
                    message: `Order is currently being edited by ${existing.rows[0].locked_by_name}`,
                    lockedBy: existing.rows[0].locked_by_name,
                },
            });
            return;
        }

        // Upsert lock (5 minute expiry)
        await query(
            `INSERT INTO order_locks (order_id, locked_by, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
             ON CONFLICT (order_id) DO UPDATE SET locked_by = $2, expires_at = NOW() + INTERVAL '5 minutes'`,
            [orderId, userId]
        );

        res.json({ success: true, message: 'Lock acquired' });
    } catch (error) {
        logger.error('Lock order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to lock order' } });
    }
});

// ─── DELETE /api/orders/:id/lock ──────────────────
router.delete('/:id/lock', requireAuth, async (req: Request, res: Response) => {
    try {
        await query(
            `DELETE FROM order_locks WHERE order_id = $1 AND locked_by = $2`,
            [req.params.id, req.session.userId]
        );
        res.json({ success: true, message: 'Lock released' });
    } catch (error) {
        logger.error('Unlock order error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to unlock order' } });
    }
});

// ─── GET /api/orders/:id/lock ─────────────────────
router.get('/:id/lock', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT ol.*, u.full_name as locked_by_name
             FROM order_locks ol
             JOIN users u ON u.id = ol.locked_by
             WHERE ol.order_id = $1 AND ol.expires_at > NOW()`,
            [req.params.id]
        );
        res.json({
            success: true,
            locked: result.rows.length > 0,
            data: result.rows[0] || null,
        });
    } catch (error) {
        logger.error('Check lock error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to check lock' } });
    }
});


// ═══════════════════════════════════════════════════
// SCHEDULED CALLBACKS
// ═══════════════════════════════════════════════════

// ─── POST /api/orders/:id/schedule-callback ───────
router.post('/:id/schedule-callback', requireAuth, async (req: Request, res: Response) => {
    try {
        const orderId = req.params.id;
        const { scheduledAt, notes } = req.body;

        if (!scheduledAt) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'scheduledAt is required' } });
            return;
        }

        // Get assigned agent
        const orderResult = await query(
            `SELECT assigned_to FROM orders WHERE id = $1`,
            [orderId]
        );
        if (orderResult.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
            return;
        }

        const agentId = orderResult.rows[0].assigned_to || req.session.userId;

        await query(
            `INSERT INTO scheduled_callbacks (order_id, agent_id, scheduled_at, notes, created_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderId, agentId, scheduledAt, notes || null, req.session.userId]
        );

        res.json({ success: true, message: 'Callback scheduled' });
    } catch (error) {
        logger.error('Schedule callback error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to schedule callback' } });
    }
});

// ─── GET /api/orders/callbacks ────────────────────
router.get('/callbacks/upcoming', requireAuth, async (req: Request, res: Response) => {
    try {
        const agentId = req.query.agent_id || req.session.userId;

        const result = await query(
            `SELECT sc.*, o.order_number, o.final_amount,
                    c.full_name as customer_name, c.phone
             FROM scheduled_callbacks sc
             JOIN orders o ON o.id = sc.order_id
             LEFT JOIN customers c ON c.id = o.customer_id
             WHERE sc.agent_id = $1
               AND sc.completed_at IS NULL
               AND sc.scheduled_at >= NOW() - INTERVAL '1 hour'
             ORDER BY sc.scheduled_at ASC
             LIMIT 20`,
            [agentId]
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List callbacks error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list callbacks' } });
    }
});


// ═══════════════════════════════════════════════════
// OUT-OF-STOCK QUEUE
// ═══════════════════════════════════════════════════

// ─── GET /api/orders/out-of-stock-queue ───────────
router.get('/out-of-stock-queue', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT
                o.id, o.order_number, o.final_amount, o.created_at,
                c.full_name as customer_name, c.phone,
                json_agg(json_build_object(
                    'product_name', oi.product_name,
                    'variant_name', oi.variant_name,
                    'quantity', oi.quantity,
                    'variant_id', oi.variant_id,
                    'stock', COALESCE(pv.stock, 0)
                )) as items
            FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN product_variants pv ON pv.id = oi.variant_id
            WHERE o.confirmation_status = 'out_of_stock'
              AND o.deleted_at IS NULL
            GROUP BY o.id, c.id
            ORDER BY o.created_at ASC
        `);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Out-of-stock queue error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get out-of-stock queue' } });
    }
});

// ─── GET /api/orders/stats/agent-dashboard ───────
// Agent-specific personal dashboard KPIs
router.get('/stats/agent-dashboard', requireAuth, async (req: Request, res: Response) => {
    try {
        const agentId = req.session.userId;

        // Helper to get stats for a date range
        const getStats = async (fromDate: string, toDate: string) => {
            const result = await query(
                `SELECT
                    COUNT(*) as total_orders,
                    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed') as confirmed,
                    COUNT(*) FILTER (WHERE confirmation_status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE confirmation_status = 'cancelled') as cancelled,
                    COUNT(*) FILTER (WHERE confirmation_status = 'unreachable') as unreachable,
                    COUNT(*) FILTER (WHERE confirmation_status = 'fake') as fake,
                    COUNT(*) FILTER (WHERE confirmation_status = 'reported') as reported,
                    COUNT(*) FILTER (WHERE confirmation_status = 'out_of_stock') as out_of_stock,
                    COUNT(*) FILTER (WHERE shipping_status = 'delivered') as delivered,
                    COUNT(*) FILTER (WHERE shipping_status = 'returned') as returned,
                    COUNT(*) FILTER (WHERE shipping_status = 'in_transit') as in_transit,
                    COALESCE(SUM(CASE WHEN confirmation_status = 'confirmed' THEN final_amount ELSE 0 END), 0) as confirmed_revenue,
                    COALESCE(SUM(CASE WHEN shipping_status = 'delivered' THEN final_amount ELSE 0 END), 0) as delivered_revenue
                 FROM orders
                 WHERE assigned_to = $1
                   AND updated_at >= $2::date
                   AND updated_at < ($3::date + interval '1 day')
                   AND deleted_at IS NULL`,
                [agentId, fromDate, toDate]
            );
            return result.rows[0];
        };

        const today = new Date();
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        // Yesterday
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = fmt(yesterday);

        // Last 7 days
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Last 30 days
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);

        // All-time stats
        const getAllTime = async () => {
            const result = await query(
                `SELECT
                    COUNT(*) as total_orders,
                    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed') as confirmed,
                    COUNT(*) FILTER (WHERE confirmation_status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE confirmation_status = 'cancelled') as cancelled,
                    COUNT(*) FILTER (WHERE confirmation_status = 'unreachable') as unreachable,
                    COUNT(*) FILTER (WHERE confirmation_status = 'fake') as fake,
                    COUNT(*) FILTER (WHERE shipping_status = 'delivered') as delivered,
                    COUNT(*) FILTER (WHERE shipping_status = 'returned') as returned,
                    COUNT(*) FILTER (WHERE shipping_status = 'in_transit') as in_transit,
                    COALESCE(SUM(CASE WHEN confirmation_status = 'confirmed' THEN final_amount ELSE 0 END), 0) as confirmed_revenue,
                    COALESCE(SUM(CASE WHEN shipping_status = 'delivered' THEN final_amount ELSE 0 END), 0) as delivered_revenue
                 FROM orders
                 WHERE assigned_to = $1 AND deleted_at IS NULL`,
                [agentId]
            );
            return result.rows[0];
        };

        const [todayStats, yesterdayStats, weekStats, monthStats, allTimeStats] = await Promise.all([
            getStats(fmt(today), fmt(today)),
            getStats(yesterdayStr, yesterdayStr),
            getStats(fmt(weekAgo), fmt(today)),
            getStats(fmt(monthAgo), fmt(today)),
            getAllTime(),
        ]);

        // Commissions (richer breakdown)
        const commResult = await query(
            `SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid,
                COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'new')), 0) as pending_comm,
                COALESCE(SUM(amount) FILTER (WHERE status = 'rejected'), 0) as deducted,
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) FILTER (WHERE status IN ('approved', 'new')) as pending_count
             FROM commissions
             WHERE agent_id = $1 AND deleted_at IS NULL`,
            [agentId]
        );
        const commissions = commResult.rows[0];

        // Courier status breakdown (delivery pipeline)
        const courierResult = await query(
            `SELECT courier_status, COUNT(*) as count
             FROM orders
             WHERE assigned_to = $1 AND deleted_at IS NULL
               AND courier_status IS NOT NULL AND courier_status != ''
             GROUP BY courier_status
             ORDER BY count DESC`,
            [agentId]
        );

        // Overall active queue (regardless of date)
        const queueResult = await query(
            `SELECT
                COUNT(*) as total_assigned,
                COUNT(*) FILTER (WHERE confirmation_status = 'pending') as pending,
                COUNT(*) FILTER (WHERE confirmation_status = 'reported') as rescheduled
             FROM orders
             WHERE assigned_to = $1 AND deleted_at IS NULL
               AND (confirmation_status IN ('pending', 'reported') OR shipping_status = 'not_shipped')`,
            [agentId]
        );
        const queue_stats = queueResult.rows[0];

        // Recent orders (last 10)
        const recentResult = await query(
            `SELECT o.id, o.order_number, c.full_name as customer_name, c.city as customer_city,
                    o.confirmation_status, o.shipping_status, o.courier_status, o.final_amount, o.created_at
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             WHERE o.assigned_to = $1 AND o.deleted_at IS NULL
             ORDER BY o.created_at DESC LIMIT 10`,
            [agentId]
        );

        // Callbacks due
        const callbacksResult = await query(
            `SELECT o.id, o.order_number, c.full_name as customer_name, o.updated_at
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             WHERE o.assigned_to = $1
               AND o.confirmation_status = 'unreachable'
               AND o.deleted_at IS NULL
             ORDER BY o.updated_at DESC LIMIT 5`,
            [agentId]
        );

        const calcRate = (stats: any) => {
            const total = parseInt(stats.total_orders) || 0;
            const confirmed = parseInt(stats.confirmed) || 0;
            return total > 0 ? Math.round((confirmed / total) * 100) : 0;
        };

        res.json({
            success: true,
            data: {
                today: todayStats,
                yesterday: yesterdayStats,
                week: weekStats,
                month: monthStats,
                allTime: allTimeStats,
                confirmation_rates: {
                    today: calcRate(todayStats),
                    yesterday: calcRate(yesterdayStats),
                    week: calcRate(weekStats),
                    month: calcRate(monthStats),
                    allTime: calcRate(allTimeStats),
                },
                commissions: {
                    paid: parseFloat(commissions.paid) || 0,
                    pending: parseFloat(commissions.pending_comm) || 0,
                    deducted: parseFloat(commissions.deducted) || 0,
                    total: parseFloat(commissions.total) || 0,
                    pending_count: parseInt(commissions.pending_count) || 0,
                },
                courier_statuses: courierResult.rows,
                queue_stats,
                recent_orders: recentResult.rows,
                callbacks: callbacksResult.rows,
            },
        });
    } catch (error) {
        logger.error('Agent dashboard error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load agent dashboard' } });
    }
});


export default router;
