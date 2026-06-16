import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /api/alarms - Fetch History
router.get('/', async (req, res) => {
    try {
        const { generatorId, activeOnly } = req.query;
        let query = `
            SELECT a.*, COALESCE(g.name, g2.name) AS generator_name 
            FROM alarm_history a 
            LEFT JOIN generators g ON a.generator_id = g.id
            LEFT JOIN generators g2 ON a.generator_id = g2.connection_info->>'ip'
        `;
        const values = [];
        const conditions = [];

        if (generatorId) {
            values.push(generatorId);
            conditions.push(`a.generator_id = $${values.length}`);
        }

        if (activeOnly === 'true') {
            conditions.push(`a.end_time IS NULL`);
        } else if (activeOnly === 'unacknowledged') {
            conditions.push(`a.end_time IS NULL AND a.acknowledged = FALSE`);
        }

        // Filter by company_id if user is not admin
        if (req.user && req.user.role !== 'ADMIN') {
            values.push(req.user.companyId || -1);
            conditions.push(`(g.company_id = $${values.length} OR g2.company_id = $${values.length})`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        query += ` ORDER BY a.start_time DESC LIMIT 100`;

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching alarms:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/alarms/:id/ack - Acknowledge Alarm
router.post('/:id/ack', async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.user) {
            return res.status(401).json({ error: 'Autenticação necessária.' });
        }

        // Locate the alarm and resolve the owning company (match by generator id or modem IP)
        const alarmResult = await pool.query(
            `SELECT a.id, COALESCE(g.company_id, g2.company_id) AS company_id
             FROM alarm_history a
             LEFT JOIN generators g ON a.generator_id = g.id
             LEFT JOIN generators g2 ON a.generator_id = g2.connection_info->>'ip'
             WHERE a.id = $1`,
            [id]
        );

        if (alarmResult.rows.length === 0) {
            return res.status(404).json({ error: 'Alarme não encontrado.' });
        }

        // Non-admins can only acknowledge alarms from their own company
        if (req.user.role !== 'ADMIN') {
            const alarmCompanyId = alarmResult.rows[0].company_id;
            if (
                alarmCompanyId == null ||
                req.user.companyId == null ||
                Number(alarmCompanyId) !== Number(req.user.companyId)
            ) {
                return res.status(403).json({ error: 'Acesso negado. Alarme não pertence à sua empresa.' });
            }
        }

        // Trust the authenticated identity, never the request body
        const userResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
        const acknowledgedBy = userResult.rows[0]?.name || userResult.rows[0]?.email || req.user.email || 'Desconhecido';

        await pool.query(
            `UPDATE alarm_history 
             SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $2 
             WHERE id = $1`,
            [id, acknowledgedBy]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error acknowledging alarm:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/alarms/:id - Remove single alarm record (ADMIN only)
router.delete('/:id', async (req, res) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Somente administradores podem deletar alarmes.' });
    }
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM alarm_history WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting alarm:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/alarms/clear - Clear History (ADMIN only)
router.post('/clear', async (req, res) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Somente administradores podem limpar o histórico.' });
    }
    try {
        const { generatorId, clearAll } = req.body;
        if (generatorId) {
            await pool.query(`DELETE FROM alarm_history WHERE generator_id = $1`, [generatorId]);
        } else if (clearAll) {
            // Clear EVERYTHING including active alarms
            await pool.query(`DELETE FROM alarm_history`);
        } else {
            // Clear only resolved alarms (default safe clear)
            await pool.query(`DELETE FROM alarm_history WHERE end_time IS NOT NULL`);
        }
        res.json({ success: true, message: 'History cleared' });
    } catch (err) {
        console.error('Error clearing history:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
