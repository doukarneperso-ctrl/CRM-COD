/**
 * Normalize any Moroccan phone number to +212XXXXXXXXX format
 */
export function normalizePhone(phone: string): string {
    // Remove all spaces, dashes, dots
    let cleaned = phone.replace(/[\s\-\.\(\)]/g, '');

    // Handle various Moroccan formats
    if (cleaned.startsWith('00212')) {
        cleaned = '+212' + cleaned.slice(5);
    } else if (cleaned.startsWith('212') && cleaned.length === 12) {
        cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
        cleaned = '+212' + cleaned.slice(1);
    } else if (!cleaned.startsWith('+')) {
        cleaned = '+212' + cleaned;
    }

    return cleaned;
}

/**
 * Validate that a phone number is a valid Moroccan format
 */
export function isValidMoroccanPhone(phone: string): boolean {
    const normalized = normalizePhone(phone);
    return /^\+212[5-8]\d{8}$/.test(normalized);
}
