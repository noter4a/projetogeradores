import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../../logs/mqtt_data.json');

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

let client;

// Configuration
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: process.env.MQTT_USER || 'ciklogeradores',
    password: process.env.MQTT_PASSWORD || 'CikloG3radores@2025',
    rejectUnauthorized: false
};

const TOPIC = 'devices/data/#';

/**
 * Initializes the MQTT Service
 * @param {Object} io - The Socket.io server instance
 */
export const initMqttService = (io) => {
    console.log(`[MQTT] Connecting to ${BROKER_URL}...`);

    // Force create file log on startup to verify volume mapping
    try {
        if (!fs.existsSync(LOG_FILE)) {
            fs.appendFileSync(LOG_FILE, `{"timestamp": "${new Date().toISOString()}", "event": "MQTT_SERVICE_STARTED"}\n`);
            console.log('[MQTT] Log file initialized.');
        }
    } catch (err) {
        console.error('[MQTT] FAILED TO WRITE LOG FILE:', err.message);
    }

    client = mqtt.connect(BROKER_URL, OPTIONS);

    client.on('connect', () => {
        console.log('[MQTT] Connected');
        client.subscribe(TOPIC, (err) => {
            if (!err) console.log(`[MQTT] Subscribed to ${TOPIC}`);
            else console.error('[MQTT] Subscription error:', err);
        });
    });

    client.on('message', (topic, message) => {
        try {
            const payload = JSON.parse(message.toString());
            const deviceId = topic.split('/').pop(); // devices/data/Ciklo0 -> Ciklo0

            // Check if it's the Modbus Response
            if (payload.modbusResponse && Array.isArray(payload.modbusResponse)) {
                const hex = payload.modbusResponse[0];
                const data = decodeModbus(hex);

                if (data) {
                    const updatePayload = {
                        id: deviceId,
                        timestamp: new Date().toISOString(),
                        rawHex: hex,
                        data: data
                    };

                    console.log(`[MQTT] Received data for ${deviceId}`);

                    // 1. Append valid data to History Log
                    try {
                        const logEntry = JSON.stringify(updatePayload) + '\n';
                        fs.appendFileSync(LOG_FILE, logEntry);
                    } catch (err) {
                        console.error('[MQTT] History Log Error:', err.message);
                    }

                    // 2. Update Current State (generators_state.json)
                    try {
                        const stateFile = path.join(__dirname, '../../logs/generators_state.json');
                        let currentState = {};

                        if (fs.existsSync(stateFile)) {
                            try {
                                currentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                            } catch (e) {
                                console.error('[MQTT] State File Read Error (Resetting):', e.message);
                                currentState = {};
                            }
                        }

                        // Update or add the device data
                        currentState[deviceId] = updatePayload;

                        // Write back ensuring atomic-like behavior (sync)
                        fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2));
                    } catch (err) {
                        console.error('[MQTT] State Update Error:', err.message);
                    }

                    // 3. Broadcast to Real-Time Clients
                    io.emit('generator:update', updatePayload);
                }
            }

        } catch (e) {
            console.error('[MQTT] Parse Error:', e.message);
        }
    });

    client.on('error', (err) => {
        console.error('[MQTT] Connection Error:', err.message);
    });
};

function decodeModbus(hex) {
    const buffer = Buffer.from(hex, 'hex');
    if (buffer.length < 3) return null;

    // Mapping based on "AGC-150 / Ciklo Power" Input Registers (Function 04)
    // Packet likely starts at Reg 501.
    // Index 0 = Reg 501.

    const readUInt16 = (idx) => {
        const offset = 3 + (idx * 2);
        if (offset + 1 < buffer.length) {
            return buffer.readUInt16BE(offset);
        }
        return 0;
    };

    const readUInt32 = (idx) => {
        const offset = 3 + (idx * 2);
        if (offset + 3 < buffer.length) {
            return buffer.readUInt32BE(offset);
        }
        return 0;
    }

    return {
        // Voltage (V) - Reg 504, 505, 506 (L-N)
        // Packet Index 3, 4, 5
        voltageL1: readUInt16(3),
        voltageL2: readUInt16(4),
        voltageL3: readUInt16(5),

        // Frequency (Hz) - Reg 507, 508, 509
        // Packet Index 6, 7, 8 (Scaled x100)
        frequency: readUInt16(6) / 100,

        // Current (A) - Reg 513, 514, 515
        // Packet Index 12, 13, 14
        currentL1: readUInt16(12),
        currentL2: readUInt16(13),
        currentL3: readUInt16(14),

        // Active Power (kW)
        // Hypothesis: Reg 516 (Total) or 517+?
        // Packet Index 15 = Reg 516?
        // Let's try reading Index 15 as Total Power or Index 16 if 32-bit
        activePower: readUInt16(15),

        // RPM - Reg 576
        // Packet Index 75 (Likely out of bounds in 60-reg packet)
        // Check if buffer has enough bytes
        rpm: readUInt16(75),

        // Engine - Placeholder / To Be Found
        fuelLevel: 0,
        oilPressure: 0,
        engineTemp: 0,
    };
}
