
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const poolConfig = {
    // Docker Compose / Individual Vars
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
};

// If DATABASE_URL is provided (e.g. Heroku or .env), use it
if (process.env.DATABASE_URL) {
    poolConfig.connectionString = process.env.DATABASE_URL;
}

const pool = new Pool(poolConfig);

// Test connection
pool.on('connect', () => {
    console.log('Database connected successfully');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // Do not exit, let retry logic handle it or just log it
});





export const query = (text, params) => pool.query(text, params);
export default pool;
