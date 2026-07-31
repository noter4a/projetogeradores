import pool from '../db.js';

const CONTROL_ALLOWED_ROLES = ['ADMIN', 'TECHNICIAN', 'CLIENT'];

export async function assertGeneratorControlAccess(user, generatorId) {
    if (!user) {
        return { allowed: false, status: 401, message: 'Autenticação necessária.' };
    }
    if (!generatorId || typeof generatorId !== 'string' || !generatorId.trim()) {
        return { allowed: false, status: 400, message: 'ID do gerador inválido.' };
    }
    if (!CONTROL_ALLOWED_ROLES.includes(user.role)) {
        return { allowed: false, status: 403, message: 'Acesso negado. Seu perfil não pode controlar geradores.' };
    }
    if (user.role === 'ADMIN') {
        return { allowed: true };
    }

    const trimmedId = generatorId.trim();
    const result = await pool.query(
        `SELECT id, company_id FROM generators
         WHERE id = $1
            OR connection_info->>'ip' = $1
            OR connection_info->>'connectionName' = $1
         LIMIT 1`,
        [trimmedId]
    );

    if (result.rows.length === 0) {
        return { allowed: false, status: 404, message: 'Gerador não encontrado.' };
    }

    const generator = result.rows[0];
    if (
        generator.company_id == null ||
        user.companyId == null ||
        Number(generator.company_id) !== Number(user.companyId)
    ) {
        return { allowed: false, status: 403, message: 'Acesso negado. Gerador não pertence à sua empresa.' };
    }

    return { allowed: true };
}

// Acesso de LEITURA a dados de um gerador (histórico de carga, trajeto GPS, etc.).
// Diferente do controle: não restringe por perfil (qualquer usuário autenticado
// pode ler), mas mantém o isolamento por empresa — ADMIN vê tudo; os demais só
// veem geradores da própria empresa. Evita IDOR (trocar o ID na URL e ver dados
// de outra empresa).
export async function assertGeneratorReadAccess(user, generatorId) {
    if (!user) {
        return { allowed: false, status: 401, message: 'Autenticação necessária.' };
    }
    if (!generatorId || typeof generatorId !== 'string' || !generatorId.trim()) {
        return { allowed: false, status: 400, message: 'ID do gerador inválido.' };
    }
    if (user.role === 'ADMIN') {
        return { allowed: true };
    }

    const result = await pool.query(
        `SELECT company_id FROM generators
         WHERE id = $1
            OR connection_info->>'ip' = $1
            OR connection_info->>'connectionName' = $1
         LIMIT 1`,
        [generatorId.trim()]
    );

    if (result.rows.length === 0) {
        return { allowed: false, status: 404, message: 'Gerador não encontrado.' };
    }

    const generator = result.rows[0];
    if (
        generator.company_id == null ||
        user.companyId == null ||
        Number(generator.company_id) !== Number(user.companyId)
    ) {
        return { allowed: false, status: 403, message: 'Acesso negado. Gerador não pertence à sua empresa.' };
    }

    return { allowed: true };
}
