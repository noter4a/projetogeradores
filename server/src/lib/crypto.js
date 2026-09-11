import crypto from 'crypto';

/**
 * Módulo de Criptografia em Repouso AES-256-GCM (Ciklo Geradores)
 * 
 * Formato do envelope criptografado:
 * enc:v1:<iv_hex>:<authTag_hex>:<cipherText_hex>
 * 
 * - Algoritmo: AES-256-GCM (Galois/Counter Mode)
 * - IV: 12 bytes (96 bits) gerados com entropia criptográfica (crypto.randomBytes)
 * - Tag de autenticação: 16 bytes (128 bits) garantindo autenticidade e integridade
 * - Chave: 32 bytes (256 bits) resolvida de process.env.ENCRYPTION_KEY ou derivada via scrypt
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENVELOPE_PREFIX = 'enc:v1:';

// Chave em cache em memória durante o ciclo de vida do processo
let cachedMasterKey = null;

/**
 * Resolve ou deriva uma chave de 32 bytes (256 bits) para o AES-256.
 * Prioridade:
 * 1. process.env.ENCRYPTION_KEY (se for 64 hex chars ou 32 raw bytes em base64/utf8)
 * 2. Derivação determinística via scrypt a partir de ENCRYPTION_KEY ou JWT_SECRET
 */
export function getMasterKey() {
    if (cachedMasterKey) return cachedMasterKey;

    const rawKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!rawKey) {
        throw new Error('[CRYPTO] Falha crítica: Nem ENCRYPTION_KEY nem JWT_SECRET estão configurados no ambiente.');
    }

    if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
        console.warn('[CRYPTO] ⚠️ AVISO: ENCRYPTION_KEY não definida explicitamente. Derivando chave a partir de JWT_SECRET.');
    }

    // Se a chave já for exatamente 64 caracteres hexadecimais (32 bytes)
    if (typeof rawKey === 'string' && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
        cachedMasterKey = Buffer.from(rawKey, 'hex');
        return cachedMasterKey;
    }

    // Se for exatamente 32 bytes em base64
    if (typeof rawKey === 'string' && rawKey.length === 44 && rawKey.endsWith('=')) {
        const b = Buffer.from(rawKey, 'base64');
        if (b.length === 32) {
            cachedMasterKey = b;
            return cachedMasterKey;
        }
    }

    // Derivação segura usando scrypt com salt de domínio específico da Ciklo
    const salt = 'ciklo-industrial-aes256-v1';
    cachedMasterKey = crypto.scryptSync(rawKey, salt, 32);
    return cachedMasterKey;
}

/**
 * Verifica se um valor é uma string criptografada válida no formato de envelope da Ciklo.
 * @param {any} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
    if (typeof value !== 'string') return false;
    if (!value.startsWith(ENVELOPE_PREFIX)) return false;
    const parts = value.split(':');
    // enc, v1, iv, authTag, cipherText
    return parts.length === 5 && parts[0] === 'enc' && parts[1] === 'v1';
}

/**
 * Criptografa um texto ou valor primitivo usando AES-256-GCM.
 * Se o valor já estiver criptografado ou for nulo/indefinido, retorna sem alteração.
 * 
 * @param {string|number|boolean} plaintext - Dado a ser protegido
 * @returns {string} Envelope criptografado 'enc:v1:<iv>:<tag>:<ciphertext>'
 */
export function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') {
        return plaintext;
    }

    const str = String(plaintext);
    if (isEncrypted(str)) {
        return str; // Já criptografado, idempotente
    }

    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${ENVELOPE_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decifra um envelope 'enc:v1:<iv>:<tag>:<ciphertext>' usando AES-256-GCM.
 * Se o dado não for criptografado (legado/texto puro), retorna o valor original (retrocompatibilidade).
 * 
 * @param {string} encryptedText - Envelope criptografado
 * @returns {string} Texto original decifrado
 */
export function decrypt(encryptedText) {
    if (encryptedText === null || encryptedText === undefined || encryptedText === '') {
        return encryptedText;
    }

    if (typeof encryptedText !== 'string' || !isEncrypted(encryptedText)) {
        // Dado em texto puro (legado) — retorna de forma transparente
        return encryptedText;
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 5) {
        throw new Error('[CRYPTO] Formato de envelope criptográfico inválido.');
    }

    const [, , ivHex, tagHex, cipherHex] = parts;

    try {
        const key = getMasterKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(tagHex, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (err) {
        console.error('[CRYPTO] ❌ Falha na autenticação ou decifração AES-GCM (dado corrompido ou chave incorreta):', err.message);
        throw new Error('Falha ao decifrar dados protegidos (integridade comprometida ou chave inválida).');
    }
}

/**
 * Lista padrão de chaves que representam credenciais ou segredos em objetos de conexão
 */
export const DEFAULT_SENSITIVE_KEYS = [
    'password',
    'pin',
    'controllerPin',
    'accessPin',
    'modemPassword',
    'authKey',
    'apiKey',
    'secret',
    'privateKey'
];

/**
 * Criptografa recursivamente as chaves sensíveis de um objeto (ex: connection_info).
 * Retorna uma cópia do objeto com os campos sensíveis cifrados.
 * 
 * @param {Object} obj - Objeto de origem
 * @param {string[]} sensitiveKeys - Nomes dos campos a cifrar
 * @returns {Object} Objeto com os campos sensíveis protegidos
 */
export function encryptObject(obj, sensitiveKeys = DEFAULT_SENSITIVE_KEYS) {
    if (!obj || typeof obj !== 'object') return obj;

    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    const keySet = new Set(sensitiveKeys.map(k => k.toLowerCase()));

    for (const [key, value] of Object.entries(result)) {
        if (value === null || value === undefined) continue;

        if (typeof value === 'object') {
            result[key] = encryptObject(value, sensitiveKeys);
        } else if (keySet.has(key.toLowerCase()) && typeof value === 'string' && value.trim() !== '') {
            result[key] = encrypt(value);
        }
    }

    return result;
}

/**
 * Decifra recursivamente as chaves sensíveis de um objeto (ex: connection_info).
 * Retorna uma cópia do objeto com os campos sensíveis decifrados em memória.
 * 
 * @param {Object} obj - Objeto com campos protegidos
 * @param {string[]} sensitiveKeys - Nomes dos campos a decifrar
 * @returns {Object} Objeto com os campos sensíveis decifrados
 */
export function decryptObject(obj, sensitiveKeys = DEFAULT_SENSITIVE_KEYS) {
    if (!obj || typeof obj !== 'object') return obj;

    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    const keySet = new Set(sensitiveKeys.map(k => k.toLowerCase()));

    for (const [key, value] of Object.entries(result)) {
        if (value === null || value === undefined) continue;

        if (typeof value === 'object') {
            result[key] = decryptObject(value, sensitiveKeys);
        } else if (keySet.has(key.toLowerCase()) && typeof value === 'string' && isEncrypted(value)) {
            result[key] = decrypt(value);
        }
    }

    return result;
}

/**
 * Retorna uma máscara visual segura de um segredo para exibição em logs ou telas de visualização.
 * Ex: "1234" -> "••••" ou "senhaSuperSecreta" -> "senh••••eta"
 * 
 * @param {string} value
 * @returns {string}
 */
export function maskSecret(value) {
    if (!value || typeof value !== 'string') return '';
    const clean = isEncrypted(value) ? decrypt(value) : value;
    if (!clean) return '';
    if (clean.length <= 4) return '••••';
    const start = clean.slice(0, 2);
    const end = clean.slice(-2);
    return `${start}${'•'.repeat(Math.min(8, clean.length - 4))}${end}`;
}
