import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /api/alarms - Fetch History
router.get('/', async (req, res) => {
    try {
        const { generatorId, activeOnly } = req.query;
        let query = `SELECT * FROM alarm_history`;
        const values = [];
        const conditions = [];

        if (generatorId) {
            values.push(generatorId);
            conditions.push(`generator_id = $${values.length}`);
        }

        if (activeOnly === 'true') {
            conditions.push(`end_time IS NULL`);
        } else if (activeOnly === 'unacknowledged') {
            conditions.push(`end_time IS NULL AND acknowledged = FALSE`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        query += ` ORDER BY start_time DESC LIMIT 100`;

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
        const { userId } = req.body; // Pass user who acked

        await pool.query(
            `UPDATE alarm_history 
             SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $2 
             WHERE id = $1`,
            [id, userId || 'System']
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error acknowledging alarm:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/alarms/clear - Clear History (Soft or Hard)
router.post('/clear', async (req, res) => {
    try {
        const { generatorId } = req.body;
        if (generatorId) {
            await pool.query(`DELETE FROM alarm_history WHERE generator_id = $1 AND end_time IS NOT NULL`, [generatorId]);
        } else {
            // Clear ALL resolved
            await pool.query(`DELETE FROM alarm_history WHERE end_time IS NOT NULL`);
        }
        res.json({ success: true, message: 'History cleared' });
    } catch (err) {
        console.error('Error clearing history:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
