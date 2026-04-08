import { pool, query, transaction } from '../config/database';

export interface CommissionResult {
    totalAmount: number;
    breakdown: Array<{
        orderItemId: string;
        variantId: string;
        type: string;
        rate: number;
        amount: number;
        ruleId: string | null;
        ruleLevel: 'agent_product' | 'agent_category' | 'agent_default' | 'global_default';
    }>;
}

/**
 * Calculate commission for a delivered order.
 * Priority lookup:
 *   1. agent_id + product_id (most specific)
 *   2. agent_id + category
 *   3. agent_id only (agent default)
 *   4. Global default (from system_settings)
 */
export async function calculateOrderCommission(
    orderId: string,
    agentId: string
): Promise<CommissionResult> {
    // Get order items with variant + product info
    const itemsResult = await pool.query(
        `SELECT 
       oi.id as order_item_id,
       oi.variant_id,
       oi.quantity,
       oi.unit_price,
       pv.cost_price,
       p.id as product_id,
       p.category_id
     FROM order_items oi
     JOIN product_variants pv ON pv.id = oi.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE oi.order_id = $1`,
        [orderId]
    );

    if (itemsResult.rows.length === 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    // Get all rules for this agent
    const rulesResult = await pool.query(
        `SELECT id, agent_id, product_id, category_id, rule_type, rate
     FROM commission_rules
     WHERE (agent_id = $1 OR agent_id IS NULL)
       AND is_active = true
       AND deleted_at IS NULL
     ORDER BY 
       CASE WHEN agent_id IS NOT NULL AND product_id IS NOT NULL THEN 1
            WHEN agent_id IS NOT NULL AND category_id IS NOT NULL THEN 2
            WHEN agent_id IS NOT NULL THEN 3
            ELSE 4
       END ASC`,
        [agentId]
    );

    // Get global default rate from system_settings
    const settingsResult = await pool.query(
        `SELECT value FROM system_settings WHERE key = 'commission_default_rate'`
    );
    const globalDefaultRate = settingsResult.rows[0]?.value?.rate ?? 10; // 10 MAD default
    const globalDefaultType = settingsResult.rows[0]?.value?.type ?? 'fixed';

    const breakdown: CommissionResult['breakdown'] = [];
    let totalAmount = 0;

    for (const item of itemsResult.rows) {
        // Find best matching rule (already sorted by priority)
        let matchedRule = null;
        let ruleLevel: CommissionResult['breakdown'][0]['ruleLevel'] = 'global_default';

        for (const rule of rulesResult.rows) {
            if (rule.agent_id === agentId && rule.product_id === item.product_id) {
                matchedRule = rule;
                ruleLevel = 'agent_product';
                break;
            }
            if (rule.agent_id === agentId && rule.category_id && rule.category_id === item.category_id) {
                matchedRule = rule;
                ruleLevel = 'agent_category';
                break;
            }
            if (rule.agent_id === agentId && !rule.product_id && !rule.category_id) {
                matchedRule = rule;
                ruleLevel = 'agent_default';
                break;
            }
        }

        const type = matchedRule?.rule_type ?? globalDefaultType;
        const rate = matchedRule?.rate ?? globalDefaultRate;
        const qty = item.quantity;
        const unitPrice = parseFloat(item.unit_price);
        const costPrice = parseFloat(item.cost_price ?? 0);

        let amount = 0;
        if (type === 'fixed') {
            amount = rate * qty;
        } else if (type === 'percentage_sale') {
            amount = (unitPrice * qty * rate) / 100;
        } else if (type === 'percentage_margin') {
            amount = ((unitPrice - costPrice) * qty * rate) / 100;
        }

        amount = Math.max(0, Math.round(amount * 100) / 100);
        totalAmount += amount;

        breakdown.push({
            orderItemId: item.order_item_id,
            variantId: item.variant_id,
            type,
            rate,
            amount,
            ruleId: matchedRule?.id ?? null,
            ruleLevel,
        });
    }

    return { totalAmount: Math.round(totalAmount * 100) / 100, breakdown };
}

/**
 * Create a commission record for a delivered order.
 * Called automatically when shipping_status → 'delivered'.
 */
export async function createCommissionForOrder(
    orderId: string,
    agentId: string
): Promise<string | null> {
    // Check if commission already exists for this order
    const existing = await pool.query(
        `SELECT id FROM commissions WHERE order_id = $1 AND agent_id = $2`,
        [orderId, agentId]
    );

    if (existing.rows.length > 0) {
        console.log(`[COMMISSION] Commission already exists for order ${orderId}`);
        return existing.rows[0].id;
    }

    const result = await calculateOrderCommission(orderId, agentId);

    if (result.totalAmount === 0) {
        console.log(`[COMMISSION] Zero commission for order ${orderId} — no rule matched or zero items`);
        return null;
    }

    const insertResult = await pool.query(
        `INSERT INTO commissions (order_id, agent_id, amount, status, created_at)
     VALUES ($1, $2, $3, 'new', NOW())
     RETURNING id`,
        [orderId, agentId, result.totalAmount]
    );

    const commissionId = insertResult.rows[0].id;
    console.log(`[COMMISSION] Created commission ${commissionId}: ${result.totalAmount} MAD for agent ${agentId} on order ${orderId}`);

    return commissionId;
}

/**
 * Void pending commissions for an order when status is corrected away from delivered.
 * Paid commissions are intentionally not touched automatically.
 */
export async function voidPendingCommissionsForOrder(
    orderId: string,
    reason: string
): Promise<number> {
    const result = await pool.query(
        `UPDATE commissions
         SET status = 'rejected',
             review_note = CASE
               WHEN review_note IS NULL OR review_note = '' THEN $2
               ELSE review_note || ' | ' || $2
             END,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE order_id = $1
           AND status IN ('new', 'approved')
           AND deleted_at IS NULL
         RETURNING id`,
        [orderId, reason]
    );

    return result.rows.length;
}
