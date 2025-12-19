import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeSgc120Payload } from '../utils/sgc120-parser.js';

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

            // New SGC-120 Decoding Logic
            const results = decodeSgc120Payload(payload);

            // If we have valid decoded blocks, merge them into a unified status object
            if (results.length > 0) {
                // We might receive multiple blocks (Voltages + Engine), so we start with a base object
                // and merge all decoded fields.
                let unifiedData = {};

                results.forEach(res => {
                    if (res.ok && res.decoded) {
                        const d = res.decoded;

                        // Map GEN_VOLT_FREQ_1_9
                        if (d.block === 'GEN_VOLT_FREQ_1_9') {
                            unifiedData.voltageL1 = d.l1n_v;
                            unifiedData.voltageL2 = d.l2n_v;
                            unifiedData.voltageL3 = d.l3n_v;
                            unifiedData.frequency = d.freq_r_hz; // Assuming Gen Freq L1
                            // Calculate average voltage if needed
                            unifiedData.avgVoltage = Math.round((d.l1n_v + d.l2n_v + d.l3n_v) / 3);
                        }

                        // Map ENGINE_51_59
                        if (d.block === 'ENGINE_51_59') {
                            unifiedData.oilPressure = d.oilPressure_bar;
                            unifiedData.engineTemp = d.coolantTemp_c;
                            unifiedData.fuelLevel = d.fuelLevel_pct;
                            unifiedData.rpm = d.rpm;
                            unifiedData.batteryVoltage = d.batteryVoltage_v;
                            unifiedData.runHours = 0; // Not in this block
                        }
                    }
                });

                // Only emit if we actually decoded something useful
                if (Object.keys(unifiedData).length > 0) {
                    const updatePayload = {
                        id: deviceId,
                        timestamp: new Date().toISOString(),
                        data: unifiedData
                    };

                    console.log(`[MQTT] Decoded SGC-120 data for ${deviceId}:`, JSON.stringify(unifiedData));

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

                        // Merge new data with existing state for this device to preserve fields not in this packet
                        const existingDeviceData = currentState[deviceId]?.data || {};
                        currentState[deviceId] = {
                            ...updatePayload,
                            data: { ...existingDeviceData, ...unifiedData }
                        };

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
