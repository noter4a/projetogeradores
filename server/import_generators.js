/**
 * Script para importar geradores do JSON para o banco de dados via API.
 * 
 * Uso: node import_generators.js <URL_BASE> <TOKEN>
 * Exemplo: node import_generators.js https://seudominio.com SEU_TOKEN_JWT
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const TOKEN = process.argv[3];

if (!TOKEN) {
    console.error('Uso: node import_generators.js <URL_BASE> <TOKEN>');
    console.error('Exemplo: node import_generators.js https://seuapp.com meujwttoken123');
    process.exit(1);
}

const jsonPath = path.resolve(__dirname, '..', 'Geradores Modelos.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log(`Encontrados ${data.length} geradores para importar.`);
console.log(`API: ${BASE_URL}/api/catalog/geradores`);
console.log('---');

let success = 0;
let skipped = 0;
let failed = 0;

for (const item of data) {
    const payload = {
        modelo: item.modelo,
        descricao: item.descricao || '',
        unidade: 'UN',
        valor_unitario: typeof item.preco === 'number' ? item.preco : 0,
        protecao: '',
        tensoes: '',
        finame: item.finame || '',
        mda: item.m_code || ''
    };

    try {
        const res = await fetch(`${BASE_URL}/api/catalog/geradores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const created = await res.json();
            console.log(`✅ [${++success}] ${item.modelo} - R$ ${payload.valor_unitario}`);
        } else {
            const err = await res.text();
            console.error(`❌ FALHOU: ${item.modelo} - ${res.status} ${err}`);
            failed++;
        }
    } catch (err) {
        console.error(`❌ ERRO: ${item.modelo} - ${err.message}`);
        failed++;
    }
}

console.log('\n--- RESULTADO ---');
console.log(`✅ Importados: ${success}`);
console.log(`❌ Falharam: ${failed}`);
console.log(`Total: ${data.length}`);
