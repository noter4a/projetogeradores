
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Test connection
pool.on('connect', () => {
    console.log('Database connected successfully');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // Do not exit, let retry logic handle it or just log it
});

// Initialize Tables
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS alarm_history (
                id SERIAL PRIMARY KEY,
                generator_id VARCHAR(50) NOT NULL,
                alarm_code INT NOT NULL,
                alarm_message TEXT,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                acknowledged BOOLEAN DEFAULT FALSE,
                acknowledged_at TIMESTAMP,
                acknowledged_by VARCHAR(100)
            );
        `);
        console.log('Database tables initialized (alarm_history checked)');
    } catch (err) {
        console.error('Error initializing database tables:', err);
    }
};

initDb();

export const query = (text, params) => pool.query(text, params);
export default pool;
