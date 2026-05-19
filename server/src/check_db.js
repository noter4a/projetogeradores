import dotenv from 'dotenv';
dotenv.config();
import pool from './db.js';

async function check() {
    try {
        console.log("Verificando banco de dados...");
        const res = await pool.query("SELECT id, connection_info FROM generators WHERE connection_info->>'ip' = 'Ciklo17'");
        if (res.rows.length === 0) {
            console.log("Gerador Ciklo17 não encontrado!");
        } else {
            console.log("Estado atual do Ciklo17 no banco de dados:");
            console.log(JSON.stringify(res.rows[0], null, 2));
        }
    } catch (e) {
        console.error("Erro ao acessar banco:", e.message);
    } finally {
        process.exit();
    }
}
check();
