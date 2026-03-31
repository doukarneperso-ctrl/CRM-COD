import { pool, query, transaction } from '../config/database';
import { createAuditLog } from './audit.service';

// ============================================================
// STATUS TRANSITION MATRIX
// ============================================================

type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'unreachable' | 'fake' | 'reported' | 'out_of_stock' | 'merged_into';
type ShippingStatus = 'not_shipped' | 'pickup_scheduled' | 'in_transit' | 'delivered' | 'returned';

// Valid transitions: [currentStatus] -> [allowedNextStatuses]
const CONFIRMATION_TRANSITIONS: Record<ConfirmationStatus, ConfirmationStatus[]> = {
    pending: ['confirmed', 'cancelled', 'unreachable', 'fake', 'reported', 'out_of_stock'],
    confirmed: ['cancelled'],  // cancelled requires admin
    cancelled: [],             // terminal
    unreachable: ['confirmed', 'cancelled', 'fake', 'reported'],
    fake: [],             // terminal
    reported: ['confirmed', 'cancelled', 'unreachable'],
    out_of_stock: ['confirmed', 'cancelled'],
    merged_into: [],             // terminal (secondary order)
};

const SHIPPING_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
    not_shipped: ['pickup_scheduled'],
    pickup_scheduled: ['in_transit', 'returned'],
    in_transit: ['delivered', 'returned'],
    delivered: [],  // terminal
    returned: [],  // terminal
};

// Stock impact on confirmation status change
const STOCK_IMPACT: Record<string, 'deduct' | 'restore' | 'none'> = {
    'pending->confirmed': 'deduct',
    'confirmed->cancelled': 'restore',
    'out_of_stock->confirmed': 'deduct',
    'reported->confirmed': 'deduct',
    'unreachable->confirmed': 'deduct',
};

/**
 * Validate that a confirmation status transition is allowed.
 */
export function isValidConfirmationTransition(from: string, to: string): boolean {
    const allowed = CONFIRMATION_TRANSITIONS[from as ConfirmationStatus];
    return Array.isArray(allowed) && allowed.includes(to as ConfirmationStatus);
}

/**
 * Validate that a shipping status transition is allowed.
 */
export function isValidShippingTransition(from: string, to: string): boolean {
    const allowed = SHIPPING_TRANSITIONS[from as ShippingStatus];
    return Array.isArray(allowed) && allowed.includes(to as ShippingStatus);
}

/**
 * Get stock impact for a confirmation status transition.
 */
export function getStockImpact(from: string, to: string): 'deduct' | 'restore' | 'none' {
    return STOCK_IMPACT[`${from}->${to}`] || 'none';
}

/**
 * Handle unreachable count — auto-set to 'fake' at 5 attempts.
 * Returns the new unreachable_count.
 */
export async function handleUnreachable(orderId: string): Promise<{ count: number; autoFaked: boolean }> {
    const result = await pool.query(
        `UPDATE orders 
     SET unreachable_count = unreachable_count + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING unreachable_count`,
        [orderId]
    );

    const count = result.rows[0]?.unreachable_count ?? 1;
    let autoFaked = false;

    if (count >= 5) {
        await pool.query(
            `UPDATE orders SET confirmation_status = 'fake', updated_at = NOW() WHERE id = $1`,
            [orderId]
        );
        autoFaked = true;
    }

    return { count, autoFaked };
}

/**
 * Get order items for stock operations
 */
export async function getOrderItems(orderId: string): Promise<Array<{
    variantId: string;
    qty: number;
    productName: string;
}>> {
    const result = await pool.query(
        `SELECT variant_id as "variantId", quantity as qty, product_name as "productName"
     FROM order_items 
     WHERE order_id = $1 AND variant_id IS NOT NULL`,
        [orderId]
    );
    return result.rows;
}
