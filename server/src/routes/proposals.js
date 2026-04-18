import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET all proposals (for the historical list)
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.numero_proposta, p.status, p.data_emissao, p.valor_total,
                   c.razao_social as cliente_nome, g.modelo as gerador_modelo
            FROM qm_propostas p
            LEFT JOIN qm_clientes c ON p.cliente_id = c.id
            LEFT JOIN qm_catalogo_geradores g ON p.gerador_id = g.id
            ORDER BY p.id DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching proposals:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET single proposal by ID (full join for PDF generation)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                p.*,
                row_to_json(c.*) as cliente,
                row_to_json(g.*) as gerador,
                row_to_json(m.*) as motor,
                row_to_json(a.*) as alternador,
                row_to_json(md.*) as modulo,
                row_to_json(ac.*) as acessorio,
                row_to_json(d.*) as dimensao,
                row_to_json(t.*) as tensao
            FROM qm_propostas p
            LEFT JOIN qm_clientes c ON p.cliente_id = c.id
            LEFT JOIN qm_catalogo_geradores g ON p.gerador_id = g.id
            LEFT JOIN qm_catalogo_motores m ON p.motor_id = m.id
            LEFT JOIN qm_catalogo_alternadores a ON p.alternador_id = a.id
            LEFT JOIN qm_catalogo_modulos md ON p.modulo_id = md.id
            LEFT JOIN qm_catalogo_acessorios ac ON p.acessorio_id = ac.id
            LEFT JOIN qm_catalogo_dimensao d ON p.dimensao_id = d.id
            LEFT JOIN qm_catalogo_tensoes t ON p.tensao_id = t.id
            WHERE p.id = $1
        `;
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proposta não encontrada' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching proposal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create new proposal
router.post('/', async (req, res) => {
    const {
        cliente_id, gerador_id, motor_id, alternador_id, modulo_id, acessorio_id, dimensao_id, tensao_id,
        quantidade, prazo_entrega, forma_pagamento, frete, ipi, icms, valido_ate, outros_acessorios, valor_total, status
    } = req.body;

    const queryRunner = async (client) => {
    // Auto-migrate
    try {
      await pool.query(`ALTER TABLE qm_propostas ADD COLUMN IF NOT EXISTS icms VARCHAR(20)`);
      await pool.query(`ALTER TABLE qm_propostas ADD COLUMN IF NOT EXISTS tensao_id INTEGER REFERENCES qm_catalogo_tensoes(id)`);
    } catch(e) {}

    // 1. Calculate new proposal number (Highest nprop logic)
        const currentYear = new Date().getFullYear();
        const maxQuery = await client.query(`SELECT COALESCE(MAX(nprop), 0) as max_prop FROM qm_propostas WHERE anoprop = $1`, [currentYear]);
        
        let nprop = parseInt(maxQuery.rows[0].max_prop, 10) + 1;
        // The excel showed "902". If it's a new system we can start at 1, but maybe the user wants to jump?
        // We'll let it auto-increment naturally. We can pad it if we want.
        const numero_proposta = `${nprop}/${currentYear}`;

        // 2. Insert Proposal
        const insertQuery = `
            INSERT INTO qm_propostas (
                nprop, anoprop, numero_proposta, status, cliente_id, gerador_id, motor_id, alternador_id, 
                modulo_id, acessorio_id, dimensao_id, tensao_id, quantidade, prazo_entrega, forma_pagamento, frete, 
                ipi, icms, valido_ate, outros_acessorios, valor_total
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
            ) RETURNING *
        `;
        
        const values = [
            nprop, currentYear, numero_proposta, status || 'RASCUNHO', cliente_id, gerador_id, motor_id, alternador_id,
            modulo_id, acessorio_id, dimensao_id, tensao_id || null, quantidade || 1, prazo_entrega, forma_pagamento, frete,
            ipi, icms, valido_ate, outros_acessorios, valor_total
        ];

        const inserted = await client.query(insertQuery, values);
        return inserted.rows[0];
    };

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await queryRunner(client);
            await client.query('COMMIT');
            res.status(201).json(result);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error creating proposal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update Proposal
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        status, cliente_id, gerador_id, motor_id, alternador_id, modulo_id, acessorio_id, dimensao_id, tensao_id,
        quantidade, prazo_entrega, forma_pagamento, frete, ipi, icms, valido_ate, outros_acessorios, valor_total
    } = req.body;

    try {
        const updateQuery = `
            UPDATE qm_propostas SET 
                status = $1, cliente_id = $2, gerador_id = $3, motor_id = $4, alternador_id = $5,
                modulo_id = $6, acessorio_id = $7, dimensao_id = $8, tensao_id = $9, quantidade = $10, prazo_entrega = $11,
                forma_pagamento = $12, frete = $13, ipi = $14, icms = $15, valido_ate = $16, outros_acessorios = $17,
                valor_total = $18
            WHERE id = $19 RETURNING *
        `;
        const values = [
            status, cliente_id, gerador_id, motor_id, alternador_id, modulo_id, acessorio_id, dimensao_id, 
            tensao_id || null, quantidade, prazo_entrega, forma_pagamento, frete, ipi, icms, valido_ate, outros_acessorios, 
            valor_total, id
        ];
        const result = await pool.query(updateQuery, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proposta não encontrada' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating proposal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Proposal
router.delete('/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM qm_propostas WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting proposal:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
