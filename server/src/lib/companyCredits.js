import pool from '../db.js';

// --- CREDIT SYSTEM: daily debit reconciliation (fixed Brasília midnight cutoff) ---
// Brasília has used a fixed UTC-3 offset with no DST since 2019, so a plain
// 3-hour subtraction from UTC is enough to derive the correct calendar date.
export function getBrasiliaDateString() {
    const brasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
    return brasilia.toISOString().slice(0, 10);
}

// Debits 1 credit per elapsed Brasília day since each company's last debit.
// Uses a date-diff UPDATE (not a fixed decrement) so it self-heals after any
// server downtime spanning multiple midnights, and is idempotent within the
// same day since the WHERE clause only matches companies already behind.
export async function reconcileCompanyCredits() {
    try {
        const today = getBrasiliaDateString();
        const result = await pool.query(
            `UPDATE companies
             SET credits = GREATEST(0, credits - ($1::date - last_credit_debit_date)),
                 last_credit_debit_date = $1::date
             WHERE last_credit_debit_date < $1::date
             RETURNING id, name, credits`,
            [today]
        );
        if (result.rows.length > 0) {
            console.log(`Credit reconciliation (${today}): debited ${result.rows.length} company(ies) -`,
                result.rows.map(r => `${r.name}=${r.credits}`).join(', '));
        }
    } catch (e) {
        console.error('Credit reconciliation error:', e.message);
    }
}
