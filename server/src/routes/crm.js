import express from 'express';
import pool from '../db.js';

const router = express.Router();

// --- Clientes (CRM) ---
// GET all
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM qm_clientes ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new
router.post('/', async (req, res) => {
    const { razao_social, cnpj_cpf, ie, endereco, bairro, cep, uf, municipio, contato, fones, email, representante } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_clientes (razao_social, cnpj_cpf, ie, endereco, bairro, cep, uf, municipio, contato, fones, email, representante) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [razao_social, cnpj_cpf, ie, endereco, bairro, cep, uf, municipio, contato, fones, email, representante]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { razao_social, cnpj_cpf, ie, endereco, bairro, cep, uf, municipio, contato, fones, email, representante } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_clientes SET 
                razao_social = $1, cnpj_cpf = $2, ie = $3, endereco = $4, bairro = $5, cep = $6, uf = $7, 
                municipio = $8, contato = $9, fones = $10, email = $11, representante = $12
             WHERE id = $13 RETURNING *`,
            [razao_social, cnpj_cpf, ie, endereco, bairro, cep, uf, municipio, contato, fones, email, representante, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Warning: This could fail if there are active proposals linked to this client (foreign key).
        await pool.query('DELETE FROM qm_clientes WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        if (err.code === '23503') { // foreign_key_violation
             return res.status(400).json({ error: 'Não é possível excluir o cliente pois existem propostas vinculadas a ele.' });
        }
        res.status(500).json({ error: err.message });
    }
});

export default router;
