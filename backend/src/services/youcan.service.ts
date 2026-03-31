import crypto from 'crypto';
import axios from 'axios';
import { query, transaction } from '../config/database';
import { normalizePhone } from '../utils/phone';
import { autoAssignOrder } from './assignment.service';
import { createNotification, notifyManagers } from './notification.service';
import logger from '../utils/logger';

const YOUCAN_CLIENT_ID = process.env.YOUCAN_CLIENT_ID || '1091';
const YOUCAN_CLIENT_SECRET = process.env.YOUCAN_CLIENT_SECRET || '9n0SzVzlWkpNk3m7QIu3Lm55lGTFRqca';
const YOUCAN_API_BASE = 'https://api.youcan.shop';
const YOUCAN_AUTH_BASE = 'https://seller-area.youcan.shop';

// ── OAuth helpers ──────────────────────────────────

export function buildOAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
        client_id: YOUCAN_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        'scope[]': '*',
        state,
    });
    return `${YOUCAN_AUTH_BASE}/admin/oauth/authorize?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    store_id: string;
    store_name: string;
}> {
    const response = await axios.post(`${YOUCAN_AUTH_BASE}/admin/oauth/token`, {
        client_id: YOUCAN_CLIENT_ID,
        client_secret: YOUCAN_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
    });
    return response.data;
}

// ── Token refresh ──────────────────────────────────

export async function refreshAccessToken(storeId: string): Promise<string> {
    const storeRow = await query(
        `SELECT refresh_token FROM stores WHERE id = $1 AND deleted_at IS NULL`,
        [storeId]
    );
    if (storeRow.rows.length === 0 || !storeRow.rows[0].refresh_token) {
        throw new Error('No refresh token available — store needs to be reconnected');
    }

    const refreshToken = storeRow.rows[0].refresh_token;
    logger.info('[YOUCAN] Refreshing access token...', { storeId });

    const response = await axios.post(`${YOUCAN_AUTH_BASE}/admin/oauth/token`, {
        client_id: YOUCAN_CLIENT_ID,
        client_secret: YOUCAN_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });

    const newAccessToken = response.data.access_token;
    const newRefreshToken = response.data.refresh_token || refreshToken;
    const expiresIn = response.data.expires_in || 86400;

    await query(
        `UPDATE stores SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + make_interval(secs => $3), updated_at = NOW()
         WHERE id = $4`,
        [newAccessToken, newRefreshToken, expiresIn, storeId]
    );

    logger.info('[YOUCAN] Token refreshed successfully', { storeId });
    return newAccessToken;
}

/**
 * Get a valid access token for a store, refreshing if expired or about to expire.
 */
export async function getValidToken(storeId: string): Promise<string> {
    const storeRow = await query(
        `SELECT access_token, refresh_token, token_expires_at FROM stores WHERE id = $1 AND deleted_at IS NULL`,
        [storeId]
    );
    if (storeRow.rows.length === 0) throw new Error('Store not found');

    const { access_token, token_expires_at } = storeRow.rows[0];
    const expiresAt = token_expires_at ? new Date(token_expires_at) : null;
    const now = new Date();

    // Refresh if token expires within 5 minutes, or if we don't know when it expires
    if (!expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        try {
            return await refreshAccessToken(storeId);
        } catch (err: any) {
            logger.warn('[YOUCAN] Token refresh failed, trying existing token', { error: err.message });
            // Fall through to return existing token — it may still work
        }
    }

    return access_token;
}

// ── HMAC signature verification ────────────────────

export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    const expected = crypto
        .createHmac('sha256', YOUCAN_CLIENT_SECRET)
        .update(rawBody)
        .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signatureHeader, 'hex')
    );
}

// ── Order import / upsert ──────────────────────────

export interface YouCanOrder {
    token: string;
    status: number;
    note?: string;
    customer?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    shipping_address?: {
        first_name?: string;
        last_name?: string;
        phone?: string;
        city?: string;
        address1?: string;
    };
    line_items?: Array<{
        product_id?: string;
        youcan_variant_id?: string;
        product_name?: string;
        variant_info?: string;
        sku?: string;
        quantity: number;
        price: number;
    }>;
    total_price: number;
    created_at?: string;
}

export async function importYouCanOrder(
    youcanOrder: YouCanOrder,
    storeId: string,
    createdByUserId?: string
): Promise<{ orderId: string; isNew: boolean }> {

    // Dedup: check by source_order_id
    const existing = await query(
        `SELECT id FROM orders WHERE source_order_id = $1 AND store_id = $2 AND deleted_at IS NULL`,
        [youcanOrder.token, storeId]
    );
    if (existing.rows.length > 0) {
        return { orderId: existing.rows[0].id, isNew: false };
    }

    // Normalize customer phone
    const rawPhone = youcanOrder.customer?.phone
        || youcanOrder.shipping_address?.phone
        || '';
    const phone = normalizePhone(rawPhone) || rawPhone;

    const customerName = youcanOrder.customer?.name
        || `${youcanOrder.shipping_address?.first_name ?? ''} ${youcanOrder.shipping_address?.last_name ?? ''}`.trim()
        || 'Unknown';

    const city = youcanOrder.shipping_address?.city || '';
    const address = youcanOrder.shipping_address?.address1 || '';

    return await transaction(async (client) => {
        // Find or create customer
        let customerId: string;
        const phoneNorm = phone ? normalizePhone(phone) : null;
        if (phone) {
            const custResult = await client.query(
                `SELECT id FROM customers WHERE (phone = $1 OR phone_norm = $2) AND deleted_at IS NULL LIMIT 1`,
                [phone, phoneNorm]
            );
            if (custResult.rows.length > 0) {
                customerId = custResult.rows[0].id;
                await client.query(
                    `UPDATE customers SET order_count = order_count + 1 WHERE id = $1`,
                    [customerId]
                );
            } else {
                const newCust = await client.query(
                    `INSERT INTO customers (full_name, phone, phone_norm, email, city, address, order_count, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, 1, NOW()) RETURNING id`,
                    [customerName, phone, phoneNorm, youcanOrder.customer?.email || null, city, address]
                );
                customerId = newCust.rows[0].id;
            }
        } else {
            const newCust = await client.query(
                `INSERT INTO customers (full_name, phone, phone_norm, city, address, order_count, created_at)
                 VALUES ($1, NULL, NULL, $2, $3, 1, NOW()) RETURNING id`,
                [customerName, city, address]
            );
            customerId = newCust.rows[0].id;
        }

        // Generate order number
        const year = new Date().getFullYear().toString().slice(-2);
        const seqResult = await client.query(`SELECT nextval('order_number_seq') as seq`);
        const orderNum = `ORD-${year}-${String(seqResult.rows[0].seq).padStart(5, '0')}`;

        // Create order
        const totalAmt = youcanOrder.total_price || 0;
        let orderCreatedAt: string | null = null;
        if (youcanOrder.created_at) {
            const d = new Date(youcanOrder.created_at);
            orderCreatedAt = isNaN(d.getTime()) ? null : d.toISOString();
        }

        const orderResult = await client.query(
            `INSERT INTO orders (order_number, customer_id, store_id, source, source_order_id,
                                 city, total_amount, final_amount, call_notes,
                                 confirmation_status, shipping_status, created_at)
             VALUES ($1, $2, $3, 'youcan', $4, $5, $6, $6, $7, 'pending', 'not_shipped', COALESCE($8::TIMESTAMP, NOW()))
             RETURNING id`,
            [
                orderNum, customerId, storeId, youcanOrder.token,
                city || '', totalAmt,
                youcanOrder.note || null,
                orderCreatedAt,
            ]
        );
        const orderId = orderResult.rows[0].id;

        // Create order items
        if (youcanOrder.line_items) {
            for (const item of youcanOrder.line_items) {
                // Try to match variant: first by YouCan variant ID (external_id), then by SKU
                let variantId: string | null = null;
                let productName = item.product_name || null;
                let variantInfo = item.variant_info || null;

                // 1. Match by YouCan variant ID → product_variants.external_id
                if (!variantId && item.youcan_variant_id) {
                    const variant = await client.query(
                        `SELECT pv.id, p.name as product_name, pv.size, pv.color
                         FROM product_variants pv
                         JOIN products p ON p.id = pv.product_id
                         WHERE pv.external_id = $1 LIMIT 1`,
                        [item.youcan_variant_id]
                    );
                    if (variant.rows.length > 0) {
                        variantId = variant.rows[0].id;
                        productName = productName || variant.rows[0].product_name;
                        const v = variant.rows[0];
                        variantInfo = variantInfo || [v.size, v.color].filter(Boolean).join(' / ') || null;
                    }
                }

                // 2. Match by YouCan product ID → products.external_id (pick first variant)
                if (!variantId && item.product_id) {
                    const variant = await client.query(
                        `SELECT pv.id, p.name as product_name, pv.size, pv.color
                         FROM product_variants pv
                         JOIN products p ON p.id = pv.product_id
                         WHERE p.external_id = $1 LIMIT 1`,
                        [item.product_id]
                    );
                    if (variant.rows.length > 0) {
                        variantId = variant.rows[0].id;
                        productName = productName || variant.rows[0].product_name;
                        const v = variant.rows[0];
                        variantInfo = variantInfo || [v.size, v.color].filter(Boolean).join(' / ') || null;
                    }
                }

                // 3. Fallback: match by SKU
                if (!variantId && item.sku) {
                    const variant = await client.query(
                        `SELECT pv.id, p.name as product_name, pv.size, pv.color
                         FROM product_variants pv
                         JOIN products p ON p.id = pv.product_id
                         WHERE pv.sku = $1 LIMIT 1`,
                        [item.sku]
                    );
                    if (variant.rows.length > 0) {
                        variantId = variant.rows[0].id;
                        productName = productName || variant.rows[0].product_name;
                        const v = variant.rows[0];
                        variantInfo = variantInfo || [v.size, v.color].filter(Boolean).join(' / ') || null;
                    }
                }

                const itemTotal = (item.price || 0) * (item.quantity || 1);
                await client.query(
                    `INSERT INTO order_items (order_id, variant_id, product_name, variant_info, quantity, unit_price, unit_cost, total, total_price, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7, NOW())`,
                    [orderId, variantId, productName, variantInfo, item.quantity || 1, item.price || 0, itemTotal]
                );
            }
        }

        return { orderId, isNew: true };
    });
}

// ── Auto-assign newly imported YouCan orders ───────

export async function processImportedOrder(orderId: string, storeId: string): Promise<void> {
    try {
        // Build a minimal order object for assignment logic
        const orderResult = await query(
            `SELECT o.id, o.city, oi.variant_id,
                    pv.product_id,
                    (SELECT pc.id FROM product_categories pc
                     JOIN products p2 ON p2.category_id = pc.id WHERE p2.id = pv.product_id LIMIT 1) as category_id
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN product_variants pv ON pv.id = oi.variant_id
             WHERE o.id = $1 LIMIT 1`,
            [orderId]
        );

        if (orderResult.rows.length === 0) return;
        const row = orderResult.rows[0];

        await autoAssignOrder(orderId);

        await notifyManagers({
            type: 'order_assigned', title: 'New YouCan Order',
            message: `A new YouCan order has been imported and assigned`,
            data: { orderId, storeId },
        });
    } catch (err) {
        logger.error('[YOUCAN] Auto-assign failed for order:', orderId, err);
    }
}

// ── Sync recent orders from YouCan ─────────────────

// Resolve a dot-path like "shipping.address.city" from a nested object
function resolvePath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export async function syncRecentOrders(
    storeId: string,
    accessToken: string,
    limit: number = 50,
    fieldMapping?: Record<string, string>
): Promise<{ imported: number; skipped: number; errors: number }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let page = 1;
    const perPage = Math.min(limit, 25);
    let remaining = limit;

    while (remaining > 0) {
        const response = await axios.get(`${YOUCAN_API_BASE}/orders`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                per_page: Math.min(perPage, remaining),
                page,
                include: 'customer,variants,shipping',
                sort: '-created_at',
            },
        });

        const orders = response.data.data;
        if (!orders || orders.length === 0) break;

        for (const ycOrder of orders) {
            try {
                // Extract customer info — YouCan returns first_name/last_name, phone, email
                const cust = ycOrder.customer;
                const ship = ycOrder.shipping;

                // Get shipping address — it's on shipping.address (object with first_name, last_name, phone, city, address_1)
                const shipAddr = ship?.address || {};

                // If field mapping is configured, use it to resolve values
                let customerName: string | undefined;
                let customerPhone: string | undefined;
                let customerEmail: string | undefined;
                let customerCity: string | undefined;
                let customerAddress: string | undefined;

                if (fieldMapping && Object.keys(fieldMapping).length > 0) {
                    // resolveCheckoutField: look up a checkout field name in the order data
                    const resolveCheckoutField = (fieldName: string): string | undefined => {
                        if (!fieldName) return undefined;
                        if (fieldName.includes('.')) return resolvePath(ycOrder, fieldName);
                        return shipAddr?.[fieldName] || cust?.[fieldName] || ycOrder?.[fieldName] || undefined;
                    };

                    const fullNameVal = fieldMapping.full_name ? resolveCheckoutField(fieldMapping.full_name) : undefined;
                    customerPhone = fieldMapping.phone ? resolveCheckoutField(fieldMapping.phone) : undefined;
                    customerCity = fieldMapping.city ? resolveCheckoutField(fieldMapping.city) : undefined;
                    customerAddress = fieldMapping.address ? resolveCheckoutField(fieldMapping.address) : undefined;

                    if (fullNameVal) {
                        customerName = fullNameVal;
                    }
                }

                // Fall back to default mapping when field mapping doesn't provide values
                if (!customerName) {
                    customerName = cust?.first_name
                        ? `${cust.first_name} ${cust.last_name || ''}`.trim()
                        : cust?.name || undefined;
                }
                if (!customerPhone) customerPhone = cust?.phone || shipAddr?.phone || undefined;
                if (!customerEmail) customerEmail = cust?.email || undefined;
                if (!customerCity) customerCity = shipAddr?.city || undefined;
                if (!customerAddress) customerAddress = shipAddr?.address_1 || shipAddr?.address1 || undefined;

                // Map YouCan order format to our importYouCanOrder format
                const mappedOrder: YouCanOrder = {
                    token: ycOrder.id,
                    status: ycOrder.status,
                    note: ycOrder.notes || undefined,
                    customer: {
                        name: customerName || 'Unknown',
                        phone: customerPhone,
                        email: customerEmail,
                    },
                    shipping_address: {
                        first_name: shipAddr?.first_name,
                        last_name: shipAddr?.last_name,
                        phone: shipAddr?.phone,
                        city: customerCity,
                        address1: customerAddress,
                    },
                    line_items: ycOrder.variants?.map((v: any) => ({
                        product_id: v.variant?.product?.id,
                        youcan_variant_id: v.variant?.id || v.variant_id || undefined,
                        product_name: v.variant?.product?.name || v.name || v.variant?.name || undefined,
                        variant_info: v.variant?.name || v.variant?.sku || undefined,
                        sku: v.variant?.sku || '',
                        quantity: v.quantity || 1,
                        price: v.price || 0,
                    })) || [],
                    total_price: ycOrder.total || 0,
                    created_at: ycOrder.created_at,
                };

                const { isNew } = await importYouCanOrder(mappedOrder, storeId);
                if (isNew) {
                    imported++;
                } else {
                    skipped++;
                }
            } catch (err: any) {
                logger.error('[YOUCAN SYNC] Failed to import order:', {
                    orderId: ycOrder.id,
                    error: err.message,
                    detail: err.detail || err.response?.data || undefined,
                });
                errors++;
            }
        }

        remaining -= orders.length;
        const pagination = response.data.meta?.pagination;
        if (!pagination?.links?.next || orders.length < perPage) break;
        page++;
    }

    logger.info(`[YOUCAN SYNC] Completed: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    return { imported, skipped, errors };
}

