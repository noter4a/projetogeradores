
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initMqttService, updatePollingList, runModbusScan, getModbusScanStatus } from './services/mqtt.js';
import { initTcpBridge, initGnssBridge } from './services/tcp-bridge.js';
import alarmRoutes from './routes/alarms.js';
import crmRoutes from './routes/crm.js';
import catalogRoutes from './routes/catalog.js';
import proposalRoutes from './routes/proposals.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// FIX #7: CORS restrito ao domínio real
const ALLOWED_ORIGINS = [
    'https://painel.ciklogeradores.com.br',
    'http://localhost:3000' // Dev only
];

const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});

// Start MQTT Service
initMqttService(io);

// Start TCP<->MQTT bridge for serial-over-TCP modems (opt-in via TCP_BRIDGE_PORT)
initTcpBridge();

// Start GNSS location listener for modem GPS reports (opt-in via GNSS_BRIDGE_PORT)
initGnssBridge(io);

// FIX #6: Socket.IO com autenticação JWT
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        return next(new Error('Autenticação necessária'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        return next(new Error('Token inválido'));
    }
});

const CONTROL_ALLOWED_ROLES = ['ADMIN', 'TECHNICIAN', 'CLIENT'];

async function assertGeneratorControlAccess(user, generatorId) {
    if (!user) {
        return { allowed: false, status: 401, message: 'Autenticação necessária.' };
    }
    if (!generatorId || typeof generatorId !== 'string' || !generatorId.trim()) {
        return { allowed: false, status: 400, message: 'ID do gerador inválido.' };
    }
    if (!CONTROL_ALLOWED_ROLES.includes(user.role)) {
        return { allowed: false, status: 403, message: 'Acesso negado. Seu perfil não pode controlar geradores.' };
    }
    if (user.role === 'ADMIN') {
        return { allowed: true };
    }

    const trimmedId = generatorId.trim();
    const result = await pool.query(
        `SELECT id, company_id FROM generators
         WHERE id = $1
            OR connection_info->>'ip' = $1
            OR connection_info->>'connectionName' = $1
         LIMIT 1`,
        [trimmedId]
    );

    if (result.rows.length === 0) {
        return { allowed: false, status: 404, message: 'Gerador não encontrado.' };
    }

    const generator = result.rows[0];
    if (
        generator.company_id == null ||
        user.companyId == null ||
        Number(generator.company_id) !== Number(user.companyId)
    ) {
        return { allowed: false, status: 403, message: 'Acesso negado. Gerador não pertence à sua empresa.' };
    }

    return { allowed: true };
}

io.on('connection', (socket) => {
    console.log(`Client connected to Socket.IO (User: ${socket.user?.email})`);

    socket.on('control_generator', async ({ generatorId, action }) => {
        if (!action || typeof action !== 'string' || !action.trim()) {
            socket.emit('control_error', { generatorId, message: 'Ação inválida.' });
            return;
        }

        try {
            const access = await assertGeneratorControlAccess(socket.user, generatorId);
            if (!access.allowed) {
                console.warn(`[API] Control denied for ${socket.user?.email}: ${access.message}`);
                socket.emit('control_error', { generatorId, message: access.message });
                return;
            }

            console.log(`[API] Control Command from ${socket.user?.email}: ${action} for ${generatorId}`);
            const module = await import('./services/mqtt.js');
            module.sendControlCommand(generatorId, action);
        } catch (err) {
            console.error('[API] Socket control error:', err);
            socket.emit('control_error', { generatorId, message: 'Erro ao enviar comando.' });
        }
    });
});

const PORT = process.env.PORT || 5000;

