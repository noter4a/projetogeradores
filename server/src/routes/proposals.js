import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Auto-migrate: create items table if not exists
const ensureItemsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qm_proposta_itens (
        id SERIAL PRIMARY KEY,
        proposta_id INTEGER NOT NULL REFERENCES qm_propostas(id) ON DELETE CASCADE,
        gerador_id INTEGER REFERENCES qm_catalogo_geradores(id),
        quantidade INTEGER NOT NULL DEFAULT 1,
        valor_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
        modelo_custom VARCHAR(255)
      )
    `);
    // Auto-migrate: add modelo_custom if table already exists
    try { await pool.query(`ALTER TABLE qm_proposta_itens ADD COLUMN IF NOT EXISTS modelo_custom VARCHAR(255)`); } catch(e2) {}
  } catch(e) { console.error('Error creating items table:', e.message); }
};
ensureItemsTable();

// GET all proposals (for the historical list)
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.numero_proposta, p.status, p.data_emissao, p.valor_total,
                   c.razao_social as cliente_nome,
                   COALESCE(
                     (SELECT string_agg(COALESCE(pi2.modelo_custom, g2.modelo), ', ') FROM qm_proposta_itens pi2 
                      LEFT JOIN qm_catalogo_geradores g2 ON pi2.gerador_id = g2.id 
                      WHERE pi2.proposta_id = p.id),
                     g.modelo
                   ) as gerador_modelo
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
        
        // Main proposal data
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

        const proposal = result.rows[0];

        // Fetch items
        const itemsQuery = `
            SELECT pi.*, row_to_json(g.*) as gerador_data
            FROM qm_proposta_itens pi
            LEFT JOIN qm_catalogo_geradores g ON pi.gerador_id = g.id
            WHERE pi.proposta_id = $1
            ORDER BY pi.id ASC
        `;
        const itemsResult = await pool.query(itemsQuery, [id]);
        proposal.itens = itemsResult.rows;

        // Retrocompatibilidade: se não tem itens mas tem gerador_id, cria um item virtual
        if (proposal.itens.length === 0 && proposal.gerador_id) {
            proposal.itens = [{
                id: 0,
                proposta_id: proposal.id,
                gerador_id: proposal.gerador_id,
                quantidade: proposal.quantidade || 1,
                valor_unitario: proposal.valor_total / (proposal.quantidade || 1),
                gerador_data: proposal.gerador
            }];
        }

        res.json(proposal);
    } catch (err) {
        console.error('Error fetching proposal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create new proposal
router.post('/', async (req, res) => {
    const {
        cliente_id, gerador_id, motor_id, alternador_id, modulo_id, acessorio_id, dimensao_id, tensao_id,
        quantidade, prazo_entrega, forma_pagamento, frete, ipi, icms, valido_ate, outros_acessorios, valor_total, status,
        itens // NEW: array of { gerador_id, quantidade, valor_unitario }
    } = req.body;

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Auto-migrate
            try {
              await client.query(`ALTER TABLE qm_propostas ADD COLUMN IF NOT EXISTS icms VARCHAR(20)`);
              await client.query(`ALTER TABLE qm_propostas ADD COLUMN IF NOT EXISTS tensao_id INTEGER REFERENCES qm_catalogo_tensoes(id)`);
            } catch(e) {}

            // Calculate proposal number
            const currentYear = new Date().getFullYear();
            const maxQuery = await client.query(`SELECT COALESCE(MAX(nprop), 0) as max_prop FROM qm_propostas WHERE anoprop = $1`, [currentYear]);
            let nprop = parseInt(maxQuery.rows[0].max_prop, 10) + 1;
            const numero_proposta = `${nprop}/${currentYear}`;

            // Calculate total from items if provided
            let calculatedTotal = valor_total;
            if (itens && itens.length > 0) {
                calculatedTotal = itens.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0);
            }

            // Use first gerador_id from items for backward compat
            const mainGeradorId = (itens && itens.length > 0) ? itens[0].gerador_id : gerador_id;
            const mainQuantidade = (itens && itens.length > 0) ? itens[0].quantidade : (quantidade || 1);

            // Insert Proposal
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
                nprop, currentYear, numero_proposta, status || 'RASCUNHO', cliente_id, mainGeradorId, motor_id, alternador_id,
                modulo_id, acessorio_id, dimensao_id, tensao_id || null, mainQuantidade, prazo_entrega, forma_pagamento, frete,
                ipi, icms, valido_ate, outros_acessorios, calculatedTotal
            ];

            const inserted = await client.query(insertQuery, values);
            const proposal = inserted.rows[0];

            // Insert items
            if (itens && itens.length > 0) {
                for (const item of itens) {
                    await client.query(
                        `INSERT INTO qm_proposta_itens (proposta_id, gerador_id, quantidade, valor_unitario, modelo_custom)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [proposal.id, item.gerador_id || null, item.quantidade, item.valor_unitario, item.modelo_custom || null]
                    );
                }
            }

            await client.query('COMMIT');
            res.status(201).json(proposal);
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
        quantidade, prazo_entrega, forma_pagamento, frete, ipi, icms, valido_ate, outros_acessorios, valor_total,
        itens
    } = req.body;

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let calculatedTotal = valor_total;
            if (itens && itens.length > 0) {
                calculatedTotal = itens.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0);
            }

            const mainGeradorId = (itens && itens.length > 0) ? itens[0].gerador_id : gerador_id;
            const mainQuantidade = (itens && itens.length > 0) ? itens[0].quantidade : quantidade;

            const updateQuery = `
                UPDATE qm_propostas SET 
                    status = $1, cliente_id = $2, gerador_id = $3, motor_id = $4, alternador_id = $5,
                    modulo_id = $6, acessorio_id = $7, dimensao_id = $8, tensao_id = $9, quantidade = $10, prazo_entrega = $11,
                    forma_pagamento = $12, frete = $13, ipi = $14, icms = $15, valido_ate = $16, outros_acessorios = $17,
                    valor_total = $18
                WHERE id = $19 RETURNING *
            `;
            const values = [
                status, cliente_id, mainGeradorId, motor_id, alternador_id, modulo_id, acessorio_id, dimensao_id, 
                tensao_id || null, mainQuantidade, prazo_entrega, forma_pagamento, frete, ipi, icms, valido_ate, outros_acessorios, 
                calculatedTotal, id
            ];
            const result = await client.query(updateQuery, values);

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Proposta não encontrada' });
            }

            // Replace items
            if (itens && itens.length > 0) {
                await client.query('DELETE FROM qm_proposta_itens WHERE proposta_id = $1', [id]);
                for (const item of itens) {
                    await client.query(
                        `INSERT INTO qm_proposta_itens (proposta_id, gerador_id, quantidade, valor_unitario, modelo_custom)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [id, item.gerador_id || null, item.quantidade, item.valor_unitario, item.modelo_custom || null]
                    );
                }
            }

            await client.query('COMMIT');
            res.json(result.rows[0]);
        } catch(e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
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
