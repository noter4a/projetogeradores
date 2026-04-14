import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const pool = new Pool({
    user: process.env.DB_USER || 'ciklo',
    password: process.env.DB_PASSWORD || 'ciklopass',
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ciklodb'
});

async function run() {
    try {
        const raw = fs.readFileSync('xlsm_summary.json', 'utf8');
        const json = JSON.parse(raw);
        const data = json.data;

        // Truncate tables
        console.log('Limpando tabelas do catálogo...');
        await pool.query(`TRUNCATE TABLE qm_catalogo_geradores, qm_catalogo_motores, qm_catalogo_alternadores, qm_catalogo_modulos, qm_catalogo_acessorios, qm_catalogo_dimensao RESTART IDENTITY CASCADE`);

        // GERADORES
        if (data.GERADORES) {
            console.log('Inserindo GERADORES...');
            for (let i = 1; i < data.GERADORES.length; i++) {
                const row = data.GERADORES[i].data;
                if (!row[0]) continue;
                const modelo = row[0] || '';
                const descricao = row[1] || '';
                const unidade = row[2] || 'UN';
                const base_val = row[3] || 0;
                const protecao = row[4] || '';
                const finame = row[5] || '';
                const mda = row[6] || '';
                const tensoes = row[8] || '';

                await pool.query(
                    `INSERT INTO qm_catalogo_geradores (modelo, descricao, unidade, valor_unitario, protecao, tensoes, finame, mda) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [modelo, descricao, unidade, base_val, protecao, tensoes, finame, mda]
                );
            }
        }

        // MOTORES
        if (data.MOTORES) {
            console.log('Inserindo MOTORES...');
            for (let i = 1; i < data.MOTORES.length; i++) {
                const row = data.MOTORES[i].data;
                if (!row[0]) continue;
                await pool.query(
                    `INSERT INTO qm_catalogo_motores (modelo, descricao, protecao) VALUES ($1, $2, $3)`,
                    [row[0] || '', row[1] || '', row[2] || '']
                );
            }
        }

        // ALTERNADORES
        if (data.ALTERNADORES) {
            console.log('Inserindo ALTERNADORES...');
            for (let i = 1; i < data.ALTERNADORES.length; i++) {
                const row = data.ALTERNADORES[i].data;
                if (!row[0]) continue;
                await pool.query(
                    `INSERT INTO qm_catalogo_alternadores (modelo, descricao) VALUES ($1, $2)`,
                    [row[0] || '', row[1] || '']
                );
            }
        }

        // MÓDULOS
        if (data['MÓDULOS']) {
            console.log('Inserindo MÓDULOS...');
            for (let i = 1; i < data['MÓDULOS'].length; i++) {
                const row = data['MÓDULOS'][i].data;
                if (!row[0]) continue;
                await pool.query(
                    `INSERT INTO qm_catalogo_modulos (modelo, descricao) VALUES ($1, $2)`,
                    [row[0] || '', row[1] || '']
                );
            }
        }

        // ACESSÓRIOS
        if (data['ACESSÓRIOS']) {
            console.log('Inserindo ACESSÓRIOS...');
            for (let i = 1; i < data['ACESSÓRIOS'].length; i++) {
                const row = data['ACESSÓRIOS'][i].data;
                if (!row[0]) continue;
                await pool.query(
                    `INSERT INTO qm_catalogo_acessorios (grupo, itens_incluidos) VALUES ($1, $2)`,
                    [row[0] || '', row[1] || '']
                );
            }
        }

        // DIMENSIONAMENTO
        if (data.DIMENSIONAMENTO) {
            console.log('Inserindo DIMENSIONAMENTO...');
            for (let i = 1; i < data.DIMENSIONAMENTO.length; i++) {
                const row = data.DIMENSIONAMENTO[i].data;
                if (!row[0]) continue;
                await pool.query(
                    `INSERT INTO qm_catalogo_dimensao (id_dimensionamento, dimensoes) VALUES ($1, $2)`,
                    [row[0] || '', row[1] || '']
                );
            }
        }

        console.log('Dados importados com sucesso!');
    } catch (e) {
        console.error('Erro na importação:', e);
    } finally {
        pool.end();
    }
}

run();