// FIX #19: Headers de Segurança HTTP
app.use(helmet({ contentSecurityPolicy: false })); // CSP off to not break SPA

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// FIX #17: Rate Limiting no Login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 15, // 15 tentativas por IP
    message: { message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

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
            
            // Create Companies Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS companies (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create Users Table
            await client.query(`
              CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                assigned_generators TEXT[], 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                company_id INT REFERENCES companies(id) ON DELETE SET NULL
              );
            `);

            // Migration: Add company_id to users if table already existed without it
            try {
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL");
            } catch (e) {
                console.log("Migration users.company_id already applied or failed:", e.message);
            }

            // Migration: Add phone, whatsapp_alerts and email_alerts to users
            try {
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)");
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_alerts BOOLEAN DEFAULT false");
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts BOOLEAN DEFAULT true");
            } catch (e) {
                console.log("Migration users.phone/whatsapp_alerts/email_alerts already applied or failed:", e.message);
            }

            // Check if admin exists, if not seed default users
            const adminCheck = await client.query("SELECT * FROM users WHERE email = 'admin@ciklo.com'");
            if (adminCheck.rows.length === 0) {
                console.log('Seeding default users...');

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash('123456', salt);

                // Admin
                await client.query(
                    "INSERT INTO users (name, email, password, role, assigned_generators, company_id) VALUES ($1, $2, $3, $4, $5, $6)",
                    ['Administrador Ciklo', 'admin@ciklo.com', hashedPassword, 'ADMIN', [], null]
                );

                // Technician
                await client.query(
                    "INSERT INTO users (name, email, password, role, assigned_generators, company_id) VALUES ($1, $2, $3, $4, $5, $6)",
                    ['Técnico Operacional', 'tech@ciklo.com', hashedPassword, 'TECHNICIAN', ['GEN-001', 'GEN-003'], null]
                );

                // Client
                await client.query(
                    "INSERT INTO users (name, email, password, role, assigned_generators, company_id) VALUES ($1, $2, $3, $4, $5, $6)",
                    ['Cliente Final', 'client@company.com', hashedPassword, 'CLIENT', ['GEN-002'], null]
                );

                console.log('Default users created.');
            }

            // Create Generators Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS generators (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255),
                    location TEXT,
                    model VARCHAR(255),
                    power_kva NUMERIC,
                    status VARCHAR(50),
                    connection_info JSONB,
                    last_seen TIMESTAMP,
                    
                    voltage_l1 NUMERIC, voltage_l2 NUMERIC, voltage_l3 NUMERIC,
                    current_l1 NUMERIC, current_l2 NUMERIC, current_l3 NUMERIC,
                    frequency NUMERIC,
                    
                    mains_voltage_l1 NUMERIC, mains_voltage_l2 NUMERIC, mains_voltage_l3 NUMERIC,
                    mains_frequency NUMERIC,
                    
                    oil_pressure NUMERIC, engine_temp NUMERIC, fuel_level NUMERIC,
                    rpm NUMERIC, battery_voltage NUMERIC,
                    
                    run_hours NUMERIC, total_hours NUMERIC,
                    active_power NUMERIC, power_factor NUMERIC,
                    
                    voltage_l12 NUMERIC, voltage_l23 NUMERIC, voltage_l31 NUMERIC,
                    company_id INT REFERENCES companies(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Migration: Add company_id and created_at to generators if table already existed without them
            try {
                await client.query("ALTER TABLE generators ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL");
                await client.query("ALTER TABLE generators ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
                await client.query("ALTER TABLE generators ADD COLUMN IF NOT EXISTS last_connected TIMESTAMP");
            } catch (e) {
                console.log("Migration generators.company_id already applied or failed:", e.message);
            }

            // Create Alarm History Table (Moved from db.js for safety)
            await client.query(`
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

            // Create Generator Readings Table (Historical Power Data for Charts)
            await client.query(`
                CREATE TABLE IF NOT EXISTS generator_readings (
                    id SERIAL PRIMARY KEY,
                    generator_id VARCHAR(50) NOT NULL,
                    active_power NUMERIC(10,2) DEFAULT 0,
                    rpm NUMERIC DEFAULT 0,
                    frequency NUMERIC(5,2) DEFAULT 0,
                    voltage_l1 NUMERIC DEFAULT 0,
                    current_l1 NUMERIC DEFAULT 0,
                    fuel_level NUMERIC DEFAULT 0,
                    engine_temp NUMERIC DEFAULT 0,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create index for fast time-range queries
            try {
                await client.query(`CREATE INDEX IF NOT EXISTS idx_readings_gen_time ON generator_readings (generator_id, recorded_at DESC)`);
                await client.query(`CREATE INDEX IF NOT EXISTS idx_alarm_history_gen_end ON alarm_history (generator_id, end_time DESC)`);
            } catch(e) { console.log('Index creation skipped:', e.message); }

            // --- QUOTATION MODULE (QM) TABLES ---
            await client.query(`
                CREATE TABLE IF NOT EXISTS qm_clientes (
                    id SERIAL PRIMARY KEY,
                    razao_social VARCHAR(255) NOT NULL,
                    cnpj_cpf VARCHAR(50),
                    ie VARCHAR(50),
                    endereco TEXT,
                    bairro VARCHAR(100),
                    cep VARCHAR(20),
                    uf VARCHAR(2),
                    municipio VARCHAR(100),
                    contato VARCHAR(100),
                    fones VARCHAR(100),
                    email VARCHAR(100),
                    representante VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_geradores (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT,
                    unidade VARCHAR(10),
                    valor_unitario NUMERIC(10,2),
                    protecao TEXT,
                    tensoes VARCHAR(255),
                    finame VARCHAR(255),
                    mda VARCHAR(255)
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_motores (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT,
                    protecao TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_alternadores (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_modulos (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_acessorios (
                    id SERIAL PRIMARY KEY,
                    grupo VARCHAR(255) NOT NULL,
                    itens_incluidos TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_dimensao (
                    id SERIAL PRIMARY KEY,
                    id_dimensionamento VARCHAR(255) NOT NULL,
                    dimensoes TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_propostas (
                    id SERIAL PRIMARY KEY,
                    nprop INT,
                    anoprop INT,
                    numero_proposta VARCHAR(50),
                    status VARCHAR(50) DEFAULT 'RASCUNHO',
                    data_emissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    cliente_id INT REFERENCES qm_clientes(id),
                    valor_total NUMERIC(15,2),
                    prazo_entrega VARCHAR(255),
                    forma_pagamento VARCHAR(255),
                    frete VARCHAR(100),
                    ipi VARCHAR(100),
                    valido_ate TIMESTAMP,
                    gerador_id INT REFERENCES qm_catalogo_geradores(id),
                    quantidade INT DEFAULT 1,
                    motor_id INT REFERENCES qm_catalogo_motores(id),
                    alternador_id INT REFERENCES qm_catalogo_alternadores(id),
                    modulo_id INT REFERENCES qm_catalogo_modulos(id),
                    acessorio_id INT REFERENCES qm_catalogo_acessorios(id),
                    dimensao_id INT REFERENCES qm_catalogo_dimensao(id),
                    outros_acessorios TEXT
                );
            `);



            // Add Real-Time Columns if they don't exist (Migration)
            const columnsToAdd = [
                "location TEXT",
                "power_kva NUMERIC",
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
                    console.log(`Column migration check for ${col} ignored or failed: `, e.message);
                }
            }

            // Fix: Ensure run_hours is NUMERIC (for legacy tables that created it as INTEGER)
            try {
                await client.query("ALTER TABLE generators ALTER COLUMN run_hours TYPE NUMERIC(10,2)");
            } catch (e) {
                console.log("Migration of run_hours type skipped:", e.message);
            }

            // Fix: Widen other columns to prevent overflow
            try {
                await client.query("ALTER TABLE generators ALTER COLUMN battery_voltage TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN oil_pressure TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN power_factor TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN mains_frequency TYPE NUMERIC(10,2)");
                
                // Add QM columns if they don't exist
                await client.query("ALTER TABLE qm_catalogo_geradores ADD COLUMN IF NOT EXISTS finame VARCHAR(255)");
                await client.query("ALTER TABLE qm_catalogo_geradores ADD COLUMN IF NOT EXISTS mda VARCHAR(255)");
                
                console.log("Database migrations checked/applied.");
            } catch (e) {
                console.log("Migrations skipped or failed:", e.message);
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

// Auth Routes (FIX #17: Rate limiting aplicado)
router.post('/auth/login', loginLimiter, async (req, res) => {
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
            { id: user.id, role: user.role, email: user.email, companyId: user.company_id },
            process.env.JWT_SECRET,
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
                assignedGeneratorIds: user.assigned_generators || [],
                companyId: user.company_id,
                phone: user.phone,
                whatsappAlerts: user.whatsapp_alerts,
                emailAlerts: user.email_alerts
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        // FIX #10: Não vazar stack trace pro cliente
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Middleware for JWT Authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido ou expirado.' });
        req.user = user;
        next();
    });
};

// Role-based authorization middleware
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Acesso negado. Permissão insuficiente.' });
    }
    next();
};


// GET /api/auth/profile - PROTECTED (Fetch current logged-in user details)
router.get('/auth/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, assigned_generators, company_id, phone, whatsapp_alerts, email_alerts FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        const user = result.rows[0];
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            assignedGeneratorIds: user.assigned_generators || [],
            companyId: user.company_id,
            phone: user.phone,
            whatsappAlerts: user.whatsapp_alerts,
            emailAlerts: user.email_alerts
        });
    } catch (err) {
        console.error('Fetch profile error:', err);
        res.status(500).json({ message: 'Erro ao buscar perfil.' });
    }
});

