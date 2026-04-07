import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Helper functions for common CRUD operations
const getAll = async (table, res) => {
    try {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const deleteById = async (table, id, res) => {
    try {
        await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        res.status(204).send();
    } catch (err) {
        if (err.code === '23503') { // foregin key violation
            return res.status(400).json({ error: 'Não é possível excluir o item pois existem propostas vinculadas a ele.' });
        }
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------
// GERADORES
// ---------------------------------------------
router.get('/geradores', (req, res) => getAll('qm_catalogo_geradores', res));
router.delete('/geradores/:id', (req, res) => deleteById('qm_catalogo_geradores', req.params.id, res));

router.post('/geradores', async (req, res) => {
    const { modelo, descricao, unidade, valor_unitario, protecao, tensoes, finame, mda } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_catalogo_geradores (modelo, descricao, unidade, valor_unitario, protecao, tensoes, finame, mda) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [modelo, descricao, unidade, valor_unitario, protecao, tensoes, finame, mda]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/geradores/:id', async (req, res) => {
    const { modelo, descricao, unidade, valor_unitario, protecao, tensoes, finame, mda } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_catalogo_geradores SET modelo=$1, descricao=$2, unidade=$3, valor_unitario=$4, protecao=$5, tensoes=$6, finame=$7, mda=$8 WHERE id=$9 RETURNING *`,
            [modelo, descricao, unidade, valor_unitario, protecao, tensoes, finame, mda, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------
// MOTORES
// ---------------------------------------------
router.get('/motores', (req, res) => getAll('qm_catalogo_motores', res));
router.delete('/motores/:id', (req, res) => deleteById('qm_catalogo_motores', req.params.id, res));

router.post('/motores', async (req, res) => {
    const { modelo, descricao, protecao } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_catalogo_motores (modelo, descricao, protecao) VALUES ($1, $2, $3) RETURNING *`,
            [modelo, descricao, protecao]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/motores/:id', async (req, res) => {
    const { modelo, descricao, protecao } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_catalogo_motores SET modelo=$1, descricao=$2, protecao=$3 WHERE id=$4 RETURNING *`,
            [modelo, descricao, protecao, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------
// ALTERNADORES
// ---------------------------------------------
router.get('/alternadores', (req, res) => getAll('qm_catalogo_alternadores', res));
router.delete('/alternadores/:id', (req, res) => deleteById('qm_catalogo_alternadores', req.params.id, res));

router.post('/alternadores', async (req, res) => {
    const { modelo, descricao } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_catalogo_alternadores (modelo, descricao) VALUES ($1, $2) RETURNING *`,
            [modelo, descricao]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/alternadores/:id', async (req, res) => {
    const { modelo, descricao } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_catalogo_alternadores SET modelo=$1, descricao=$2 WHERE id=$3 RETURNING *`,
            [modelo, descricao, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------
// MÓDULOS
// ---------------------------------------------
router.get('/modulos', (req, res) => getAll('qm_catalogo_modulos', res));
router.delete('/modulos/:id', (req, res) => deleteById('qm_catalogo_modulos', req.params.id, res));

router.post('/modulos', async (req, res) => {
    const { modelo, descricao } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_catalogo_modulos (modelo, descricao) VALUES ($1, $2) RETURNING *`,
            [modelo, descricao]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/modulos/:id', async (req, res) => {
    const { modelo, descricao } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_catalogo_modulos SET modelo=$1, descricao=$2 WHERE id=$3 RETURNING *`,
            [modelo, descricao, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------
// ACESSÓRIOS
// ---------------------------------------------
router.get('/acessorios', (req, res) => getAll('qm_catalogo_acessorios', res));
router.delete('/acessorios/:id', (req, res) => deleteById('qm_catalogo_acessorios', req.params.id, res));

router.post('/acessorios', async (req, res) => {
    const { grupo, itens_incluidos } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_catalogo_acessorios (grupo, itens_incluidos) VALUES ($1, $2) RETURNING *`,
            [grupo, itens_incluidos]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/acessorios/:id', async (req, res) => {
    const { grupo, itens_incluidos } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_catalogo_acessorios SET grupo=$1, itens_incluidos=$2 WHERE id=$3 RETURNING *`,
            [grupo, itens_incluidos, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ---------------------------------------------
// DIMENSÕES / DIMENSIONAMENTO
// ---------------------------------------------
router.get('/dimensoes', (req, res) => getAll('qm_catalogo_dimensao', res));
router.delete('/dimensoes/:id', (req, res) => deleteById('qm_catalogo_dimensao', req.params.id, res));

router.post('/dimensoes', async (req, res) => {
    const { id_dimensionamento, dimensoes } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO qm_catalogo_dimensao (id_dimensionamento, dimensoes) VALUES ($1, $2) RETURNING *`,
            [id_dimensionamento, dimensoes]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/dimensoes/:id', async (req, res) => {
    const { id_dimensionamento, dimensoes } = req.body;
    try {
        const result = await pool.query(
            `UPDATE qm_catalogo_dimensao SET id_dimensionamento=$1, dimensoes=$2 WHERE id=$3 RETURNING *`,
            [id_dimensionamento, dimensoes, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
