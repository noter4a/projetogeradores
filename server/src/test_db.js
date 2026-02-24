import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    user: process.env.DB_USER || 'root',
    host: process.env.DB_HOST || 'local.ciklogeradores.com.br',
    database: process.env.DB_NAME || 'ciklo',
    password: process.env.DB_PASSWORD || 'root',
    port: process.env.DB_PORT || 5432,
});

async function run() {
    try {
        const res = await pool.query("SELECT id, connection_info FROM generators");
        console.log(JSON.stringify(res.rows, null, 2));

        let devicesToPoll = res.rows
            .filter(row => row.connection_info && row.connection_info.ip) // Ensure valid config
            .map(row => ({
                id: row.connection_info.ip, // WAIT!!! Is the MAC address in 'ip'???
                slaveId: parseInt(row.connection_info.slaveId) || 1
            }));

        console.log("Devices to poll:");
        console.log(JSON.stringify(devicesToPoll, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
