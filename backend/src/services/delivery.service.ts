import axios from 'axios';
import { query } from '../config/database';

const COLIIX_ENDPOINT = 'https://my.coliix.com/aga/seller/api-parcels';
const FALLBACK_TOKEN = process.env.COLIIX_API_TOKEN || '';

// Cache the token for 5 minutes
let _cachedToken = '';
let _cachedAt = 0;

async function getColiixToken(): Promise<string> {
    if (_cachedToken && Date.now() - _cachedAt < 5 * 60 * 1000) return _cachedToken;
    try {
        const result = await query(`SELECT value FROM system_settings WHERE key = 'coliix_api_token'`);
        if (result.rows.length > 0) {
            const val = result.rows[0].value;
            _cachedToken = typeof val === 'string' ? val : (val?.token || JSON.stringify(val));
            _cachedToken = _cachedToken.replace(/^"|"$/g, ''); // strip JSON quotes
            _cachedAt = Date.now();
            return _cachedToken;
        }
    } catch { /* fall through */ }
    return FALLBACK_TOKEN;
}

// ─── Smart Status Detection ──────────────────────
// Coliix sends status strings like "Livré", "Ramassé", "Expédié", "Refusé", etc.
// We map them to our 3 CRM outcomes.

/**
 * Detect CRM shipping_status from any Coliix status string.
 * Uses keyword matching — works with any status Coliix sends.
 *
 *   "Livré/livr"         → delivered  (triggers commission)
 *   "Refusé/retour/annul" → returned
 *   anything else         → in_transit (still in progress)
 */
export function detectCrmStatus(coliixState: string): 'delivered' | 'returned' | 'in_transit' {
    const s = coliixState.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents: é→e, ô→o

    if (s.includes('livr')) return 'delivered';
    if (s.includes('refus') || s.includes('retour') || s.includes('annul')) return 'returned';
    return 'in_transit';
}

// Keep the old map as a backwards-compat export
export const COLIIX_STATE_MAP: Record<string, string> = {};
export const mapColiixState = detectCrmStatus;

export interface ColiixExportPayload {
    name: string;         // Customer name
    phone: string;        // Customer phone
    merchandise: string;  // Product description
    merchandise_qty: number;
    ville: string;        // City
    adresse: string;      // Address
    note?: string;        // Delivery notes
    price: number;        // COD price (final_amount)
    stock?: number;       // 1 if using stock management
    productSku?: string;  // variant SKU (if stock=1)
}

export interface ColiixHistoryEntry {
    status: string;   // e.g. "Livré", "Ramassé", "Expédié"
    time: string;     // e.g. "2026-03-17 19:25 :49"
    etat?: string;    // payment status e.g. "Payé", "Non Payé"
}

export interface ColiixTrackResult {
    tracking: string;
    state: string;        // Latest Coliix shipping status (e.g. "Livré", "Ramassé")
    crmStatus: string;    // Mapped CRM status
    history: ColiixHistoryEntry[];  // Full tracking history
    datereported?: string;
    note?: string;
}

/**
 * Export an order to Coliix for delivery.
 * Returns the tracking code on success.
 * Coliix API only supports: action=add, action=track
 */
export async function exportOrder(payload: ColiixExportPayload): Promise<string> {
    const formData = new URLSearchParams();
    formData.append('action', 'add');
    formData.append('token', await getColiixToken());
    formData.append('name', payload.name);
    formData.append('phone', payload.phone);
    formData.append('marchandise', payload.merchandise);
    formData.append('marchandise_qty', String(payload.merchandise_qty));
    formData.append('ville', payload.ville);
    formData.append('adresse', payload.adresse || '');
    formData.append('note', payload.note || '');
    formData.append('price', String(payload.price));
    formData.append('stock', '0');

    const response = await axios.post(COLIIX_ENDPOINT, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
    });

    const data = response.data;

    if (data.status !== 200) {
        throw new Error(`Coliix export failed: ${data.msg || JSON.stringify(data)}`);
    }

    const trackingCode = data.tracking;
    if (!trackingCode) {
        throw new Error('Coliix returned no tracking code');
    }

    return trackingCode;
}

/**
 * Track an order by Coliix tracking code.
 * Coliix API action=track
 *
 * Response format:
 * {
 *   "status": true,
 *   "msg": [
 *     { "code": "...", "status": "Nouveau Colis", "time": "2026-03-15 13:17 :11", "etat": "Non Payé", ... },
 *     { "code": "...", "status": "Ramassé",        "time": "2026-03-15 17:33 :12", "etat": "Non Payé", ... },
 *     { "code": "...", "status": "Livré",          "time": "2026-03-17 19:25 :49", "etat": "Payé",     ... }
 *   ],
 *   "tracking": "4-CSA03261186858FB"
 * }
 *
 * data.msg is an ARRAY of history entries. The LAST entry is the current status.
 * Each entry has: .status (shipping status like "Livré"), .etat (payment like "Payé"), .time
 */
export async function trackOrder(trackingCode: string): Promise<ColiixTrackResult> {
    const formData = new URLSearchParams();
    formData.append('action', 'track');
    formData.append('token', await getColiixToken());
    formData.append('tracking', trackingCode);

    const response = await axios.post(COLIIX_ENDPOINT, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
    });

    const data = response.data;

    // data.msg is an array of status history entries
    const msgArray: any[] = Array.isArray(data.msg) ? data.msg : [];
    const latest = msgArray.length > 0 ? msgArray[msgArray.length - 1] : null;
    const state = latest?.status?.trim() || '';
    const crmStatus = detectCrmStatus(state);

    return {
        tracking: trackingCode,
        state,
        crmStatus,
        history: msgArray.map((m: any) => ({
            status: (m.status || '').trim(),
            time: (m.time || '').trim(),
            etat: m.etat,
        })),
        datereported: latest?.time?.trim() || '',
        note: '',
    };
}