// PUT /api/auth/profile - PROTECTED (Any authenticated user can update own profile)
router.put('/auth/profile', authenticateToken, async (req, res) => {
    const { name, phone, currentPassword, newPassword } = req.body;

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const user = userResult.rows[0];
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name !== undefined && name.trim()) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name.trim());
        }

        if (phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(phone || null);
        }

        // Password change requires current password verification
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha.' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres.' });
            }

            const validPassword = await bcrypt.compare(currentPassword, user.password);
            if (!validPassword) {
                return res.status(400).json({ message: 'Senha atual incorreta.' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updates.push(`password = $${paramIndex++}`);
            values.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
        }

        values.push(req.user.id);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

        // Return updated user data
        const updatedResult = await pool.query('SELECT id, name, email, role, assigned_generators, company_id, phone, whatsapp_alerts, email_alerts FROM users WHERE id = $1', [req.user.id]);
        const updatedUser = updatedResult.rows[0];

        res.json({
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            assignedGeneratorIds: updatedUser.assigned_generators || [],
            companyId: updatedUser.company_id,
            phone: updatedUser.phone,
            whatsappAlerts: updatedUser.whatsapp_alerts,
            emailAlerts: updatedUser.email_alerts
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ message: 'Erro ao atualizar perfil.' });
    }
});

