import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /api/audit - PROTECTED (Admin Only) - trilha de auditoria paginada
router.get('/', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores.' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const action = (req.query.action || '').trim(); // filtro opcional por tipo de ação

    try {
        const where = [];
        const params = [];
        if (action) {
            params.push(action);
            where.push(`action = $${params.length}`);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM audit_log ${whereSql}`, params);
        const total = totalResult.rows[0].total;

        params.push(limit, offset);
        const result = await pool.query(
            `SELECT id, user_email, action, target_type, target_id, target_label, details, ip, created_at
             FROM audit_log ${whereSql}
             ORDER BY created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({
            entries: result.rows,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (err) {
        console.error('Get audit log error:', err);
        res.status(500).json({ message: 'Erro ao buscar trilha de auditoria.' });
    }
});

export default router;
