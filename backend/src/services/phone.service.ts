/**
 * Phone normalization service
 * All phones stored as +212XXXXXXXXX (Moroccan format)
 */

export function normalizePhone(phone: string): string {
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '');

    // Handle different input formats
    if (digits.startsWith('212') && digits.length === 12) {
        // Already 212XXXXXXXXX
        return '+' + digits;
    }

    if (digits.startsWith('00212') && digits.length >= 12) {
        // 00212XXXXXXXXX
        return '+' + digits.slice(2);
    }

    if ((digits.startsWith('06') || digits.startsWith('07') || digits.startsWith('05')) && digits.length === 10) {
        // 06XXXXXXXX or 07XXXXXXXX
        return '+212' + digits.slice(1);
    }

    if (digits.startsWith('6') && digits.length === 9) {
        // 6XXXXXXXX (missing leading 0)
        return '+212' + digits;
    }

    // Return as-is with + prefix if already has country code
    if (digits.length >= 11) {
        return '+' + digits;
    }

    // Fallback: return original stripped
    return '+212' + digits;
}

export function isValidMoroccanPhone(phone: string): boolean {
    const normalized = normalizePhone(phone);
    // +212 followed by 9 digits starting with 6 or 7
    return /^\+2126[0-9]{8}$/.test(normalized) || /^\+2127[0-9]{8}$/.test(normalized) || /^\+2125[0-9]{8}$/.test(normalized);
}
