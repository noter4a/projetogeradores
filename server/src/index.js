
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initMqttService } from './services/mqtt.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Start MQTT Service
initMqttService(io);

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
    res.send('Ciklo Geradores API is running');
});

// Initialize Database Tables with Retry
const initDb = async (retries = 15, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
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
            assigned_generators TEXT[], 
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

            // Create Generators Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS generators (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    location VARCHAR(255),
                    model VARCHAR(255),
                    power_kva INTEGER,
                    status VARCHAR(50),
                    connection_info JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Seed Default Generator
            const genCheck = await client.query("SELECT * FROM generators WHERE id = 'GEN-REAL-01'");
            if (genCheck.rows.length === 0) {
                await client.query(
                    "INSERT INTO generators (id, name, location, model, power_kva, status, connection_info) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                    ['GEN-REAL-01', 'Gerador Conectado (Real)', 'Monitoramento Remoto', 'Ciklo Power', 500, 'OFFLINE', JSON.stringify({
                        connectionName: 'Modbus TCP',
                        controller: 'dse',
                        protocol: 'modbus_tcp',
                        ip: 'Ciklo0',
                        port: '502',
                        slaveId: '1'
                    })]
                );
                console.log('Default generator seeded.');
            }

            client.release();
            console.log('Database initialized successfully.');
            return; // Success, exit loop
        } catch (err) {
            console.error(`Failed to initialize database (Attempt ${i + 1}/${retries}):`, err.message);
            if (i < retries - 1) {
                console.log(`Retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
            } else {
                console.error('Max retries reached. Database initialization failed.');
            }
        }
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

// Generator Routes

// GET /api/generators
router.get('/generators', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM generators ORDER BY created_at ASC');
        // Map DB fields to Frontend types
        const generators = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            location: row.location,
            model: row.model,
            powerKVA: row.power_kva,
            status: row.status,
            connectionName: row.connection_info.connectionName,
            controller: row.connection_info.controller,
            protocol: row.connection_info.protocol,
            ip: row.connection_info.ip,
            port: row.connection_info.port,
            slaveId: row.connection_info.slaveId,
            // Default realtime values (will be overwritten by MQTT/Frontend state)
            fuelLevel: 0,
            engineTemp: 0,
            oilPressure: 0,
            batteryVoltage: 0,
            rpm: 0,
            totalHours: 0,
            lastMaintenance: new Date().toISOString().split('T')[0],
            voltageL1: 0,
            voltageL2: 0,
            voltageL3: 0,
            currentL1: 0,
            currentL2: 0,
            currentL3: 0,
            frequency: 0,
            powerFactor: 0,
            activePower: 0
        }));
        res.json(generators);
    } catch (err) {
        console.error('Get generators error:', err);
        res.status(500).json({ message: 'Erro ao buscar geradores' });
    }
});

// POST /api/generators
router.post('/generators', async (req, res) => {
    const gen = req.body;
    try {
        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId
        };

        await pool.query(
            "INSERT INTO generators (id, name, location, model, power_kva, status, connection_info) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [gen.id, gen.name, gen.location, gen.model, gen.powerKVA, gen.status || 'STOPPED', JSON.stringify(connectionInfo)]
        );
        res.status(201).json({ message: 'Gerador criado com sucesso' });
    } catch (err) {
        console.error('Create generator error:', err);
        res.status(500).json({ message: 'Erro ao criar gerador' });
    }
});

// PUT /api/generators/:id
router.put('/generators/:id', async (req, res) => {
    const { id } = req.params;
    const gen = req.body;
    try {
        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId
        };

        await pool.query(
            "UPDATE generators SET name=$1, location=$2, model=$3, power_kva=$4, status=$5, connection_info=$6 WHERE id=$7",
            [gen.name, gen.location, gen.model, gen.powerKVA, gen.status, JSON.stringify(connectionInfo), id]
        );
        res.json({ message: 'Gerador atualizado' });
    } catch (err) {
        console.error('Update generator error:', err);
        res.status(500).json({ message: 'Erro ao atualizar gerador' });
    }
});

// DELETE /api/generators/:id
router.delete('/generators/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM generators WHERE id = $1', [id]);
        res.json({ message: 'Gerador removido' });
    } catch (err) {
        console.error('Delete generator error:', err);
        res.status(500).json({ message: 'Erro ao remover gerador' });
    }
});

// Generator Routes

// GET /api/generators
router.get('/generators', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM generators ORDER BY created_at ASC');
        // Map DB fields to Frontend types
        const generators = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            location: row.location,
            model: row.model,
            powerKVA: row.power_kva,
            status: row.status,
            connectionName: row.connection_info.connectionName,
            controller: row.connection_info.controller,
            protocol: row.connection_info.protocol,
            ip: row.connection_info.ip,
            port: row.connection_info.port,
            slaveId: row.connection_info.slaveId,
            // Default realtime values (will be overwritten by MQTT/Frontend state)
            fuelLevel: 0,
            engineTemp: 0,
            oilPressure: 0,
            batteryVoltage: 0,
            rpm: 0,
            totalHours: 0,
            lastMaintenance: new Date().toISOString().split('T')[0],
            voltageL1: 0,
            voltageL2: 0,
            voltageL3: 0,
            currentL1: 0,
            currentL2: 0,
            currentL3: 0,
            frequency: 0,
            powerFactor: 0,
            activePower: 0
        }));
        res.json(generators);
    } catch (err) {
        console.error('Get generators error:', err);
        res.status(500).json({ message: 'Erro ao buscar geradores' });
    }
});

// POST /api/generators
router.post('/generators', async (req, res) => {
    const gen = req.body;
    try {
        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId
        };

        await pool.query(
            "INSERT INTO generators (id, name, location, model, power_kva, status, connection_info) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [gen.id, gen.name, gen.location, gen.model, gen.powerKVA, gen.status || 'STOPPED', JSON.stringify(connectionInfo)]
        );
        res.status(201).json({ message: 'Gerador criado com sucesso' });
    } catch (err) {
        console.error('Create generator error:', err);
        res.status(500).json({ message: 'Erro ao criar gerador' });
    }
});

// PUT /api/generators/:id
router.put('/generators/:id', async (req, res) => {
    const { id } = req.params;
    const gen = req.body;
    try {
        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId
        };

        await pool.query(
            "UPDATE generators SET name=$1, location=$2, model=$3, power_kva=$4, status=$5, connection_info=$6 WHERE id=$7",
            [gen.name, gen.location, gen.model, gen.powerKVA, gen.status, JSON.stringify(connectionInfo), id]
        );
        res.json({ message: 'Gerador atualizado' });
    } catch (err) {
        console.error('Update generator error:', err);
        res.status(500).json({ message: 'Erro ao atualizar gerador' });
    }
});

// DELETE /api/generators/:id
router.delete('/generators/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM generators WHERE id = $1', [id]);
        res.json({ message: 'Gerador removido' });
    } catch (err) {
        console.error('Delete generator error:', err);
        res.status(500).json({ message: 'Erro ao remover gerador' });
    }
});

app.use('/api', router);

// Catch all for API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API Route not found' });
});

// Start Server
httpServer.listen(PORT, async () => {
    await initDb();
    console.log(`Server running on port ${PORT}`);
});
