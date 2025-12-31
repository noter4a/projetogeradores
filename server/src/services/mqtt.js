// Fixed by Agent - Force Update
import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeSgc120Payload, createModbusReadRequest } from '../utils/sgc120-parser.js';
import pool from '../db.js';

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
            console.log(`[MQTT] Message received on ${topic}`); // Debug log
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
                            unifiedData.voltageL12 = d.l12_v;
                            unifiedData.voltageL23 = d.l23_v;
                            unifiedData.voltageL31 = d.l31_v;
                        }

                        // Map ENGINE_51_59
                        if (d.block === 'ENGINE_51_59') {
                            unifiedData.oilPressure = d.oilPressure_bar;
                            unifiedData.engineTemp = d.coolantTemp_c;
                            unifiedData.fuelLevel = d.fuelLevel_pct;
                            unifiedData.rpm = d.rpm;
                            unifiedData.batteryVoltage = d.batteryVoltage_v;
                            // unifiedData.runHours = 0; // Removed to allow dynamic extraction
                        }

                        // Map MAINS_29 (Standard) or MAINS_504 (Variant)
                        if (d.block === 'MAINS_29' || d.block === 'MAINS_504') {
                            unifiedData.mainsVoltageL1 = d.l1n_v;
                            unifiedData.mainsVoltageL2 = d.l2n_v;
                            unifiedData.mainsVoltageL3 = d.l3n_v;
                            unifiedData.mainsFrequency = d.freq_r_hz;
                            // Frontend Table Expects mainsCurrent too, but SGC120 basic block might not have it.
                            // Default to 0 or check registers 38+ for current?
                            unifiedData.mainsCurrentL1 = 0;
                            unifiedData.mainsCurrentL2 = 0;
                            unifiedData.mainsCurrentL3 = 0;
                        }

                        if (d.runHours !== undefined) {
                            unifiedData.runHours = d.runHours;
                        }
                    }
                });

                // Only emit if we actually decoded something useful
                if (Object.keys(unifiedData).length > 0) {
                    // ...
                } else {
                    // Check if we have results that were parsed but unknown block
                    results.forEach(res => {
                        if (res.ok && res.decoded && res.decoded.block === 'UNKNOWN') {
                            console.log(`[MQTT] UNKNOWN BLOCK for ${deviceId}: Start ${res.decoded.startAddress}, Len ${res.decoded.registers.length}`);
                        }
                    });
                }

                if (Object.keys(unifiedData).length > 0) {

                    // DERIVE STATUS for Real-Time UI (and DB)
                    // If we have RPM, use it. If not, preserve previous? 
                    // For now, if RPM is 0 or undefined, effectively STOPPED unless we have other logic.
                    // But if it's a MAINS packet (no RPM), we shouldn't overwrite status to STOPPED if it was RUNNING.
                    // Safest: Only set status if RPM is present in this packet.
                    if (unifiedData.rpm !== undefined) {
                        unifiedData.status = (unifiedData.rpm > 100) ? 'RUNNING' : 'STOPPED';
                    }

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

                    // 4. Persist to Database (So it survives refresh)
                    (async () => {
                        try {
                            const query = `
                                UPDATE generators SET 
                                    voltage_l1 = COALESCE($1, voltage_l1),
                                    voltage_l2 = COALESCE($2, voltage_l2),
                                    voltage_l3 = COALESCE($3, voltage_l3),
                                    current_l1 = COALESCE($4, current_l1),
                                    current_l2 = COALESCE($5, current_l2),
                                    current_l3 = COALESCE($6, current_l3),
                                    frequency = COALESCE($7, frequency),
                                    oil_pressure = COALESCE($8, oil_pressure),
                                    engine_temp = COALESCE($9, engine_temp),
                                    fuel_level = COALESCE($10, fuel_level),
                                    rpm = COALESCE($11, rpm),
                                    battery_voltage = COALESCE($12, battery_voltage),
                                    mains_voltage_l1 = COALESCE($13, mains_voltage_l1),
                                    mains_voltage_l2 = COALESCE($14, mains_voltage_l2),
                                    mains_voltage_l3 = COALESCE($15, mains_voltage_l3),
                                    mains_frequency = COALESCE($16, mains_frequency),
                                    status = COALESCE($17, status),
                                    voltage_l12 = COALESCE($19, voltage_l12),
                                    voltage_l23 = COALESCE($20, voltage_l23),
                                    voltage_l31 = COALESCE($21, voltage_l31),
                                    run_hours = COALESCE($22, run_hours)
                                WHERE id = $18
                            `;

                            const values = [
                                unifiedData.voltageL1,
                                unifiedData.voltageL2,
                                unifiedData.voltageL3,
                                unifiedData.currentL1,
                                unifiedData.currentL2,
                                unifiedData.currentL3,
                                unifiedData.frequency,
                                unifiedData.oilPressure,
                                unifiedData.engineTemp,
                                unifiedData.fuelLevel,
                                unifiedData.rpm,
                                unifiedData.batteryVoltage,
                                unifiedData.mainsVoltageL1,
                                unifiedData.mainsVoltageL2,
                                unifiedData.mainsVoltageL3,
                                unifiedData.mainsFrequency,
                                unifiedData.status, // Can be undefined (Coalesce handles it)
                                // ID to match
                                deviceId,
                                unifiedData.voltageL12,
                                unifiedData.voltageL23,
                                unifiedData.voltageL31,
                                unifiedData.runHours
                            ];

                            await pool.query(query, values);
                            console.log(`[MQTT] Persisted data for ${deviceId} to DB.`);
                        } catch (dbErr) {
                            console.error('[MQTT] DB Persistence Error:', dbErr.message);
                        }
                    })();
                }
            }

        } catch (e) {
            console.error('[MQTT] Parse Error:', e.message);
        }
    });

    client.on('error', (err) => {
        console.error('[MQTT] Connection Error:', err.message);
    });

    // POLLING LOOP (Ativo)
    // A cada 10 segundos, pede o Horímetro (Reg 60-61)
    setInterval(() => {
        if (client && client.connected) {
            // Em um sistema real, iteraríamos por todos os geradores ativos no DB/Memória.
            // Para este fix, vamos focar no ID que sabemos: Ciklo1
            const devicesToPoll = ['Ciklo1'];

            devicesToPoll.forEach(deviceId => {
                try {
                    // Le a porra do Excel: 60 a 64 (5 registros).
                    // 60-61: Horas, 62: Minutos, 63-64: Starts?
                    const slaveId = 1;
                    const cmdBuffer = createModbusReadRequest(slaveId, 60, 5);

                    const topic = `devices/command/${deviceId}`;
                    // Enviar BUFFER puro (Raw Bytes), sem JSON.
                    const payload = cmdBuffer;

                    // Enviando
                    client.publish(topic, payload);
                    console.log(`[MQTT-POLL] Enviado request para ${deviceId}: ${cmdBuffer.toString('hex').toUpperCase()} -> ${topic}`);
                } catch (err) {
                    console.error('[MQTT-POLL] Erro ao enviar comando:', err.message);
                }
            });
        }
    }, 10000); // 10 segundos
};
