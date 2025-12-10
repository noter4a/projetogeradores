
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
    res.send('Ciklo Geradores API is running');
});

// Initialize Database Tables
const initDb = async () => {
    try {
        const client = await pool.connect();

        // Create Users Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        assigned_generators TEXT[], -- Storing allowed IDs as JSON or Array
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Check if admin exists, if not seed default users
        const adminCheck = await client.query("SELECT * FROM users WHERE email = 'admin@ciklo.com'");
        if (adminCheck.rows.length === 0) {
            console.log('Seeding default users...');

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123456', salt);

            // Admin
            await client.query(
                "INSERT INTO users (name, email, password, role, assigned_generators) VALUES ($1, $2, $3, $4, $5)",
                ['Administrador Ciklo', 'admin@ciklo.com', hashedPassword, 'ADMIN', []]
            );

            // Technician
            await client.query(
                "INSERT INTO users (name, email, password, role, assigned_generators) VALUES ($1, $2, $3, $4, $5)",
                ['Técnico Operacional', 'tech@ciklo.com', hashedPassword, 'TECHNICIAN', ['GEN-001', 'GEN-003']]
            );

            // Client
            await client.query(
                "INSERT INTO users (name, email, password, role, assigned_generators) VALUES ($1, $2, $3, $4, $5)",
                ['Cliente Final', 'client@company.com', hashedPassword, 'CLIENT', ['GEN-002']]
            );

            console.log('Default users created.');
        }

        client.release();
    } catch (err) {
        console.error('Failed to initialize database:', err);
    }
};

// Auth Routes
router.post('/auth/login', async (req, res) => {
    console.log('Login request received:', req.body.email);
    const { email, password } = req.body;

    try {
        // 1. Check if user exists
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            console.log('User not found:', email);
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const user = result.rows[0];

        // 2. Validate Password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Invalid password for:', email);
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        // 3. Generate Token
        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            process.env.JWT_SECRET || 'secret_key_123',
            { expiresIn: '24h' }
        );

        // 4. Return User Data (excluding password)
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                assignedGeneratorIds: user.assigned_generators || []
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.use('/api', router);

// Catch all for API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API Route not found' });
});

// Start Server
app.listen(PORT, async () => {
    await initDb();
    console.log(`Server running on port ${PORT}`);
});
