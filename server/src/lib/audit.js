import pool from '../db.js';

// Grava uma entrada na trilha de auditoria. Nunca lança — auditoria falhar
// não pode derrubar a ação em si. `user` é o payload do JWT (id/email).
export async function logAudit({ user, action, targetType, targetId, targetLabel, details, ip }) {
    try {
        await pool.query(
            `INSERT INTO audit_log (user_id, user_email, action, target_type, target_id, target_label, details, ip)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                user?.id ?? null,
                user?.email ?? null,
                action,
                targetType ?? null,
                targetId != null ? String(targetId) : null,
                targetLabel ?? null,
                details ? JSON.stringify(details) : null,
                ip ?? null,
            ]
        );
    } catch (e) {
        console.error('[AUDIT] Falha ao gravar log:', e.message);
    }
}
