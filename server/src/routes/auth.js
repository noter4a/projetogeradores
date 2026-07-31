import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import pool from '../db.js';
import { sendOtpEmail } from '../services/email.js';
import { logAudit } from '../lib/audit.js';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_MS, authCookieOptions, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// --- OTP por e-mail (2FA no login + redefinição de senha) ---
// Guardado em memória: código efêmero (10 min). Um restart do servidor invalida
// os códigos pendentes — o usuário apenas solicita de novo. challengeId é o
// identificador opaco devolvido ao cliente; ele não revela o usuário.
const otpChallenges = new Map(); // challengeId -> { purpose, userId, email, codeHash, expiresAt, attempts }
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

// Limpa códigos expirados a cada 5 min
setInterval(() => {
    const now = Date.now();
    for (const [id, c] of otpChallenges) {
        if (c.expiresAt <= now) otpChallenges.delete(id);
    }
}, 5 * 60 * 1000);

function generateOtpCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Cria um desafio, envia o código por e-mail e devolve o challengeId.
// Lança se o e-mail não puder ser enviado (o chamador decide o que responder).
async function createOtpChallenge({ purpose, userId, email }) {
    const code = generateOtpCode();
    const challengeId = crypto.randomBytes(24).toString('hex');
    const codeHash = await bcrypt.hash(code, 10);
    await sendOtpEmail(email, code, purpose);
    otpChallenges.set(challengeId, {
        purpose, userId, email, codeHash,
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0,
    });
    return challengeId;
}

// Verifica um código. Consome o desafio no sucesso ou quando estoura tentativas.
async function verifyOtpChallenge(challengeId, code, expectedPurpose) {
    const c = otpChallenges.get(challengeId);
    if (!c || c.expiresAt <= Date.now() || c.purpose !== expectedPurpose) {
        return { ok: false, error: 'Código inválido ou expirado.' };
    }
    if (c.attempts >= OTP_MAX_ATTEMPTS) {
        otpChallenges.delete(challengeId);
        return { ok: false, error: 'Muitas tentativas. Solicite um novo código.' };
    }
    const match = typeof code === 'string' && /^\d{6}$/.test(code) && await bcrypt.compare(code, c.codeHash);
    if (!match) {
        c.attempts += 1;
        return { ok: false, error: 'Código incorreto.' };
    }
    otpChallenges.delete(challengeId);
    return { ok: true, userId: c.userId, email: c.email };
}

// Rate limit dedicado para os fluxos de OTP (evita bombardear e-mail).
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 6,
    message: { message: 'Muitas solicitações. Tente novamente em alguns minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// FIX #17: Rate Limiting no Login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 15, // 15 tentativas FALHAS por IP
    // Só conta login que deu errado. Antes, todo login bem-sucedido também
    // consumia a cota, então quem usava o sistema normalmente era bloqueado.
    // O objetivo do limite é travar quem tenta adivinhar senha, não quem acerta.
    skipSuccessfulRequests: true,
    message: { message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Auth Routes (FIX #17: Rate limiting aplicado)
router.post('/login', loginLimiter, async (req, res) => {
    console.log('Login request received:', req.body.email);
    const { email, password } = req.body;

    try {
        // 1. Check if user exists
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            console.log('User not found:', email);
            logAudit({
                user: { email },
                action: 'auth.login_failed',
                details: { reason: 'usuário inexistente', email },
                ip: req.ip,
            });
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const user = result.rows[0];

        // 2. Validate Password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Invalid password for:', email);
            logAudit({
                user: { id: user.id, email: user.email },
                action: 'auth.login_failed',
                details: { reason: 'senha incorreta' },
                ip: req.ip,
            });
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        // 2b. Se 2FA está ativo, não libera o token ainda — manda código por e-mail.
        if (user.two_factor_enabled) {
            try {
                const challengeId = await createOtpChallenge({ purpose: 'login_2fa', userId: user.id, email: user.email });
                // Mascara o e-mail no retorno (ex: jo***@dominio.com) só como dica visual.
                const masked = user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2');
                return res.json({ requires2FA: true, challengeId, email: masked });
            } catch (mailErr) {
                console.error('[2FA] Falha ao enviar código:', mailErr.message);
                return res.status(502).json({ message: 'Não foi possível enviar o código por e-mail. Tente novamente.' });
            }
        }

        // 3. Generate Token
        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email, companyId: user.company_id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        logAudit({
            user: { id: user.id, email: user.email },
            action: 'auth.login',
            details: { role: user.role },
            ip: req.ip,
        });

        // 4. Cookie httpOnly é o mecanismo principal de sessão agora (ver
        // AUTH_COOKIE_NAME) — o token no corpo da resposta abaixo segue por
        // compatibilidade, mas o frontend não deve mais persisti-lo.
        res.cookie(AUTH_COOKIE_NAME, token, { ...authCookieOptions, maxAge: AUTH_COOKIE_MAX_AGE_MS });

        // 5. Return User Data (excluding password)
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

// POST /auth/verify-2fa — conclui o login com o código enviado por e-mail
router.post('/verify-2fa', otpLimiter, async (req, res) => {
    const { challengeId, code } = req.body;
    try {
        const result = await verifyOtpChallenge(challengeId, code, 'login_2fa');
        if (!result.ok) {
            return res.status(401).json({ message: result.error });
        }
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [result.userId]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Usuário não encontrado.' });
        }
        const user = userResult.rows[0];
        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email, companyId: user.company_id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
        logAudit({
            user: { id: user.id, email: user.email },
            action: 'auth.login',
            details: { role: user.role, method: '2fa' },
            ip: req.ip,
        });
        res.cookie(AUTH_COOKIE_NAME, token, { ...authCookieOptions, maxAge: AUTH_COOKIE_MAX_AGE_MS });
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
                emailAlerts: user.email_alerts,
                twoFactorEnabled: user.two_factor_enabled,
            }
        });
    } catch (err) {
        console.error('Verify 2FA error:', err);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// POST /auth/resend-2fa — reenvia o código de um desafio de login pendente
router.post('/resend-2fa', otpLimiter, async (req, res) => {
    const { challengeId } = req.body;
    const existing = otpChallenges.get(challengeId);
    if (!existing || existing.purpose !== 'login_2fa' || existing.expiresAt <= Date.now()) {
        return res.status(400).json({ message: 'Sessão de verificação expirada. Faça login novamente.' });
    }
    try {
        const newChallengeId = await createOtpChallenge({ purpose: 'login_2fa', userId: existing.userId, email: existing.email });
        otpChallenges.delete(challengeId); // invalida o antigo
        res.json({ challengeId: newChallengeId });
    } catch (mailErr) {
        console.error('[2FA] Falha ao reenviar código:', mailErr.message);
        res.status(502).json({ message: 'Não foi possível reenviar o código.' });
    }
});

// POST /auth/logout — limpa o cookie httpOnly de sessão. Precisa de um endpoint
// dedicado porque JS não consegue apagar um cookie httpOnly sozinho (client
// deixou de guardar o token em localStorage — ver AUTH_COOKIE_NAME acima).
router.post('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: authCookieOptions.httpOnly,
        secure: authCookieOptions.secure,
        sameSite: authCookieOptions.sameSite,
        path: authCookieOptions.path,
    });
    res.json({ message: 'Logout realizado.' });
});

// POST /auth/forgot-password — envia código de redefinição por e-mail.
// Resposta SEMPRE uniforme (mesmo shape) para não revelar se o e-mail existe.
router.post('/forgot-password', otpLimiter, async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    // challengeId aleatório sempre retornado; só vira desafio real se o usuário existir.
    let challengeId = crypto.randomBytes(24).toString('hex');
    try {
        if (email) {
            const result = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = $1', [email]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                // usa o próprio challengeId gerado para manter a resposta uniforme
                const code = generateOtpCode();
                const codeHash = await bcrypt.hash(code, 10);
                await sendOtpEmail(user.email, code, 'password_reset');
                otpChallenges.set(challengeId, {
                    purpose: 'password_reset', userId: user.id, email: user.email, codeHash,
                    expiresAt: Date.now() + OTP_TTL_MS, attempts: 0,
                });
                logAudit({ user: { id: user.id, email: user.email }, action: 'password.reset_requested', ip: req.ip });
            }
        }
    } catch (err) {
        console.error('Forgot password error:', err.message);
        // Não vaza erro — resposta uniforme mesmo assim.
    }
    res.json({ challengeId, message: 'Se o e-mail estiver cadastrado, enviamos um código de verificação.' });
});