// ── Fetch YouCan products for browse/import ────────

export async function fetchYouCanProducts(
    accessToken: string,
    page: number = 1,
    fetchAll: boolean = false
): Promise<{ products: any[]; pagination: any }> {
    const perPage = 25;

    if (!fetchAll) {
        // Single page fetch (legacy behavior)
        const response = await axios.get(`${YOUCAN_API_BASE}/products`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { per_page: perPage, page, include: 'variants,images' },
        });
        return {
            products: response.data.data || [],
            pagination: response.data.meta?.pagination || { total: 0, current_page: 1, total_pages: 1 },
        };
    }

    // Auto-paginate: fetch ALL pages
    const allProducts: any[] = [];
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
        const response = await axios.get(`${YOUCAN_API_BASE}/products`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { per_page: perPage, page: currentPage, include: 'variants,images' },
        });

        const products = response.data.data || [];
        allProducts.push(...products);

        const pagination = response.data.meta?.pagination;
        totalPages = pagination?.total_pages || 1;
        currentPage++;

        // Safety cap: max 40 pages (1000 products)
        if (currentPage > 40) break;
    }

    logger.info(`[YOUCAN] Fetched all products: ${allProducts.length} total across ${currentPage - 1} pages`);
    return {
        products: allProducts,
        pagination: { total: allProducts.length, current_page: 1, total_pages: 1 },
    };
}

