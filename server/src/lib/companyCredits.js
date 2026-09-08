import pool from '../db.js';

// --- SUBSCRIPTION EXPIRY SYSTEM ---
// Brasília has used a fixed UTC-3 offset with no DST since 2019, so a plain
// 3-hour subtraction from UTC is enough to derive the correct calendar date.
export function getBrasiliaDateString() {
    const brasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
    return brasilia.toISOString().slice(0, 10);
}

// Legacy: kept for backward compat but no longer debits credits.
// The subscription model uses subscription_expires_at instead.
export async function reconcileCompanyCredits() {
    try {
        const today = getBrasiliaDateString();
        // Log companies whose subscription has expired (for monitoring)
        const result = await pool.query(
            `SELECT id, name, subscription_expires_at
             FROM companies
             WHERE subscription_expires_at IS NOT NULL AND subscription_expires_at < $1::date`,
            [today]
        );
        if (result.rows.length > 0) {
            console.log(`Subscription check (${today}): ${result.rows.length} company(ies) expired -`,
                result.rows.map(r => `${r.name} (expired ${r.subscription_expires_at})`).join(', '));
        }
    } catch (e) {
        console.error('Subscription reconciliation error:', e.message);
    }
}