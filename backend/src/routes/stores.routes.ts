import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import logger from '../utils/logger';
import axios from 'axios';
import {
    buildOAuthUrl,
    exchangeCode,
    verifyWebhookSignature,
    importYouCanOrder,
    processImportedOrder,
    syncRecentOrders,
    fetchYouCanProducts,
    importYouCanProducts,
    getValidToken,
    YouCanOrder,
} from '../services/youcan.service';
import crypto from 'crypto';

const router = Router();

// ─── GET /api/stores/connect ───────────────────────
// Initiates OAuth by returning the YouCan auth URL
router.get('/connect', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/stores/callback`;
    const authUrl = buildOAuthUrl(redirectUri, state);

    // Store state + userId in DB so the callback (which runs in a popup without session) can verify
    await query(
        `INSERT INTO oauth_states (state, user_id, created_at) VALUES ($1, $2, NOW())`,
        [state, req.session.userId]
    );

    res.json({ success: true, authUrl });
});

// ─── GET /api/stores/callback ──────────────────────
// OAuth callback (runs in popup window — NO requireAuth since popup has no session)
router.get('/callback', async (req: Request, res: Response) => {
    const sendResult = (success: boolean, errorMsg?: string) => {
        // Return an HTML page that messages the parent window and closes the popup
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.send(`<!DOCTYPE html>
<html><head><title>YouCan Connection</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa;">
<div style="text-align:center;padding:32px;">
    ${success
                ? '<div style="font-size:48px;">✅</div><h2 style="color:#52c41a;">Store Connected!</h2><p style="color:#888;">This window will close automatically...</p>'
                : `<div style="font-size:48px;">❌</div><h2 style="color:#ff4d4f;">Connection Failed</h2><p style="color:#888;">${errorMsg || 'Unknown error'}</p>`
            }
</div>
<script>
    if (window.opener) {
        window.opener.postMessage({ type: 'youcan-oauth-result', success: ${success} }, '${frontendUrl}');
        setTimeout(() => window.close(), ${success ? 500 : 2000});
    }
</script>
</body></html>`);
    };

    try {
        const { code, state } = req.query as Record<string, string>;

        if (!code || !state) {
            sendResult(false, 'Missing authorization code');
            return;
        }

        logger.info('[YOUCAN OAUTH] Callback received', { code: code?.substring(0, 10) + '...', state: state?.substring(0, 10) + '...' });

        // Verify state from DB (not session) and get the associated userId
        const stateRow = await query(
            `DELETE FROM oauth_states WHERE state = $1 AND created_at > NOW() - INTERVAL '10 minutes' RETURNING user_id`,
            [state]
        );

        if (stateRow.rows.length === 0) {
            logger.warn('[YOUCAN OAUTH] State mismatch or expired', { state });
            sendResult(false, 'OAuth state expired or invalid. Please try again.');
            return;
        }

        const userId = stateRow.rows[0].user_id;

        const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/stores/callback`;
        logger.info('[YOUCAN OAUTH] Exchanging code for token...', { redirectUri });

        const tokenData = await exchangeCode(code, redirectUri);
        logger.info('[YOUCAN OAUTH] Token exchange response keys:', Object.keys(tokenData));

        // YouCan may return different field names — handle flexibly
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token || null;
        const expiresIn = tokenData.expires_in || 86400;
        const storeId = tokenData.store_id || 'unknown';
        const storeName = tokenData.store_name || 'YouCan Store';

        // Save or update the store record
        await query(
            `INSERT INTO stores (name, platform, external_id, access_token, refresh_token, token_expires_at, is_active, created_by, created_at)
             VALUES ($1, 'youcan', $2, $3, $4, NOW() + INTERVAL '${expiresIn} seconds', true, $5, NOW())
             ON CONFLICT (platform, external_id) DO UPDATE SET
               access_token = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               token_expires_at = EXCLUDED.token_expires_at,
               is_active = true,
               deleted_at = NULL,
               updated_at = NOW()`,
            [storeName, storeId, accessToken, refreshToken, userId]
        );

        logger.info('[YOUCAN OAUTH] Store saved successfully', { storeName, storeId });

        sendResult(true);
    } catch (error: any) {
        logger.error('[YOUCAN OAUTH] Callback error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
        });
        sendResult(false, error.response?.data?.message || 'Failed to connect store');
    }
});

// ─── GET /api/stores ───────────────────────────────
router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT id, name, platform, is_active, created_at, last_sync_at, sync_requested_at,
                    (access_token IS NOT NULL) as is_connected
             FROM stores WHERE deleted_at IS NULL ORDER BY created_at DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list stores' } });
    }
});

