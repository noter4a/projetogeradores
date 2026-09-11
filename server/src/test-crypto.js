import assert from 'assert';
import {
    encrypt,
    decrypt,
    isEncrypted,
    encryptObject,
    decryptObject,
    maskSecret,
    getMasterKey
} from './lib/crypto.js';

console.log('🧪 Iniciando testes de integridade do módulo crypto.js...');

// Garante uma chave de teste no ambiente se não existir
if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'ciklo-super-secret-jwt-key-for-testing-purposes-only-32';
}

// Teste 1: Resolução da chave mestre
const key = getMasterKey();
assert.strictEqual(Buffer.isBuffer(key), true, 'Chave mestre deve ser um Buffer');
assert.strictEqual(key.length, 32, 'Chave mestre deve ter exatamente 32 bytes (256 bits)');
console.log('✅ Teste 1: Chave mestre de 256 bits resolvida com sucesso.');

// Teste 2: Cifragem e Decifração básica (Round-trip)
const secretMessage = 'DSE-PIN-9842-ModbusSuperPassword';
const encrypted = encrypt(secretMessage);

assert.strictEqual(typeof encrypted, 'string', 'O retorno cifrado deve ser string');
assert.strictEqual(isEncrypted(encrypted), true, 'isEncrypted deve retornar true');
assert.notStrictEqual(encrypted, secretMessage, 'Texto cifrado não pode ser igual ao original');
assert.strictEqual(encrypted.startsWith('enc:v1:'), true, 'Deve conter o prefixo enc:v1:');

const decrypted = decrypt(encrypted);
assert.strictEqual(decrypted, secretMessage, 'Texto decifrado deve ser exatamente igual ao original');
console.log('✅ Teste 2: Round-trip de cifragem e decifração AES-256-GCM validado.');

// Teste 3: Idempotência (cifrar duas vezes não deve criar envelope duplo)
const doubleEncrypted = encrypt(encrypted);
assert.strictEqual(doubleEncrypted, encrypted, 'encrypt() em dado já cifrado deve ser idempotente');
console.log('✅ Teste 3: Idempotência garantida.');

// Teste 4: Retrocompatibilidade com dados legados em texto puro
const legacyPlaintext = '1234';
const legacyDecrypted = decrypt(legacyPlaintext);
assert.strictEqual(legacyDecrypted, legacyPlaintext, 'decrypt() em texto puro deve retornar o texto original');
console.log('✅ Teste 4: Retrocompatibilidade transparente com dados legados confirmada.');

// Teste 5: Rejeição a adulterações (Integridade e Autenticidade AES-GCM)
const parts = encrypted.split(':');
// Corrompe o último caractere do ciphertext
const tamperedCipher = parts[4].slice(0, -2) + (parts[4].endsWith('aa') ? 'bb' : 'aa');
const tamperedEnvelope = `enc:v1:${parts[2]}:${parts[3]}:${tamperedCipher}`;

let tamperDetected = false;
try {
    decrypt(tamperedEnvelope);
} catch (e) {
    tamperDetected = true;
}
assert.strictEqual(tamperDetected, true, 'Adulteração do ciphertext DEVE falhar a autenticação GCM');

// Corrompe a authTag
const tamperedTag = parts[3].slice(0, -2) + '00';
const tamperedTagEnvelope = `enc:v1:${parts[2]}:${tamperedTag}:${parts[4]}`;
let tagTamperDetected = false;
try {
    decrypt(tamperedTagEnvelope);
} catch (e) {
    tagTamperDetected = true;
}
assert.strictEqual(tagTamperDetected, true, 'Adulteração da authTag DEVE falhar a autenticação GCM');
console.log('✅ Teste 5: Resistência contra adulteração (Tamper resistance) comprovada.');

// Teste 6: Cifragem e Decifração de Objeto (ex: connection_info)
const mockConnectionInfo = {
    ip: '192.168.1.100',
    port: 502,
    slaveId: 1,
    controller: 'dse',
    controllerPin: '4321',
    password: 'superModemPassword123',
    modemModel: 'USR-G806'
};

const protectedConnectionInfo = encryptObject(mockConnectionInfo);
// Campos públicos devem permanecer inalterados para queries do Postgres
assert.strictEqual(protectedConnectionInfo.ip, '192.168.1.100');
assert.strictEqual(protectedConnectionInfo.port, 502);
assert.strictEqual(protectedConnectionInfo.controller, 'dse');
// Campos sensíveis devem estar criptografados
assert.strictEqual(isEncrypted(protectedConnectionInfo.controllerPin), true);
assert.strictEqual(isEncrypted(protectedConnectionInfo.password), true);

const restoredConnectionInfo = decryptObject(protectedConnectionInfo);
assert.deepStrictEqual(restoredConnectionInfo, mockConnectionInfo, 'Objeto decifrado deve ser idêntico ao original');
console.log('✅ Teste 6: Cifragem seletiva de connection_info validada.');

// Teste 7: Máscara visual de segredos
const maskedPin = maskSecret('4321');
assert.strictEqual(maskedPin, '••••', 'Senhas curtas devem ser totalmente mascaradas');
const maskedLong = maskSecret('senhaSuperSecreta');
assert.strictEqual(maskedLong.startsWith('se'), true);
assert.strictEqual(maskedLong.endsWith('ta'), true);
assert.strictEqual(maskedLong.includes('••••'), true);
console.log('✅ Teste 7: Máscara visual de segredos validada.');

console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO! Módulo crypto.js 100% operacional.');
