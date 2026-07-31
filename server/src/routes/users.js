import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { logAudit } from '../lib/audit.js';

const router = express.Router();

// GET /api/users - PROTECTED (Admin Only)
router.get('/', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, u.role, u.assigned_generators, u.company_id, u.phone, u.whatsapp_alerts, u.email_alerts, c.name as company_name, u.created_at
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            ORDER BY u.created_at DESC
        `);
        res.json(result.rows.map(user => ({
            ...user,
            companyId: user.company_id,
            companyName: user.company_name,
            assignedGeneratorIds: user.assigned_generators || [], // Map DB field to frontend expected prop
            phone: user.phone,
            whatsappAlerts: user.whatsapp_alerts,
            emailAlerts: user.email_alerts
        })));
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ message: 'Erro ao buscar usuários.' });
    }
});

// PUT /api/users/:id - PROTECTED (Admin Only)
router.put('/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    const { id } = req.params;
    // newPassword: renomeado de credentials_password (nome antigo confundiu o
    // pentest, fazendo parecer credencial de dispositivo/Modbus — é só a senha
    // de login do próprio usuário).
    const { name, email, role, assignedGeneratorIds, newPassword, companyId, phone, whatsappAlerts, emailAlerts } = req.body;

    if (newPassword && newPassword.length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    try {
        // Update basic info
        await pool.query(
            "UPDATE users SET name=$1, email=$2, role=$3, assigned_generators=$4, company_id=$5, phone=$6, whatsapp_alerts=$7, email_alerts=$8 WHERE id=$9",
            [name, email, role, assignedGeneratorIds || [], companyId || null, phone || null, whatsappAlerts || false, emailAlerts !== undefined ? emailAlerts : true, id]
        );

        // Update password if provided
        if (newPassword) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);
            await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, id]);
        }

        res.json({ message: 'Usuário atualizado com sucesso.' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ message: 'Erro ao atualizar usuário.' });
    }
});

// DELETE /api/users/:id - PROTECTED (Admin Only)
router.delete('/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    const { id } = req.params;
    try {
        // Prevent deleting self (optional but good practice)
        if (req.user.id == id) { // Loose equality for string/int match
            return res.status(400).json({ message: 'Não é possível remover o próprio usuário logado.' });
        }

        const del = await pool.query('DELETE FROM users WHERE id = $1 RETURNING email', [id]);
        logAudit({
            user: req.user,
            action: 'user.delete',
            targetType: 'user',
            targetId: id,
            targetLabel: del.rows[0]?.email,
            ip: req.ip,
        });
        res.json({ message: 'Usuário removido com sucesso.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ message: 'Erro ao remover usuário.' });
    }
});

export default router;