// ─── PUT /api/stores/:id/sync ──────────────────────
// Trigger an immediate sync for a store
router.put('/:id/sync', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        await query(
            `UPDATE stores SET sync_requested_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
            [req.params.id]
        );
        res.json({ success: true, message: 'Sync scheduled' });
    } catch (e) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to schedule sync' } });
    }
});

// ─── POST /api/stores/:id/sync-orders ──────────────
// Import the last 50 orders from YouCan
router.post('/:id/sync-orders', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const storeId = req.params.id as string;
        const store = await query(
            'SELECT id, field_mapping FROM stores WHERE id = $1 AND deleted_at IS NULL',
            [storeId]
        );
        if (store.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
            return;
        }

        // Get a valid (possibly refreshed) access token
        const accessToken = await getValidToken(storeId);

        const limit = parseInt(req.body.limit as string) || 50;
        const result = await syncRecentOrders(
            storeId,
            accessToken,
            limit,
            store.rows[0].field_mapping || undefined
        );

        await query(
            'UPDATE stores SET last_sync_at = NOW() WHERE id = $1',
            [storeId]
        );

        res.json({ success: true, data: result });
    } catch (error: any) {
        logger.error('Sync orders error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: { code: 'SYNC_FAILED', message: error.response?.data?.message || 'Failed to sync orders' } });
    }
});

// ─── GET /api/stores/:id/checkout-fields ───────────
// Fetch active checkout fields from the connected YouCan store
router.get('/:id/checkout-fields', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const storeId = req.params.id as string;
        const storeCheck = await query('SELECT id FROM stores WHERE id = $1 AND deleted_at IS NULL', [storeId]);
        if (storeCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
            return;
        }

        const accessToken = await getValidToken(storeId);
        const response = await axios.get('https://api.youcan.shop/settings/checkout/fields/', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Filter to only enabled fields and return their name + display_name
        const allFields = response.data || [];
        const enabledFields = allFields
            .filter((f: any) => f.enabled === true)
            .map((f: any) => ({
                name: f.name,
                display_name: f.display_name,
                type: f.type,
                required: f.required,
                custom: f.custom || false,
            }));

        res.json({ success: true, data: enabledFields });
    } catch (error: any) {
        logger.error('Fetch checkout fields error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: 'Failed to fetch checkout fields from YouCan' } });
    }
});

// ─── GET /api/stores/:id/youcan-products ───────────
// Browse products from the connected YouCan store
router.get('/:id/youcan-products', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const storeId = req.params.id as string;
        const storeCheck = await query('SELECT id FROM stores WHERE id = $1 AND deleted_at IS NULL', [storeId]);
        if (storeCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
            return;
        }

        const accessToken = await getValidToken(storeId);
        const page = parseInt(req.query.page as string) || 1;
        const result = await fetchYouCanProducts(accessToken, page, true);

        res.json({ success: true, data: result });
    } catch (error: any) {
        logger.error('Fetch YouCan products error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: 'Failed to fetch products from YouCan' } });
    }
});

// ─── POST /api/stores/:id/import-products ──────────
// Import selected products from YouCan into CRM
router.post('/:id/import-products', requireAuth, requirePermission('manage_settings'), async (req: Request, res: Response) => {
    try {
        const { productIds } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'productIds array is required' } });
            return;
        }

        const storeId = req.params.id as string;
        const storeCheck = await query('SELECT id FROM stores WHERE id = $1 AND deleted_at IS NULL', [storeId]);
        if (storeCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
            return;
        }

        const accessToken = await getValidToken(storeId);
        const result = await importYouCanProducts(storeId, accessToken, productIds);

        res.json({ success: true, data: result });
    } catch (error: any) {
        logger.error('Import products error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: { code: 'IMPORT_FAILED', message: 'Failed to import products' } });
    }
});

// ─── POST /webhooks/youcan ─────────────────────────
// Registered in app.ts — public endpoint with HMAC verification
export async function handleYouCanWebhook(req: Request, res: Response): Promise<void> {
    try {
        const signature = req.headers['x-youcan-signature'] as string;
        const rawBody = JSON.stringify(req.body);

        if (!signature || !verifyWebhookSignature(rawBody, signature)) {
            logger.warn('[YOUCAN WEBHOOK] Invalid signature');
            res.status(401).send('Unauthorized');
            return;
        }

        const { event, data, store_id } = req.body;

        logger.info(`[YOUCAN WEBHOOK] Event: ${event} | Store: ${store_id}`);

        if (event === 'order.created' || event === 'order.updated') {
            const youcanOrder = data as YouCanOrder;
            const { orderId, isNew } = await importYouCanOrder(youcanOrder, store_id);

            if (isNew) {
                await processImportedOrder(orderId, store_id);
            }

        } else if (event === 'inventory.low') {
            // Notify managers of low stock alert
            logger.info(`[YOUCAN WEBHOOK] Low inventory alert for store: ${store_id}`);
            // Notification handled by stock.service lowStock monitor
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('[YOUCAN WEBHOOK] Error:', error);
        res.status(500).send('Error');
    }
}

export default router;
