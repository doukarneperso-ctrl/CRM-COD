import { pool } from '../config/database';
import logger from '../utils/logger';

/**
 * Assignment service — 4 modes:
 *   round_robin   — quota-based round robin across selected agents
 *   by_product    — assign by product→agent mapping
 *   by_performance — like round robin but sorted by confirmation rate
 *   manual        — no auto-assignment
 */

interface AgentQuota {
    agent_id: string;
    quota: number;
}

interface AssignmentConfig {
    id: string;
    mode: 'round_robin' | 'by_product' | 'by_performance' | 'manual';
    is_active: boolean;
    config: {
        agents?: AgentQuota[];
    };
    state: {
        current_index?: number;
        current_count?: number;
    };
}

// ── Get the singleton config ──
export async function getAssignmentConfig(): Promise<AssignmentConfig | null> {
    const result = await pool.query('SELECT * FROM assignment_config LIMIT 1');
    return result.rows[0] || null;
}

// ── Update config ──
export async function updateAssignmentConfig(
    mode: string,
    config: any,
    resetState = true
): Promise<AssignmentConfig> {
    const state = resetState ? { current_index: 0, current_count: 0 } : undefined;
    const result = await pool.query(
        `UPDATE assignment_config 
         SET mode = $1, config = $2, ${state ? 'state = $3,' : ''} updated_at = NOW()
         RETURNING *`,
        state ? [mode, JSON.stringify(config), JSON.stringify(state)] : [mode, JSON.stringify(config)]
    );
    return result.rows[0];
}

// ── Auto-assign an order ──
export async function autoAssignOrder(orderId: string): Promise<string | null> {
    const cfg = await getAssignmentConfig();
    if (!cfg || !cfg.is_active || cfg.mode === 'manual') return null;

    try {
        if (cfg.mode === 'round_robin') {
            return await assignRoundRobin(orderId, cfg);
        } else if (cfg.mode === 'by_product') {
            return await assignByProduct(orderId);
        } else if (cfg.mode === 'by_performance') {
            return await assignByPerformance(orderId, cfg);
        }
    } catch (err) {
        logger.error('[ASSIGNMENT] Auto-assign error:', err);
    }
    return null;
}

// ── Quota Round Robin ──
async function assignRoundRobin(orderId: string, cfg: AssignmentConfig): Promise<string | null> {
    const agents: AgentQuota[] = cfg.config.agents || [];
    if (agents.length === 0) return null;

    // Filter to only available agents
    const availableAgents = await filterAvailableAgents(agents.map(a => a.agent_id));
    const activeAgents = agents.filter(a => availableAgents.includes(a.agent_id));
    if (activeAgents.length === 0) return null;

    let currentIndex = cfg.state.current_index || 0;
    let currentCount = cfg.state.current_count || 0;

    // Ensure index is within bounds
    if (currentIndex >= activeAgents.length) {
        currentIndex = 0;
        currentCount = 0;
    }

    const agent = activeAgents[currentIndex];
    const quota = agent.quota || 10;

    // Assign to current agent
    await doAssign(orderId, agent.agent_id);

    // Increment count
    currentCount++;

    // If quota reached, move to next agent
    if (currentCount >= quota) {
        currentIndex = (currentIndex + 1) % activeAgents.length;
        currentCount = 0;
    }

    // Save state
    await pool.query(
        `UPDATE assignment_config SET state = $1, updated_at = NOW()`,
        [JSON.stringify({ current_index: currentIndex, current_count: currentCount })]
    );

    return agent.agent_id;
}

// ── By Product ──
async function assignByProduct(orderId: string): Promise<string | null> {
    // Get task's product(s)
    const itemsResult = await pool.query(
        `SELECT pv.product_id
         FROM order_items oi
         JOIN product_variants pv ON pv.id = oi.variant_id
         WHERE oi.order_id = $1
         LIMIT 1`,
        [orderId]
    );

    if (itemsResult.rows.length === 0) return null;
    const productId = itemsResult.rows[0].product_id;

    // Lookup mapping
    const mappingResult = await pool.query(
        `SELECT pam.agent_id
         FROM product_agent_mappings pam
         JOIN users u ON u.id = pam.agent_id
         WHERE pam.product_id = $1
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND (u.is_available IS NULL OR u.is_available = true)`,
        [productId]
    );

    if (mappingResult.rows.length === 0) return null;

    await doAssign(orderId, mappingResult.rows[0].agent_id);
    return mappingResult.rows[0].agent_id;
}

