import { pool, query, transaction } from '../config/database';
import { createAuditLog } from './audit.service';

export type StockChangeReason =
    | 'order_confirmed'
    | 'order_cancelled'
    | 'return_verified_ok'
    | 'manual_adjustment';

/**
 * Atomically deduct stock for a variant.
 * Uses SELECT FOR UPDATE to prevent race conditions.
 * Throws if insufficient stock.
 */
export async function deductStock(
    variantId: string,
    qty: number,
    orderId: string,
    reason: StockChangeReason,
    userId?: string
): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the row
        const lockResult = await client.query(
            `SELECT id, stock, low_stock_threshold, product_id FROM product_variants WHERE id = $1 FOR UPDATE`,
            [variantId]
        );

        if (lockResult.rows.length === 0) {
            throw new Error(`Variant ${variantId} not found`);
        }

        const variant = lockResult.rows[0];
        const currentStock = variant.stock;

        if (currentStock < qty) {
            throw new Error(
                `Insufficient stock for variant ${variantId}: available ${currentStock}, requested ${qty}`
            );
        }

        const newStock = currentStock - qty;

        await client.query(
            `UPDATE product_variants SET stock = $1, updated_at = NOW() WHERE id = $2`,
            [newStock, variantId]
        );

        await client.query('COMMIT');

        // Audit log (outside transaction)
        await createAuditLog({
            tableName: 'product_variants',
            recordId: variantId,
            action: 'stock_deduct',
            userId: userId || null,
            oldValues: { stock: currentStock },
            newValues: { stock: newStock },
            details: `Stock deducted by ${qty} for order ${orderId} — reason: ${reason}`,
        });

        // Fire low stock check
        if (newStock <= variant.low_stock_threshold && newStock > 0) {
            // Notification hook — will emit event when Socket.IO is wired
            console.log(`[LOW STOCK] Variant ${variantId} at ${newStock} (threshold: ${variant.low_stock_threshold})`);
        }

        if (newStock === 0) {
            console.log(`[OUT OF STOCK] Variant ${variantId}`);
        }
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Atomically restore stock for a variant.
 */
export async function restoreStock(
    variantId: string,
    qty: number,
    orderId: string,
    reason: StockChangeReason,
    userId?: string
): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const lockResult = await client.query(
            `SELECT id, stock FROM product_variants WHERE id = $1 FOR UPDATE`,
            [variantId]
        );

        if (lockResult.rows.length === 0) {
            throw new Error(`Variant ${variantId} not found`);
        }

        const variant = lockResult.rows[0];
        const currentStock = variant.stock;
        const newStock = currentStock + qty;

        await client.query(
            `UPDATE product_variants SET stock = $1, updated_at = NOW() WHERE id = $2`,
            [newStock, variantId]
        );

        await client.query('COMMIT');

        await createAuditLog({
            tableName: 'product_variants',
            recordId: variantId,
            action: 'stock_restore',
            userId: userId || null,
            oldValues: { stock: currentStock },
            newValues: { stock: newStock },
            details: `Stock restored by ${qty} for order ${orderId} — reason: ${reason}`,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Check stock availability for all items in an order before confirming.
 * Returns an array of items that have insufficient stock.
 */
export async function checkStockAvailability(
    items: Array<{ variantId: string; qty: number }>
): Promise<Array<{ variantId: string; available: number; requested: number }>> {
    const insufficient: Array<{ variantId: string; available: number; requested: number }> = [];

    for (const item of items) {
        const result = await pool.query(
            `SELECT stock FROM product_variants WHERE id = $1`,
            [item.variantId]
        );

        if (result.rows.length === 0 || result.rows[0].stock < item.qty) {
            insufficient.push({
                variantId: item.variantId,
                available: result.rows[0]?.stock ?? 0,
                requested: item.qty,
            });
        }
    }

    return insufficient;
}

/**
 * Get current stock level for a variant.
 */
export async function getStock(variantId: string): Promise<number> {
    const result = await pool.query(
        `SELECT stock FROM product_variants WHERE id = $1`,
        [variantId]
    );
    return result.rows[0]?.stock ?? 0;
}
