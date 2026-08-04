import express from 'express';
import pool from '../db.js';
import { logAudit } from '../lib/audit.js';
import { getCatalogGroupedByCategory, VALID_WARNING_KEYS, mapRawControllerToCatalogCode } from '../data/warning-catalog.js';

const router = express.Router();

// ADMIN vê/edita a configuração de qualquer empresa; um usuário de empresa
// (CLIENT/TECHNICIAN/MONITOR etc, com companyId setado) só a da própria
// empresa — mesma régua de isolamento usada em lib/accessControl.js.
function requireOwnCompanyOrAdmin(req, res, next) {
    const { companyId } = req.params;
    if (req.user?.role === 'ADMIN') return next();
    if (req.user?.companyId != null && Number(req.user.companyId) === Number(companyId)) return next();
    return res.status(403).json({ message: 'Acesso negado. Você só pode configurar Avisos da sua própria empresa.' });
}

// GET /api/company-warnings/catalog — lista completa de Avisos disponíveis,
// agrupada por categoria. Qualquer usuário autenticado pode ler (é só
// referência estática, não revela nada sensível de uma empresa específica).
router.get('/catalog', (req, res) => {
    res.json({ categories: getCatalogGroupedByCategory() });
});

// GET /api/company-warnings/:companyId — Avisos habilitados hoje pra essa empresa,
// mais quais controladores (KVA/SGC120/SGC420/DSE/CUMMINS) essa empresa de fato
// tem cadastrado — o front usa isso pra só mostrar os avisos aplicáveis.
router.get('/:companyId', requireOwnCompanyOrAdmin, async (req, res) => {
    const { companyId } = req.params;
    try {
        const companyResult = await pool.query('SELECT enabled_warnings FROM companies WHERE id = $1', [companyId]);
        if (companyResult.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        const generatorsResult = await pool.query(
            `SELECT DISTINCT connection_info->>'controller' AS controller FROM generators WHERE company_id = $1`,
            [companyId]
        );
        const installedControllers = [...new Set(
            generatorsResult.rows
                .map(row => mapRawControllerToCatalogCode(row.controller))
                .filter(Boolean)
        )];
        res.json({
            enabledWarnings: companyResult.rows[0].enabled_warnings || [],
            installedControllers,
        });
    } catch (err) {
        console.error('Get company warnings error:', err);
        res.status(500).json({ message: 'Erro ao buscar configuração de avisos.' });
    }
});

// PUT /api/company-warnings/:companyId — substitui a lista de Avisos habilitados.
// Ignora silenciosamente qualquer key que não exista no catálogo (evita gravar
// lixo se o catálogo mudar de versão entre o front carregar e o usuário salvar).
router.put('/:companyId', requireOwnCompanyOrAdmin, async (req, res) => {
    const { companyId } = req.params;
    const { enabledWarnings } = req.body;

    if (!Array.isArray(enabledWarnings)) {
        return res.status(400).json({ message: 'enabledWarnings deve ser uma lista.' });
    }

    const validKeys = [...new Set(enabledWarnings.filter(key => VALID_WARNING_KEYS.has(key)))];

    try {
        const result = await pool.query(
            'UPDATE companies SET enabled_warnings = $1::jsonb WHERE id = $2 RETURNING id, name, enabled_warnings',
            [JSON.stringify(validKeys), companyId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        const company = result.rows[0];
        logAudit({
            user: req.user,
            action: 'company.warnings.update',
            targetType: 'company',
            targetId: companyId,
            targetLabel: company.name,
            details: { count: validKeys.length },
            ip: req.ip,
        });
        res.json({ enabledWarnings: company.enabled_warnings || [] });
    } catch (err) {
        console.error('Update company warnings error:', err);
        res.status(500).json({ message: 'Erro ao salvar configuração de avisos.' });
    }
});

export default router;
