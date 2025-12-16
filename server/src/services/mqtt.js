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

    // Mapping based on "Ciklo Power 500" logic roughly observed
    // This is a naive mapping - in production we would match registers to specific generator models

    // We saw Reg 3 and 4 were similar (230, 231) -> Voltages?

    const readUInt16 = (idx) => {
        const offset = 3 + (idx * 2);
        if (offset + 1 < buffer.length) {
            return buffer.readUInt16BE(offset);
        }
        return 0;
    };

    return {
        // Assuming the order based on standard DEIF/Comap tables usually starting with basic electricals
        // This mapping will need refinement by the user later

        // Voltage (V)
        voltageL1: readUInt16(3),
        voltageL2: readUInt16(4),
        voltageL3: readUInt16(5),

        // Current (A) - Guessing positions after Voltages
        currentL1: readUInt16(6),
        currentL2: readUInt16(7),
        currentL3: readUInt16(8),

        // Frequency (Hz) - Often scaled x10 or x100, checking raw for now
        frequency: readUInt16(0) / 10, // Attempting scale, Reg 0 was 399 -> 39.9Hz? Or maybe it's not Freq.

        // Power (kW)
        activePower: readUInt16(10),

        // RPM
        rpm: readUInt16(1), // Reg 1 was 401. Too low for RPM? Maybe scaled? 

        // Engine
        fuelLevel: readUInt16(20), // Placeholder index
        oilPressure: readUInt16(21) / 10,
        engineTemp: readUInt16(22),
    };
}
