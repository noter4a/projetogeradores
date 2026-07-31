import express from 'express';
import { sendControlCommand } from '../services/mqtt.js';
import { assertGeneratorControlAccess } from '../lib/accessControl.js';
import { logAudit } from '../lib/audit.js';

const router = express.Router();

// Control Route (HTTP > Socket for reliability) - PROTECTED
router.post('/', async (req, res) => {
    const { generatorId, action } = req.body;

    if (!action || typeof action !== 'string' || !action.trim()) {
        return res.status(400).json({ success: false, message: 'Ação inválida.' });
    }

    try {
        const access = await assertGeneratorControlAccess(req.user, generatorId);
        if (!access.allowed) {
            console.warn(`[API] Control denied for ${req.user?.email}: ${access.message}`);
            return res.status(access.status).json({ success: false, message: access.message });
        }

        console.log(`[API] Received Control Command (HTTP): ${action} for ${generatorId}`);

        const result = sendControlCommand(generatorId, action); // Returns { success, error }

        if (result && result.success) {
            logAudit({
                user: req.user,
                action: 'generator.control',
                targetType: 'generator',
                targetId: generatorId,
                details: { action },
                ip: req.ip,
            });
            res.json({ success: true, message: `Command ${action} sent to ${generatorId}` });
        } else {
            const errorMessage = result?.error || 'Failed to find device or connection.';
            res.status(400).json({ success: false, message: errorMessage });
        }
    } catch (err) {
        console.error('[API] Control Error:', err);
        // FIX: Ensure we return a string message even if err is not a standard Error object
        const finalError = (err && err.message) ? err.message : String(err);
        res.status(500).json({ success: false, error: finalError });
    }
});

export default router;
