
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initMqttService, sendControlCommand } from './services/mqtt.js';
import { initTcpBridge, initGnssBridge } from './services/tcp-bridge.js';
import { initSnmpAgent } from './services/snmp-agent.js';
import alarmRoutes from './routes/alarms.js';
import crmRoutes from './routes/crm.js';
import catalogRoutes from './routes/catalog.js';
import proposalRoutes from './routes/proposals.js';
import companiesRoutes from './routes/companies.js';
import auditLogRoutes from './routes/auditLog.js';
import usersRoutes from './routes/users.js';
import controlRoutes from './routes/control.js';
import authRoutes from './routes/auth.js';
import generatorsRoutes from './routes/generators.js';
import companyWarningsRoutes from './routes/companyWarnings.js';
import { reconcileCompanyCredits } from './lib/companyCredits.js';
import { logAudit } from './lib/audit.js';
import { AUTH_COOKIE_NAME, authenticateToken, requireRole } from './middleware/auth.js';
import { assertGeneratorControlAccess } from './lib/accessControl.js';
import { setIo } from './lib/socket.js';
import initDb from './db/initDb.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// A API fica atrás do nginx, que repassa o IP do cliente em X-Forwarded-For.
// Sem isto, req.ip seria sempre o IP do container do nginx e o rate limit do
// login viraria um balde único compartilhado por TODOS os usuários.
// O valor 1 = confia em exatamente um salto (o nosso nginx); assim um cliente
// não consegue forjar o próprio IP mandando um X-Forwarded-For qualquer.
app.set('trust proxy', 1);

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
setIo(io);

// Start MQTT Service
initMqttService(io);

// Start TCP<->MQTT bridge for serial-over-TCP modems (opt-in via TCP_BRIDGE_PORT)
initTcpBridge();

// Start GNSS location listener for modem GPS reports (opt-in via GNSS_BRIDGE_PORT)
initGnssBridge(io);

// Start SNMP agent exposing generator telemetry (opt-in via SNMP_PORT)
initSnmpAgent();

// FIX #6: Socket.IO com autenticação JWT
// Cookie httpOnly é o mecanismo principal agora (ver AUTH_COOKIE_NAME acima);
// auth.token/query.token seguem como fallback para qualquer client que ainda
// os use explicitamente.
io.use((socket, next) => {
    let token;
    if (socket.handshake.headers?.cookie) {
        try {
            token = cookie.parse(socket.handshake.headers.cookie)[AUTH_COOKIE_NAME];
        } catch (e) {
            // cookie malformado — ignora e tenta o fallback abaixo
        }
    }
    if (!token) {
        token = socket.handshake.auth?.token || socket.handshake.query?.token;
    }
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
            sendControlCommand(generatorId, action);
            logAudit({
                user: socket.user,
                action: 'generator.control',
                targetType: 'generator',
                targetId: generatorId,
                details: { action },
                ip: socket.handshake?.headers?.['x-forwarded-for']?.split(',').pop()?.trim() || socket.handshake?.address,
            });
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

// Basic health check
app.get('/api', (req, res) => {
    res.send('Ciklo Geradores API is running');
});

// Auth routes (login/2FA/logout/forgot-reset-password/profile/register) — públicas
// e protegidas misturadas, cada rota decide sua própria autenticação internamente.
app.use('/api/auth', authRoutes);

app.use('/api/users', authenticateToken, usersRoutes);
app.use('/api/companies', authenticateToken, companiesRoutes);
app.use('/api/audit', authenticateToken, auditLogRoutes);
app.use('/api/control', authenticateToken, controlRoutes);
app.use('/api/generators', authenticateToken, generatorsRoutes);
app.use('/api/company-warnings', authenticateToken, companyWarningsRoutes);

// FIX #8: Alarm Routes protegidas com autenticação
app.use('/api/alarms', authenticateToken, alarmRoutes);

// Quotation Module Routes (ADMIN, TECHNICIAN and ORCAMENTOS)
app.use('/api/crm', authenticateToken, requireRole('ADMIN', 'TECHNICIAN', 'ORCAMENTOS'), crmRoutes);
app.use('/api/catalog', authenticateToken, requireRole('ADMIN', 'TECHNICIAN', 'ORCAMENTOS'), catalogRoutes);
app.use('/api/proposals', authenticateToken, requireRole('ADMIN', 'TECHNICIAN', 'ORCAMENTOS'), proposalRoutes);

// Catch all for API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API Route not found' });
});

// Start Server
httpServer.listen(PORT, async () => {
    await initDb();
    await reconcileCompanyCredits();
    // Re-check every 10 minutes so the midnight Brasília cutoff is applied promptly
    setInterval(reconcileCompanyCredits, 10 * 60 * 1000);
    console.log(`Server running on port ${PORT} (Build: Syntax Fixed)`);
});