// POST /auth/reset-password — valida o código e troca a senha
router.post('/reset-password', otpLimiter, async (req, res) => {
    const { challengeId, code, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }
    try {
        const result = await verifyOtpChallenge(challengeId, code, 'password_reset');
        if (!result.ok) {
            return res.status(400).json({ message: result.error });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, result.userId]);
        logAudit({ user: { id: result.userId, email: result.email }, action: 'password.reset', ip: req.ip });
        res.json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// GET /api/auth/profile - PROTECTED (Fetch current logged-in user details)
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.assigned_generators, u.company_id, u.phone, u.whatsapp_alerts, u.email_alerts, u.two_factor_enabled,
                    c.credits AS company_credits
             FROM users u
             LEFT JOIN companies c ON c.id = u.company_id
             WHERE u.id = $1`,
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
            companyCredits: user.company_id ? Number(user.company_credits) : null,
            phone: user.phone,
            whatsappAlerts: user.whatsapp_alerts,
            emailAlerts: user.email_alerts,
            twoFactorEnabled: user.two_factor_enabled
        });
    } catch (err) {
        console.error('Fetch profile error:', err);
        res.status(500).json({ message: 'Erro ao buscar perfil.' });
    }
});

// PUT /api/auth/profile - PROTECTED (Any authenticated user can update own profile)
router.put('/profile', authenticateToken, async (req, res) => {
    const { name, phone, currentPassword, newPassword, twoFactorEnabled } = req.body;

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

        // Cada usuário liga/desliga o próprio 2FA por e-mail.
        if (typeof twoFactorEnabled === 'boolean') {
            updates.push(`two_factor_enabled = $${paramIndex++}`);
            values.push(twoFactorEnabled);
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
        const updatedResult = await pool.query('SELECT id, name, email, role, assigned_generators, company_id, phone, whatsapp_alerts, email_alerts, two_factor_enabled FROM users WHERE id = $1', [req.user.id]);
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
            emailAlerts: updatedUser.email_alerts,
            twoFactorEnabled: updatedUser.two_factor_enabled
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ message: 'Erro ao atualizar perfil.' });
    }
});

// POST /auth/register (Secure User Creation)
router.post('/register', authenticateToken, async (req, res) => {
    // Only ADMINs can create users
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem criar usuários.' });
    }

    const { name, email, password, role, assigned_generators, companyId, phone, whatsappAlerts, emailAlerts } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
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

        logAudit({
            user: req.user,
            action: 'user.create',
            targetType: 'user',
            targetLabel: email,
            details: { role, companyId: companyId || null },
            ip: req.ip,
        });
        res.status(201).json({ message: 'Usuário criado com sucesso.' });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Erro ao criar usuário.' });
    }
});

export default router;
