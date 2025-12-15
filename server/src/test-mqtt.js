import mqtt from 'mqtt';

// CONFIGURAÇÃO
const BROKER_URL = 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: 'ciklogeradores',
    password: 'CikloG3radores@2025',
    rejectUnauthorized: false // Aceitar certificados auto-assinados se necessário
};

console.log(`Connecting to ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('>>> CONNECTED to MQTT Broker!');
    client.subscribe('devices/data/#', (err) => {
        if (!err) {
            console.log('>>> Subscribed to devices/data/#');
        } else {
            console.error('Subscription error:', err);
        }
    });
});

client.on('message', (topic, message) => {
    console.log(`\n[${topic}] Message received`);

    try {
        const payload = JSON.parse(message.toString());
        console.log('Payload:', JSON.stringify(payload, null, 2));

        if (payload.modbusResponse && Array.isArray(payload.modbusResponse)) {
            const hexString = payload.modbusResponse[0];
            console.log('Hex Response:', hexString);
            decodeModbus(hexString);
        }

    } catch (e) {
        console.error('Error parsing JSON:', e.message);
        console.log('Raw Message:', message.toString());
    }
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
});

function decodeModbus(hex) {
    // Exemplo: 010478...
    // 01: Slave
    // 04: Function
    // 78: Bytes (120 bytes / 2 = 60 registers)

    const buffer = Buffer.from(hex, 'hex');

    if (buffer.length < 3) {
        console.log('Buffer too short');
        return;
    }

    const slaveId = buffer[0];
    const funcCode = buffer[1];
    const byteCount = buffer[2];

    console.log(`Decoded: Slave ${slaveId}, Func ${funcCode}, Bytes ${byteCount}`);

    // Assuming standard mapping from the Excel/Constants
    // Just printing first few registers for verification
    if (byteCount > 0) {
        console.log('--- Register Values (First 5) ---');
        for (let i = 0; i < 5 * 2; i += 2) {
            // Data starts at index 3
            if (3 + i + 1 < buffer.length) {
                const val = buffer.readUInt16BE(3 + i);
                console.log(`Reg ${i / 2}: ${val}`);
            }
        }
    }
}
