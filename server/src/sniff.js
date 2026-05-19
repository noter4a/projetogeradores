import mqtt from 'mqtt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega as variaveis de ambiente
dotenv.config({ path: path.join(__dirname, '../.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: process.env.MQTT_USER || 'ciklo',
    password: process.env.MQTT_PASSWORD || 'ciklo123', // Ajuste se necessario
    rejectUnauthorized: false
};

console.log(`[SNIFFER] Conectando ao broker: ${BROKER_URL}`);

const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('[SNIFFER] ✅ Conectado com sucesso! Escutando TUDO (#)...');
    client.subscribe('#', (err) => {
        if (err) console.error('[SNIFFER] Erro ao assinar:', err);
    });
});

client.on('error', (err) => {
    console.error('[SNIFFER] ❌ Erro de conexão:', err.message);
});

client.on('message', (topic, message) => {
    console.log(`\n==================================================`);
    console.log(`🕒 ${new Date().toISOString()}`);
    console.log(`📡 TÓPICO: ${topic}`);
    
    // Tenta mostrar de várias formas para entendermos o que o DR164 manda
    console.log(`📦 Payload (String ASCII): ${message.toString()}`);
    console.log(`📦 Payload (Hexadecimal): ${message.toString('hex')}`);
    console.log(`==================================================`);
});