// GET /api/users - PROTECTED (Admin Only)
router.get('/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, u.role, u.assigned_generators, u.company_id, u.phone, u.whatsapp_alerts, u.email_alerts, c.name as company_name, u.created_at 
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            ORDER BY u.created_at DESC
        `);
        res.json(result.rows.map(user => ({
            ...user,
            companyId: user.company_id,
            companyName: user.company_name,
            assignedGeneratorIds: user.assigned_generators || [], // Map DB field to frontend expected prop
            phone: user.phone,
            whatsappAlerts: user.whatsapp_alerts,
            emailAlerts: user.email_alerts
        })));
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ message: 'Erro ao buscar usuários.' });
    }
});

// PUT /api/users/:id - PROTECTED (Admin Only)
router.put('/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    const { id } = req.params;
    const { name, email, role, assignedGeneratorIds, credentials_password, companyId, phone, whatsappAlerts, emailAlerts } = req.body;

    try {
        // Update basic info
        await pool.query(
            "UPDATE users SET name=$1, email=$2, role=$3, assigned_generators=$4, company_id=$5, phone=$6, whatsapp_alerts=$7, email_alerts=$8 WHERE id=$9",
            [name, email, role, assignedGeneratorIds || [], companyId || null, phone || null, whatsappAlerts || false, emailAlerts !== undefined ? emailAlerts : true, id]
        );

        // Update password if provided
        if (credentials_password && credentials_password.length >= 6) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(credentials_password, salt);
            await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, id]);
        }

        res.json({ message: 'Usuário atualizado com sucesso.' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ message: 'Erro ao atualizar usuário.' });
    }
});

// DELETE /api/users/:id - PROTECTED (Admin Only)
router.delete('/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    const { id } = req.params;
    try {
        // Prevent deleting self (optional but good practice)
        if (req.user.id == id) { // Loose equality for string/int match
            return res.status(400).json({ message: 'Não é possível remover o próprio usuário logado.' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'Usuário removido com sucesso.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ message: 'Erro ao remover usuário.' });
    }
});

// POST /auth/register (Secure User Creation)
router.post('/auth/register', authenticateToken, async (req, res) => {
    // Only ADMINs can create users
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem criar usuários.' });
    }

    const { name, email, password, role, assigned_generators, companyId, phone, whatsappAlerts, emailAlerts } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }

    try {
        // Check if user already exists
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ message: 'Email já cadastrado.' });
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert User
        await pool.query(
            "INSERT INTO users (name, email, password, role, assigned_generators, company_id, phone, whatsapp_alerts, email_alerts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [name, email, hashedPassword, role, assigned_generators || [], companyId || null, phone || null, whatsappAlerts || false, emailAlerts !== undefined ? emailAlerts : true]
        );

        res.status(201).json({ message: 'Usuário criado com sucesso.' });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Erro ao criar usuário.' });
    }
});

// --- COMPANIES CRUD ROUTES ---

// GET /api/companies - PROTECTED (All authenticated users can list)
router.get('/companies', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM companies ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Get companies error:', err);
        res.status(500).json({ message: 'Erro ao buscar empresas.' });
    }
});

// POST /api/companies - PROTECTED (Admin Only)
router.post('/companies', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem criar empresas.' });
    }
    const { name, generatorIds } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Nome da empresa é obrigatório.' });
    }
    try {
        const check = await pool.query('SELECT * FROM companies WHERE name = $1', [name]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: 'Empresa com este nome já existe.' });
        }
        const result = await pool.query('INSERT INTO companies (name) VALUES ($1) RETURNING *', [name]);
        const newCompany = result.rows[0];

        if (generatorIds && Array.isArray(generatorIds) && generatorIds.length > 0) {
            await pool.query(
                'UPDATE generators SET company_id = $1 WHERE id = ANY($2)',
                [newCompany.id, generatorIds]
            );
        }

        res.status(201).json(newCompany);
    } catch (err) {
        console.error('Create company error:', err);
        res.status(500).json({ message: 'Erro ao criar empresa.' });
    }
});

// PUT /api/companies/:id - PROTECTED (Admin Only)
router.put('/companies/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem atualizar empresas.' });
    }
    const { id } = req.params;
    const { name, generatorIds } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Nome da empresa é obrigatório.' });
    }
    try {
        const check = await pool.query('SELECT * FROM companies WHERE name = $1 AND id <> $2', [name, id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: 'Outra empresa com este nome já existe.' });
        }
        const result = await pool.query('UPDATE companies SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }

        // 1. Remove company_id from generators that are no longer selected
        if (generatorIds && Array.isArray(generatorIds)) {
            await pool.query(
                'UPDATE generators SET company_id = NULL WHERE company_id = $1 AND NOT (id = ANY($2))',
                [id, generatorIds]
            );
            // 2. Associate new generators
            if (generatorIds.length > 0) {
                await pool.query(
                    'UPDATE generators SET company_id = $1 WHERE id = ANY($2)',
                    [id, generatorIds]
                );
            }
        } else {
            await pool.query('UPDATE generators SET company_id = NULL WHERE company_id = $1', [id]);
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update company error:', err);
        res.status(500).json({ message: 'Erro ao atualizar empresa.' });
    }
});

// DELETE /api/companies/:id - PROTECTED (Admin Only)
router.delete('/companies/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem remover empresas.' });
    }
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        res.json({ message: 'Empresa removida com sucesso.' });
    } catch (err) {
        console.error('Delete company error:', err);
        res.status(500).json({ message: 'Erro ao remover empresa.' });
    }
});

// Control Route (HTTP > Socket for reliability) - PROTECTED
router.post('/control', authenticateToken, async (req, res) => {
    const { generatorId, action } = req.body;

    if (!action || typeof action !== 'string' || !action.trim()) {
        return res.status(400).json({ success: false, message: 'Ação inválida.' });
    }

    try {
        const access = await assertGeneratorControlAccess(req.user, generatorId);
        if (!access.allowed) {
            console.warn(`[API] Control denied for ${req.user?.email}: ${access.message}`);
            return res.status(access.status).json({ success: false, message: access.message });
        }

        console.log(`[API] Received Control Command (HTTP): ${action} for ${generatorId}`);

        const { sendControlCommand } = await import('./services/mqtt.js');
        const result = sendControlCommand(generatorId, action); // Returns { success, error }

        if (result && result.success) {
            res.json({ success: true, message: `Command ${action} sent to ${generatorId}` });
        } else {
            const errorMessage = result?.error || 'Failed to find device or connection.';
            res.status(400).json({ success: false, message: errorMessage });
        }
    } catch (err) {
        console.error('[API] Control Error:', err);
        // FIX: Ensure we return a string message even if err is not a standard Error object
        const finalError = (err && err.message) ? err.message : String(err);
        res.status(500).json({ success: false, error: finalError });
    }
});

// PATCH /api/generators/:id/polling — pause/resume MQTT reads for a single generator
// Lets operators stop polling a problematic unit so it doesn't occupy the shared RS485 bus.
router.patch('/generators/:id/polling', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { paused } = req.body;

    if (typeof paused !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Campo "paused" (boolean) é obrigatório.' });
    }

    try {
        const access = await assertGeneratorControlAccess(req.user, id);
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const result = await pool.query(
            `UPDATE generators
             SET connection_info = jsonb_set(COALESCE(connection_info, '{}'::jsonb), '{pollingPaused}', $1::jsonb, true)
             WHERE id = $2
                OR connection_info->>'ip' = $2
                OR connection_info->>'connectionName' = $2
             RETURNING id`,
            [JSON.stringify(paused), id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Gerador não encontrado.' });
        }

        console.log(`[API] Polling ${paused ? 'PAUSED' : 'RESUMED'} for ${id} by ${req.user?.email}`);

        // Apply the change to the live polling engine, then tell clients to refresh.
        await updatePollingList();
        io.emit('generator:list_changed');

        res.json({ success: true, paused });
    } catch (err) {
        console.error('[API] Toggle polling error:', err);
        res.status(500).json({ success: false, message: 'Erro ao alterar o estado de leitura.' });
    }
});

// Generator Routes

// GET /api/generators
// FIX #9: Rota protegida com autenticação
router.get('/generators', authenticateToken, async (req, res) => {
    try {
        let query = `
            SELECT g.*, c.name as company_name 
            FROM generators g 
            LEFT JOIN companies c ON g.company_id = c.id
        `;
        const params = [];
        
        // Filter by company_id if user is not admin
        if (req.user.role !== 'ADMIN') {
            query += ` WHERE g.company_id = $1`;
            params.push(req.user.companyId || -1);
        }
        
        query += ` ORDER BY g.created_at ASC`;

        const result = await pool.query(query, params);
        
        // Map DB fields to Frontend types
        const generators = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            location: row.location,
            model: row.model,
            powerKVA: row.power_kva,
            status: row.status,
            connectionName: row.connection_info?.connectionName || null,
            controller: row.connection_info?.controller || null,
            protocol: row.connection_info?.protocol || null,
            ip: row.connection_info?.ip || null,
            port: row.connection_info?.port || null,
            slaveId: row.connection_info?.slaveId || null,
            deviceType: row.connection_info?.deviceType || 'modem',
            agc150Profile: row.connection_info?.agc150Profile || 'gen',
            pollingPaused: row.connection_info?.pollingPaused === true,
            latitude: row.connection_info?.gps?.lat ?? null,
            longitude: row.connection_info?.gps?.lon ?? null,
            gpsUpdatedAt: row.connection_info?.gps?.updatedAt ?? null,
            companyId: row.company_id,
            companyName: row.company_name,
            lastDataReceived: row.last_connected ? new Date(row.last_connected).getTime() : null,

            // Map Persistent Real-Time Values
            fuelLevel: row.fuel_level === null || row.fuel_level === 65535 ? null : Number(row.fuel_level),
            engineTemp: row.engine_temp === null || row.engine_temp === 65535 ? null : Number(row.engine_temp),
            oilPressure: row.oil_pressure === null || parseFloat(row.oil_pressure) === 655.35 ? null : parseFloat(row.oil_pressure),
            batteryVoltage: row.battery_voltage === null || parseFloat(row.battery_voltage) === 6553.5 ? null : parseFloat(row.battery_voltage),
            rpm: row.rpm === null || row.rpm === 65535 ? null : Number(row.rpm),
            // Map 'totalHours' to the 'run_hours' column which we are actively updating
            totalHours: parseFloat(row.run_hours || 0),
            lastMaintenance: new Date().toISOString().split('T')[0],

            voltageL1: row.voltage_l1 === null || row.voltage_l1 === 65535 ? null : Number(row.voltage_l1),
            voltageL2: row.voltage_l2 === null || row.voltage_l2 === 65535 ? null : Number(row.voltage_l2),
            voltageL3: row.voltage_l3 === null || row.voltage_l3 === 65535 ? null : Number(row.voltage_l3),
            currentL1: row.current_l1 === null || row.current_l1 === 65535 ? null : Number(row.current_l1),
            currentL2: row.current_l2 === null || row.current_l2 === 65535 ? null : Number(row.current_l2),
            currentL3: row.current_l3 === null || row.current_l3 === 65535 ? null : Number(row.current_l3),

            mainsVoltageL1: row.mains_voltage_l1 === null || row.mains_voltage_l1 === 65535 ? null : Number(row.mains_voltage_l1),
            mainsVoltageL2: row.mains_voltage_l2 === null || row.mains_voltage_l2 === 65535 ? null : Number(row.mains_voltage_l2),
            mainsVoltageL3: row.mains_voltage_l3 === null || row.mains_voltage_l3 === 65535 ? null : Number(row.mains_voltage_l3),
            mainsFrequency: row.mains_frequency === null || parseFloat(row.mains_frequency) === 6553.5 ? null : parseFloat(row.mains_frequency),

            frequency: row.frequency === null || parseFloat(row.frequency) === 6553.5 ? null : parseFloat(row.frequency),
            powerFactor: row.power_factor === null || parseFloat(row.power_factor) === 655.35 || parseFloat(row.power_factor) === 6553.5 ? null : parseFloat(row.power_factor),
            activePower: row.active_power === null || row.active_power === 65535 ? null : Number(row.active_power),
            activePowerTotal: row.active_power === null || row.active_power === 65535 ? null : Number(row.active_power),

            voltageL12: row.voltage_l12 === null || row.voltage_l12 === 65535 ? null : Number(row.voltage_l12),
            voltageL23: row.voltage_l23 === null || row.voltage_l23 === 65535 ? null : Number(row.voltage_l23),
            voltageL31: row.voltage_l31 === null || row.voltage_l31 === 65535 ? null : Number(row.voltage_l31)
        }));
        res.json(generators);
    } catch (err) {
        console.error('Get generators error:', err);
        res.status(500).json({ message: 'Erro ao buscar geradores' });
    }
});

// POST /api/generators - PROTECTED (Admin Only)
router.post('/generators', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    const gen = req.body;
    try {
        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId,
            deviceType: gen.deviceType || 'modem',
            ...(gen.agc150Profile ? { agc150Profile: gen.agc150Profile } : {}),
        };

        await pool.query(
            "INSERT INTO generators (id, name, location, model, power_kva, status, connection_info, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [gen.id, gen.name, gen.location, gen.model, gen.powerKVA, gen.status || 'STOPPED', JSON.stringify(connectionInfo), gen.companyId || null]
        );

        // Instantly reload MQTT polling configurations and notify clients
        try {
            await updatePollingList();
        } catch (pollErr) {
            console.error('[MQTT-UPDATE] Failed to update polling configurations:', pollErr);
        }
        io.emit('generator:list_changed');

        res.status(201).json({ message: 'Gerador criado com sucesso' });
    } catch (err) {
        console.error('Create generator error:', err);
        res.status(500).json({ message: 'Erro ao criar gerador' });
    }
});

// PUT /api/generators/:id - PROTECTED (Admin Only)
router.put('/generators/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    const { id } = req.params;
    const gen = req.body;
    try {
        // Preserve the polling pause flag (managed by the dedicated /polling endpoint)
        // so editing a generator here doesn't accidentally re-enable reads.
        const existing = await pool.query("SELECT connection_info FROM generators WHERE id=$1", [id]);
        const existingPaused = existing.rows[0]?.connection_info?.pollingPaused === true;
        const pollingPaused = typeof gen.pollingPaused === 'boolean' ? gen.pollingPaused : existingPaused;
        const existingGps = existing.rows[0]?.connection_info?.gps; // GPS is reported by the modem, not the form

        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId,
            deviceType: gen.deviceType || 'modem',
            ...(gen.agc150Profile ? { agc150Profile: gen.agc150Profile } : {}),
            ...(pollingPaused ? { pollingPaused: true } : {}),
            ...(existingGps ? { gps: existingGps } : {}),
        };

        await pool.query(
            "UPDATE generators SET name=$1, location=$2, model=$3, power_kva=$4, status=$5, connection_info=$6, company_id=$7 WHERE id=$8",
            [gen.name, gen.location, gen.model, gen.powerKVA, gen.status, JSON.stringify(connectionInfo), gen.companyId || null, id]
        );

        // Instantly reload MQTT polling configurations and notify clients
        try {
            await updatePollingList();
        } catch (pollErr) {
            console.error('[MQTT-UPDATE] Failed to update polling configurations:', pollErr);
        }
        io.emit('generator:list_changed');

        res.json({ message: 'Gerador atualizado' });
    } catch (err) {
        console.error('Update generator error:', err);
        res.status(500).json({ message: 'Erro ao atualizar gerador' });
    }
});

// DELETE /api/generators/:id - PROTECTED (Admin Only)
router.delete('/generators/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM generators WHERE id = $1', [id]);

        // Instantly reload MQTT polling configurations and notify clients
        try {
            await updatePollingList();
        } catch (pollErr) {
            console.error('[MQTT-UPDATE] Failed to update polling configurations:', pollErr);
        }
        io.emit('generator:list_changed');

        res.json({ message: 'Gerador removido' });
    } catch (err) {
        console.error('Delete generator error:', err);
        res.status(500).json({ message: 'Erro ao remover gerador' });
    }
});

// POST /api/generators/:id/modbus-scan — K30XL direct RS232 register discovery (Admin)
router.post('/generators/:id/modbus-scan', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    const { id } = req.params;
    const status = getModbusScanStatus(id);
    if (status.running) {
        return res.status(409).json({
            message: 'Varredura Modbus já em andamento para este gerador.',
            ...status,
        });
    }

    res.status(202).json({
        message: `Varredura Modbus iniciada para ${id}. Acompanhe com: docker logs ciklo-api -f | grep MODBUS-SCAN`,
        deviceId: id,
    });

    runModbusScan(id, req.body ?? {}).then((result) => {
        console.log(`[MODBUS-SCAN] API scan finished for ${id}:`, JSON.stringify(result.summary ?? result));
    }).catch((err) => {
        console.error(`[MODBUS-SCAN] API scan failed for ${id}:`, err.message);
    });
});

// GET /api/generators/:id/modbus-scan — scan progress (Admin)
router.get('/generators/:id/modbus-scan', authenticateToken, requireRole('ADMIN'), (req, res) => {
    res.json(getModbusScanStatus(req.params.id));
});



// GET /api/generators/:id/readings - Historical Power Data for Charts
router.get('/generators/:id/readings', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const range = req.query.range || '24h'; // 24h, 7d, 30d

    let intervalSql;
    let bucket; // seconds for downsampling
    switch (range) {
        case '7d':
            intervalSql = '7 days';
            bucket = 300; // 5 min avg
            break;
        case '30d':
            intervalSql = '30 days';
            bucket = 1800; // 30 min avg
            break;
        case '24h':
        default:
            intervalSql = '24 hours';
            bucket = 60; // 1 min avg
            break;
    }

    try {
        // Downsample to avoid returning thousands of rows
        const result = await pool.query(`
            SELECT 
                to_timestamp(floor(extract(epoch from recorded_at) / $2) * $2) as time,
                ROUND(AVG(active_power)::numeric, 2) as power,
                ROUND(AVG(rpm)::numeric, 0) as rpm,
                ROUND(AVG(frequency)::numeric, 2) as frequency
            FROM generator_readings
            WHERE (generator_id = $1 OR generator_id = (SELECT connection_info->>'ip' FROM generators WHERE id = $1 LIMIT 1))
              AND recorded_at >= NOW() - $3::interval
            GROUP BY time
            ORDER BY time ASC
        `, [id, bucket, intervalSql]);

        res.json(result.rows);
    } catch (err) {
        console.error('Get readings error:', err);
        res.status(500).json({ message: 'Erro ao buscar leituras.' });
    }
});

// FIX #8: Alarm Routes protegidas com autenticação
app.use('/api/alarms', authenticateToken, alarmRoutes);

// Quotation Module Routes (ADMIN, TECHNICIAN and ORCAMENTOS)
app.use('/api/crm', authenticateToken, requireRole('ADMIN', 'TECHNICIAN', 'ORCAMENTOS'), crmRoutes);
app.use('/api/catalog', authenticateToken, requireRole('ADMIN', 'TECHNICIAN', 'ORCAMENTOS'), catalogRoutes);
app.use('/api/proposals', authenticateToken, requireRole('ADMIN', 'TECHNICIAN', 'ORCAMENTOS'), proposalRoutes);

// Mount Main Router (handling Auth, Generators, Control which are defined inline above)
app.use('/api', router);

// Catch all for API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API Route not found' });
});

// Start Server
httpServer.listen(PORT, async () => {
    await initDb();
    console.log(`Server running on port ${PORT} (Build: Syntax Fixed)`);
});
