import jwt from 'jsonwebtoken';
import cookie from 'cookie';

// SECURITY FIX (pentest VUL-02): o token deixou de ficar em localStorage no
// frontend — qualquer XSS conseguia ler e roubar a sessão permanentemente de
// lá. Agora o cookie httpOnly é o mecanismo principal (JS não consegue ler
// nem escrever nele). O header "Authorization: Bearer" continua funcionando
// como fallback — mantém compatibilidade com qualquer integração externa que
// já use esse header diretamente (ex.: scripts de terceiros) sem quebrar nada.
export const AUTH_COOKIE_NAME = 'ciklo_auth_token';
// FIX 2026-07-31: 24h expulsava o usuário no meio do expediente (relatado como
// "fica deslogando sozinho" — confirmado nos logs: /api/auth/profile voltando
// 401 e o app se deslogando automaticamente a cada checagem de 60s, sem
// nenhum login novo — sessão vencida de verdade, não bug de cookie). 30 dias é
// o padrão comum pra painel administrativo interno como este.
export const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias — mesmo prazo do JWT (expiresIn: '30d')
// FIX 2026-07-28: 'strict' derrubava a sessão (cookie fica no navegador, mas
// não é enviado) sempre que a navegação não "nasce" de dentro do próprio
// site — exatamente o caso de abrir o PWA pelo ícone da tela inicial, um
// bookmark, ou certos reloads/restaurações de histórico, que o navegador
// classifica como navegação de top-level "de fora". 'lax' resolve isso e
// continua protegendo contra CSRF de verdade: ele só libera o cookie em
// navegação de topo via GET, nunca em POST/PUT/DELETE cross-site nem em
// recursos embutidos (img/iframe/fetch de outro site) — que é a proteção que
// importa aqui.
export const authCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // precisa ser false em dev HTTP puro
    sameSite: 'lax',
    path: '/',
};

/** Extrai o JWT do cookie (principal) ou do header Authorization (fallback). */
export function extractAuthToken(req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    if (cookies[AUTH_COOKIE_NAME]) return cookies[AUTH_COOKIE_NAME];
    const authHeader = req.headers['authorization'];
    return authHeader && authHeader.split(' ')[1];
}

// Middleware for JWT Authentication
export const authenticateToken = (req, res, next) => {
    const token = extractAuthToken(req); // cookie httpOnly primeiro, header Bearer como fallback

    if (!token) return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido ou expirado.' });
        req.user = user;
        next();
    });
};

// Role-based authorization middleware
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Acesso negado. Permissão insuficiente.' });
    }
    next();
};