// ── Import selected YouCan products into CRM ───────

export async function importYouCanProducts(
    storeId: string,
    accessToken: string,
    productIds: string[]
): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const productId of productIds) {
        try {
            // Check if already imported
            const existing = await query(
                'SELECT id FROM products WHERE external_id = $1 AND store_id = $2 AND deleted_at IS NULL',
                [productId, storeId]
            );
            if (existing.rows.length > 0) {
                skipped++;
                continue;
            }

            // Fetch full product details from YouCan
            const response = await axios.get(`${YOUCAN_API_BASE}/products/${productId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { include: 'variants,images' },
            });
            const yp = response.data;

            // Get thumbnail URL
            const imageUrl = yp.thumbnail || yp.images?.[0]?.url || null;

            // Insert product
            const productResult = await query(
                `INSERT INTO products (name, description, image_url, store_id, external_id, is_active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW()) RETURNING id`,
                [
                    yp.name,
                    yp.description || null,
                    imageUrl,
                    storeId,
                    productId,
                ]
            );
            const crmProductId = productResult.rows[0].id;

            // Insert variants
            const variants = yp.variants || [];
            if (variants.length === 0) {
                // No variants — create a default one
                await query(
                    `INSERT INTO product_variants (product_id, sku, price, cost_price, stock, external_id, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
                    [
                        crmProductId,
                        yp.sku || null,
                        yp.price || 0,
                        yp.cost_price || 0,
                        yp.inventory || 0,
                        productId + '_default',
                    ]
                );
            } else {
                for (const variant of variants) {
                    // Extract size/color from variant options
                    const options = variant.values || variant.options || [];
                    const variations = variant.variations || {};
                    let size: string | null = null;
                    let color: string | null = null;

                    // Try to map option names to size/color
                    if (yp.variant_options) {
                        yp.variant_options.forEach((opt: any, i: number) => {
                            const optName = opt.name?.toLowerCase() || '';
                            const val = options[i] || null;
                            if (optName.includes('size') || optName.includes('taille')) {
                                size = val;
                            } else if (optName.includes('color') || optName.includes('couleur')) {
                                color = val;
                            } else if (!size) {
                                size = val; // Use first unknown option as size
                            } else if (!color) {
                                color = val;
                            }
                        });
                    }

                    await query(
                        `INSERT INTO product_variants (product_id, size, color, sku, price, cost_price, stock, external_id, is_active, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())`,
                        [
                            crmProductId,
                            size,
                            color,
                            variant.sku || null,
                            variant.price || yp.price || 0,
                            variant.cost_price || yp.cost_price || 0,
                            variant.inventory || 0,
                            variant.id,
                        ]
                    );
                }
            }

            imported++;
            logger.info(`[YOUCAN IMPORT] Product imported: ${yp.name} (${variants.length} variants)`);
        } catch (err) {
            logger.error('[YOUCAN IMPORT] Failed to import product:', productId, err);
            skipped++;
        }
    }

    return { imported, skipped };
}