// ── By Performance (quota RR sorted by confirmation rate) ──
async function assignByPerformance(orderId: string, cfg: AssignmentConfig): Promise<string | null> {
    const agents: AgentQuota[] = cfg.config.agents || [];
    if (agents.length === 0) return null;

    // Filter to only available agents
    const availableAgents = await filterAvailableAgents(agents.map(a => a.agent_id));
    const activeAgents = agents.filter(a => availableAgents.includes(a.agent_id));
    if (activeAgents.length === 0) return null;

    // Get agent confirmation rates and sort by performance (best first)
    const perfResult = await pool.query(
        `SELECT assigned_to as agent_id,
                COUNT(*) FILTER (WHERE confirmation_status = 'confirmed')::float / 
                NULLIF(COUNT(*) FILTER (WHERE confirmation_status IN ('confirmed','cancelled','unreachable','fake')), 0) as rate
         FROM orders
         WHERE assigned_to = ANY($1) AND deleted_at IS NULL
         GROUP BY assigned_to
         ORDER BY rate DESC NULLS LAST`,
        [activeAgents.map(a => a.agent_id)]
    );

    // Build sorted list: agents with performance data first, then uncounted
    const rateMap = new Map<string, number>();
    for (const row of perfResult.rows) {
        rateMap.set(row.agent_id, parseFloat(row.rate) || 0);
    }
    const sorted = [...activeAgents].sort((a, b) => {
        return (rateMap.get(b.agent_id) || 0) - (rateMap.get(a.agent_id) || 0);
    });

    // Same quota logic as round robin
    let currentIndex = cfg.state.current_index || 0;
    let currentCount = cfg.state.current_count || 0;

    if (currentIndex >= sorted.length) {
        currentIndex = 0;
        currentCount = 0;
    }

    const agent = sorted[currentIndex];
    const quota = agent.quota || 10;

    await doAssign(orderId, agent.agent_id);

    currentCount++;
    if (currentCount >= quota) {
        currentIndex = (currentIndex + 1) % sorted.length;
        currentCount = 0;
    }

    await pool.query(
        `UPDATE assignment_config SET state = $1, updated_at = NOW()`,
        [JSON.stringify({ current_index: currentIndex, current_count: currentCount })]
    );

    return agent.agent_id;
}

// ── Helpers ──

async function filterAvailableAgents(agentIds: string[]): Promise<string[]> {
    const result = await pool.query(
        `SELECT u.id FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = ANY($1)
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND (u.is_available IS NULL OR u.is_available = true)`,
        [agentIds]
    );
    return result.rows.map((r: any) => r.id);
}

async function doAssign(orderId: string, agentId: string): Promise<void> {
    // Deactivate existing assignment
    await pool.query(
        `UPDATE order_assignments SET is_active = false, unassigned_at = NOW()
         WHERE order_id = $1 AND is_active = true`,
        [orderId]
    );

    // Create new assignment
    await pool.query(
        `INSERT INTO order_assignments (order_id, agent_id, assigned_by, assigned_at, is_active)
         VALUES ($1, $2, NULL, NOW(), true)
         ON CONFLICT DO NOTHING`,
        [orderId, agentId]
    );

    await pool.query(
        `UPDATE orders SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
        [agentId, orderId]
    );
}

/**
 * Manually assign an order to a specific agent.
 */
export async function manualAssign(
    orderId: string,
    agentId: string,
    assignedBy: string
): Promise<void> {
    await pool.query(
        `UPDATE order_assignments SET is_active = false, unassigned_at = NOW()
         WHERE order_id = $1 AND is_active = true`,
        [orderId]
    );

    await pool.query(
        `INSERT INTO order_assignments (order_id, agent_id, assigned_by, assigned_at, is_active)
         VALUES ($1, $2, $3, NOW(), true)`,
        [orderId, agentId, assignedBy]
    );

    await pool.query(
        `UPDATE orders SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
        [agentId, orderId]
    );
}
