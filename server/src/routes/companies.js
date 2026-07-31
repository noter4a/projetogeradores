import express from 'express';
import pool from '../db.js';
import { logAudit } from '../lib/audit.js';

const router = express.Router();

// GET /api/companies - PROTECTED (All authenticated users can list)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM companies ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Get companies error:', err);
        res.status(500).json({ message: 'Erro ao buscar empresas.' });
    }
});

// POST /api/companies - PROTECTED (Admin Only)
router.post('/', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem criar empresas.' });
    }
    const { name, generatorIds, userIds } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Nome da empresa é obrigatório.' });
    }
    try {
        const check = await pool.query('SELECT * FROM companies WHERE name = $1', [name]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: 'Empresa com este nome já existe.' });
        }
        const result = await pool.query('INSERT INTO companies (name) VALUES ($1) RETURNING *', [name]);
        const newCompany = result.rows[0];

        if (generatorIds && Array.isArray(generatorIds) && generatorIds.length > 0) {
            await pool.query(
                'UPDATE generators SET company_id = $1 WHERE id = ANY($2)',
                [newCompany.id, generatorIds]
            );
        }

        if (userIds && Array.isArray(userIds) && userIds.length > 0) {
            await pool.query(
                'UPDATE users SET company_id = $1 WHERE id = ANY($2)',
                [newCompany.id, userIds]
            );
        }

        logAudit({
            user: req.user,
            action: 'company.create',
            targetType: 'company',
            targetId: newCompany.id,
            targetLabel: newCompany.name,
            ip: req.ip,
        });
        res.status(201).json(newCompany);
    } catch (err) {
        console.error('Create company error:', err);
        res.status(500).json({ message: 'Erro ao criar empresa.' });
    }
});

// PUT /api/companies/:id - PROTECTED (Admin Only)
router.put('/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem atualizar empresas.' });
    }
    const { id } = req.params;
    const { name, generatorIds, userIds } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Nome da empresa é obrigatório.' });
    }
    try {
        const check = await pool.query('SELECT * FROM companies WHERE name = $1 AND id <> $2', [name, id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: 'Outra empresa com este nome já existe.' });
        }
        const result = await pool.query('UPDATE companies SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }

        // 1. Remove company_id from generators that are no longer selected
        if (generatorIds && Array.isArray(generatorIds)) {
            await pool.query(
                'UPDATE generators SET company_id = NULL WHERE company_id = $1 AND NOT (id = ANY($2))',
                [id, generatorIds]
            );
            // 2. Associate new generators
            if (generatorIds.length > 0) {
                await pool.query(
                    'UPDATE generators SET company_id = $1 WHERE id = ANY($2)',
                    [id, generatorIds]
                );
            }
        } else {
            await pool.query('UPDATE generators SET company_id = NULL WHERE company_id = $1', [id]);
        }

        // Mesma lógica pros usuários: desvincula quem foi desmarcado, associa os
        // selecionados. Não mexe em ADMIN/ORCAMENTOS que não têm empresa (esses
        // simplesmente nunca aparecem marcados na lista, então não são afetados).
        if (userIds && Array.isArray(userIds)) {
            await pool.query(
                'UPDATE users SET company_id = NULL WHERE company_id = $1 AND NOT (id = ANY($2))',
                [id, userIds]
            );
            if (userIds.length > 0) {
                await pool.query(
                    'UPDATE users SET company_id = $1 WHERE id = ANY($2)',
                    [id, userIds]
                );
            }
        } else {
            await pool.query('UPDATE users SET company_id = NULL WHERE company_id = $1', [id]);
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update company error:', err);
        res.status(500).json({ message: 'Erro ao atualizar empresa.' });
    }
});

// PATCH /api/companies/:id/credits - PROTECTED (Admin Only) - Add credits to a company (e.g. plan renewal)
router.patch('/:id/credits', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem adicionar créditos.' });
    }
    const { id } = req.params;
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
        return res.status(400).json({ message: 'Quantidade de créditos inválida.' });
    }
    try {
        const result = await pool.query(
            'UPDATE companies SET credits = GREATEST(0, credits + $1) WHERE id = $2 RETURNING *',
            [amount, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        const company = result.rows[0];
        logAudit({
            user: req.user,
            action: amount >= 0 ? 'company.credits.add' : 'company.credits.remove',
            targetType: 'company',
            targetId: id,
            targetLabel: company.name,
            details: { amount, newBalance: company.credits },
            ip: req.ip,
        });
        res.json(company);
    } catch (err) {
        console.error('Update company credits error:', err);
        res.status(500).json({ message: 'Erro ao atualizar créditos da empresa.' });
    }
});

// DELETE /api/companies/:id - PROTECTED (Admin Only)
router.delete('/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem remover empresas.' });
    }
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        logAudit({
            user: req.user,
            action: 'company.delete',
            targetType: 'company',
            targetId: id,
            targetLabel: result.rows[0].name,
            ip: req.ip,
        });
        res.json({ message: 'Empresa removida com sucesso.' });
    } catch (err) {
        console.error('Delete company error:', err);
        res.status(500).json({ message: 'Erro ao remover empresa.' });
    }
});

export default router;
