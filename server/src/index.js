
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

// Socket.io Command Listener
io.on('connection', (socket) => {
    console.log('Client connected to Socket.IO');

    socket.on('control_generator', ({ generatorId, action }) => {
        console.log(`[API] Received Control Command: ${action} for ${generatorId}`);
        // Dynamic import to avoid circular dep issues if any, or use the exported function directly
        import('./services/mqtt.js').then(module => {
            module.sendControlCommand(generatorId, action);
        });
    });
});

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

            // Add Real-Time Columns if they don't exist (Migration)
            const columnsToAdd = [
                "avg_voltage INTEGER DEFAULT 0",
                "voltage_l1 INTEGER DEFAULT 0",
                "voltage_l2 INTEGER DEFAULT 0",
                "voltage_l3 INTEGER DEFAULT 0",
                "current_l1 INTEGER DEFAULT 0",
                "current_l2 INTEGER DEFAULT 0",
                "current_l3 INTEGER DEFAULT 0",
                "frequency NUMERIC(5,2) DEFAULT 0",
                "power_factor NUMERIC(4,2) DEFAULT 0",
                "active_power NUMERIC(10,2) DEFAULT 0",
                "rpm INTEGER DEFAULT 0",
                "oil_pressure NUMERIC(5,2) DEFAULT 0",
                "engine_temp INTEGER DEFAULT 0",
                "fuel_level INTEGER DEFAULT 0",
                "battery_voltage NUMERIC(5,2) DEFAULT 0",
                "total_hours INTEGER DEFAULT 0",
                "mains_voltage_l1 INTEGER DEFAULT 0",
                "mains_voltage_l2 INTEGER DEFAULT 0",
                "mains_voltage_l3 INTEGER DEFAULT 0",
                "mains_frequency NUMERIC(5,2) DEFAULT 0",
                "voltage_l12 INTEGER DEFAULT 0",
                "voltage_l23 INTEGER DEFAULT 0",
                "voltage_l31 INTEGER DEFAULT 0",
                "run_hours NUMERIC(10,2) DEFAULT 0"
            ];

            for (const col of columnsToAdd) {
                try {
                    // Extract column name for "IF NOT EXISTS" check isn't trivial in one line for all PG versions in raw query,
                    // but PG 9.6+ supports ADD COLUMN IF NOT EXISTS.
                    const colName = col.split(' ')[0];
                    const colDef = col.substring(col.indexOf(' ') + 1);
                    await client.query(`ALTER TABLE generators ADD COLUMN IF NOT EXISTS ${colName} ${colDef}`);
                } catch (e) {
                    console.log(`Column migration check for ${col} ignored or failed:`, e.message);
                }
            }

            // Fix: Ensure run_hours is NUMERIC (for legacy tables that created it as INTEGER)
            try {
                await client.query("ALTER TABLE generators ALTER COLUMN run_hours TYPE NUMERIC(10,2)");
            } catch (e) {
                console.log("Migration of run_hours type skipped:", e.message);
            }

            // Fix: Widen other columns to prevent overflow (e.g. if raw value 2400 is sent to NUMERIC(5,2))
            try {
                await client.query("ALTER TABLE generators ALTER COLUMN battery_voltage TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN oil_pressure TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN power_factor TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN mains_frequency TYPE NUMERIC(10,2)");
                console.log("Widened numeric columns to NUMERIC(10,2)");
            } catch (e) {
                console.log("Widening columns skipped or failed:", e.message);
            }

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

            // Map Persistent Real-Time Values
            fuelLevel: row.fuel_level || 0,
            engineTemp: row.engine_temp || 0,
            oilPressure: parseFloat(row.oil_pressure || 0),
            batteryVoltage: parseFloat(row.battery_voltage || 0),
            rpm: row.rpm || 0,
            // Map 'totalHours' to the 'run_hours' column which we are actively updating
            totalHours: parseFloat(row.run_hours || 0),
            lastMaintenance: new Date().toISOString().split('T')[0],

            voltageL1: row.voltage_l1 || 0,
            voltageL2: row.voltage_l2 || 0,
            voltageL3: row.voltage_l3 || 0,
            currentL1: row.current_l1 || 0,
            currentL2: row.current_l2 || 0,
            currentL3: row.current_l3 || 0,

            mainsVoltageL1: row.mains_voltage_l1 || 0,
            mainsVoltageL2: row.mains_voltage_l2 || 0,
            mainsVoltageL3: row.mains_voltage_l3 || 0,
            mainsFrequency: parseFloat(row.mains_frequency || 0),

            frequency: parseFloat(row.frequency || 0),
            powerFactor: parseFloat(row.power_factor || 0),
            activePower: parseFloat(row.active_power || 0)
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
