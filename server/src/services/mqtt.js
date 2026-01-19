// Fixed by Agent - Force Update
import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeSgc120Payload, createModbusReadRequest, crc16Modbus } from '../utils/sgc120-parser.js';
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
let lastConnectionError = null;
let devicesToPoll = [];

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
// Initialize Cache
global.mqttDeviceCache = {};

export const initMqttService = (io) => {
    console.log(`[MQTT] Connecting to ${BROKER_URL}...`);
    lastConnectionError = null;

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
    global.mqttClient = client; // FIX: Expose to global scope for sendControlCommand

    client.on('connect', () => {
        console.log('[MQTT] Connected');
        lastConnectionError = null;
        client.subscribe(TOPIC, (err) => {
            if (!err) console.log(`[MQTT] Subscribed to ${TOPIC}`);
            else console.error('[MQTT] Subscription error:', err);
        });
    });

    client.on('error', (err) => {
        console.error('[MQTT] Connection Error:', err.message);
        lastConnectionError = err.message;
    });

    client.on('offline', () => {
        if (!lastConnectionError) lastConnectionError = "Client went offline";
    });

    client.on('message', (topic, message) => {
        try {
            console.log(`[MQTT] Message received on ${topic}`); // Debug log
            const payload = JSON.parse(message.toString());
            // console.log('[MQTT] Payload Keys:', Object.keys(payload));
            if (payload.modbusRequest && payload.modbusRequest.length === 0) {
                console.log('[MQTT] WARNING: Received payload with EMPTY modbusRequest! Gateway might have rejected the command.');
            } else if (payload.modbusRequest) {
                console.log(`[MQTT] Payload Request[0]: ${payload.modbusRequest[0]}`);
                if (payload.modbusResponse) {
                    const resp = payload.modbusResponse[0];
                    if (!resp || resp === "") {
                        console.log(`[MQTT] ⚠️  TIMEOUT/CONFLICT: Modem received 'Empty' from Generator. (Check Cable or Parallel Software)`);
                    } else {
                        console.log(`[MQTT] Payload Response[0]: ${resp}`);
                    }
                } else {
                    console.log('[MQTT] Payload has NO modbusResponse field.');
                }
            }
            const deviceId = topic.split('/').pop(); // devices/data/Ciklo0 -> Ciklo0

            // New SGC-120 Decoding Logic
            const results = decodeSgc120Payload(payload);

            // If we have valid decoded blocks, merge them into a unified status object
            if (results.length > 0) {
                // We might receive multiple blocks (Voltages + Engine), so we start with a base object
                // and merge all decoded fields.
                let unifiedData = {};

                // Global Cache for stateful aggregation (Hours + Minutes)
                if (!global.mqttDeviceCache) global.mqttDeviceCache = {};

                results.forEach(res => {
                    if (res.ok && res.decoded) {
                        const d = res.decoded;

                        // Ensure cache entry exists
                        if (!global.mqttDeviceCache[deviceId]) {
                            global.mqttDeviceCache[deviceId] = { runHours: 0, runMinutes: 0 };
                        }

                        // Map GEN_VOLT_FREQ_1_9
                        // Map GEN_VOLT_FREQ_1_9
                        if (d.block === 'GEN_VOLT_FREQ_1_9') {
                            unifiedData.voltageL1 = d.l1n_v || 0;
                            unifiedData.voltageL2 = d.l2n_v || 0;
                            unifiedData.voltageL3 = d.l3n_v || 0;
                            unifiedData.frequency = d.freq_r_hz || 0; // Assuming Gen Freq L1
                            // Calculate average voltage if needed
                            const avgVal = (unifiedData.voltageL1 + unifiedData.voltageL2 + unifiedData.voltageL3) / 3;
                            unifiedData.avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);
                            unifiedData.voltageL12 = d.l12_v || 0;
                            unifiedData.voltageL23 = d.l23_v || 0;
                            unifiedData.voltageL31 = d.l31_v || 0;
                            unifiedData.voltageL31 = d.l31_v || 0;
                        }

                        // Map MODE_0
                        if (d.block === 'MODE_0') {
                            unifiedData.operationMode = d.opMode;
                        }

                        // Map ENGINE_51_59
                        // Map ENGINE_51_59
                        if (d.block === 'ENGINE_51_59') {
                            unifiedData.oilPressure = d.oilPressure_bar || 0;
                            unifiedData.engineTemp = d.coolantTemp_c || 0;
                            unifiedData.fuelLevel = d.fuelLevel_pct || 0;
                            unifiedData.rpm = d.rpm || 0;
                            unifiedData.batteryVoltage = d.batteryVoltage_v || 0;
                        }

                        // Map RUNHOURS_60 (Hours Only)
                        if (d.block === 'RUNHOURS_60') {
                            global.mqttDeviceCache[deviceId].runHours = d.runHoursTotal || 0;
                        }

                        // Map RUNMINUTES_62 (Minutes Only)
                        if (d.block === 'RUNMINUTES_62') {
                            global.mqttDeviceCache[deviceId].runMinutes = d.runMinutes || 0;
                        }

                        // Map MAINS_14 (Corrected), MAINS_29 (Legacy) or MAINS_504 (Variant)
                        // Map MAINS_14 (Corrected), MAINS_29 (Legacy) or MAINS_504 (Variant)
                        if (d.block === 'MAINS_14' || d.block === 'MAINS_29' || d.block === 'MAINS_504') {
                            // FIX: Map both Phase-Neutral and Phase-Phase for toggling in UI
                            unifiedData.mainsVoltageL1 = d.l1n_v || 0;
                            unifiedData.mainsVoltageL2 = d.l2n_v || 0;
                            unifiedData.mainsVoltageL3 = d.l3n_v || 0;

                            unifiedData.mainsVoltageL12 = d.l1l2_v || 0;
                            unifiedData.mainsVoltageL23 = d.l2l3_v || 0;
                            unifiedData.mainsVoltageL31 = d.l3l1_v || 0;

                            unifiedData.mainsFrequency = d.freq_r_hz || 0;
                            // REMOVED: Do not overwrite mains current with 0
                        }

                        // Map POWER_30 (Active Power)
                        if (d.block === 'POWER_30') {
                            unifiedData.activePower = d.activePower_kw || 0;
                        }

                        // Map ACTIVE_POWER_29 (New Authority)
                        if (d.block === 'ACTIVE_POWER_29') {
                            unifiedData.activePower = d.activePower_kw || 0;
                            // console.log(`[MQTT-DEBUG] Mapping ACTIVE_POWER_29 -> ${d.activePower_kw} kW`);
                        }

                        // Map ALARM_66
                        if (d.block === 'ALARM_66') {
                            if (!unifiedData.alarms) unifiedData.alarms = {};
                            unifiedData.alarms.startFailure = d.startFailure;
                            unifiedData.alarmCode = d.alarmCode;
                        }

                        // Map ENERGY_43 (Apparent Energy)
                        if (d.block === 'ENERGY_43') {
                            unifiedData.apparentEnergy = d.apparentEnergy_kvah || 0;
                        }

                        // Map CURRENT_10
                        if (d.block === 'CURRENT_10') {
                            console.log(`[MQTT-DEBUG] Mapping CURRENT_10: L1=${d.curr_l1}, L2=${d.curr_l2}, L3=${d.curr_l3}`);
                            unifiedData.currentL1 = d.curr_l1 || 0;
                            unifiedData.currentL2 = d.curr_l2 || 0;
                            unifiedData.currentL3 = d.curr_l3 || 0;
                        }

                        // Map MAINS_CURRENT_116
                        if (d.block === 'MAINS_CURRENT_116') {
                            // User request: Use Generator Current for Mains. Disabling this to prevent overwrite.
                            // unifiedData.mainsCurrentL1 = d.mainsCurr_l1 || 0;
                            // unifiedData.mainsCurrentL2 = d.mainsCurr_l2 || 0;
                            // unifiedData.mainsCurrentL3 = d.mainsCurr_l3 || 0;
                            console.log(`[MQTT-DEBUG] IGNORED MAINS_CURRENT_116: ${d.mainsCurr_l1}, ${d.mainsCurr_l2}, ${d.mainsCurr_l3}`);
                        }

                        // Map LOAD_CURRENT_23 (New Authority for Current)
                        if (d.block === 'LOAD_CURRENT_23') {
                            unifiedData.currentL1 = d.loadCurr_l1 || 0;
                            unifiedData.currentL2 = d.loadCurr_l2 || 0;
                            unifiedData.currentL3 = d.loadCurr_l3 || 0;

                            // User Request: Use same current for Mains (Load Current applies to both)
                            unifiedData.mainsCurrentL1 = unifiedData.currentL1;
                            unifiedData.mainsCurrentL2 = unifiedData.currentL2;
                            unifiedData.mainsCurrentL3 = unifiedData.currentL3;

                            console.log(`[MQTT-DEBUG] Mapping LOAD_CURRENT_23 -> unifiedData: ${d.loadCurr_l1}A`);

                            // RESTORED: Map Breaker Status from Legacy Bits
                            unifiedData.mainsBreakerClosed = d.mainsBreakerClosed;
                            unifiedData.genBreakerClosed = d.genBreakerClosed;

                            // Also map to reg23/24 for debug view
                            unifiedData.reg23 = d.reg23;
                            unifiedData.reg24 = d.reg24;
                        }

                        // Map STATUS_78 (Correct Mode Status)
                        if (d.block === 'STATUS_78') {
                            if (d.opMode !== 'UNKNOWN') {
                                unifiedData.operationMode = d.opMode;
                            }
                            unifiedData.reg78_hex = d.reg78_hex;
                            console.log(`[MQTT-DEBUG] Mapping STATUS_78 -> Mode: ${d.opMode}, Hex: ${d.reg78_hex}`);
                        }

                        // Map PROBE_16
                        if (d.block === 'PROBE_16') {
                            unifiedData.reg16 = d.reg16;
                        }

                        // Recalculate Combined Decimal Run Hours if cache has data
                        if (global.mqttDeviceCache[deviceId]) {
                            const h = global.mqttDeviceCache[deviceId].runHours;
                            const m = global.mqttDeviceCache[deviceId].runMinutes;
                            const decimalHours = h + (m / 60.0);
                            // Format to 2 decimal places
                            unifiedData.runHours = parseFloat(decimalHours.toFixed(2));
                            // FIX: Alias to 'totalHours' to match Frontend Interface
                            unifiedData.totalHours = unifiedData.runHours;
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
                        // FIX: Load existing state instead of wiping it
                        let currentState = {};
                        if (fs.existsSync(stateFile)) {
                            try {
                                const rawState = fs.readFileSync(stateFile, 'utf8');
                                currentState = JSON.parse(rawState);
                            } catch (readErr) {
                                console.error('[MQTT] Failed to read state file, starting fresh:', readErr.message);
                                currentState = {};
                            }
                        } else {
                            currentState = {};
                        }

                        // Default schema to prevent undefined errors
                        const defaultSchema = {
                            voltageL1: 0, voltageL2: 0, voltageL3: 0,
                            currentL1: 0, currentL2: 0, currentL3: 0,
                            activePower: 0, apparentEnergy: 0, // NEW
                            mainsBreakerClosed: false, genBreakerClosed: false, // NEW
                            mainsVoltageL1: 0, mainsVoltageL2: 0, mainsVoltageL3: 0,
                            mainsVoltageL12: 0, mainsVoltageL23: 0, mainsVoltageL31: 0,
                            operationMode: 'MANUAL', // Default
                            fuelLevel: 0, engineTemp: 0, oilPressure: 0, batteryVoltage: 0,
                            rpm: 0, totalHours: 0, runHours: 0,
                            activePower: 0, powerFactor: 0,
                            frequency: 0, mainsFrequency: 0
                        };

                        // Merge logic: Defaults <- Existing from File <- New Unified Data
                        const existingDeviceData = currentState[deviceId]?.data || {};
                        currentState[deviceId] = {
                            ...updatePayload,
                            data: { ...existingDeviceData, ...unifiedData }
                        };

                        try {
                            fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2));
                        } catch (writeErr) {
                            console.error('[MQTT] Failed to write state file:', writeErr.message);
                        }

                        // 3. Broadcast to Real-Time Clients (Moved inside Try block to access currentState)
                        if (currentState[deviceId]) {
                            io.emit('generator:update', currentState[deviceId]);
                        } else {
                            io.emit('generator:update', updatePayload);
                        }
                    } catch (err) {
                        console.error('[MQTT] State Update/Broadcast Error:', err.message);
                        // Fallback: emit partial if state failed
                        io.emit('generator:update', updatePayload);
                    }

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
                                    run_hours = COALESCE($22, run_hours),
                                    active_power = COALESCE($23, active_power),
                                    power_factor = COALESCE($24, power_factor)
                                WHERE id = $18 OR connection_info->>'ip' = $18
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
                                unifiedData.runHours,
                                unifiedData.activePower,
                                unifiedData.powerFactor
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



    // Dynamic Polling List
    // Dynamic Polling List
    // Note: devicesToPoll is now module-scoped above

    const updatePollingList = async () => {
        try {
            const res = await pool.query("SELECT connection_info FROM generators");
            devicesToPoll = res.rows
                .filter(row => row.connection_info && row.connection_info.ip) // Ensure valid config
                .map(row => ({
                    id: row.connection_info.ip,
                    slaveId: parseInt(row.connection_info.slaveId) || 1 // Fetch Slave ID or Default 1
                }));

            // console.log('[MQTT] Updated Polling List:', devicesToPoll);
        } catch (err) {
            console.error('[MQTT] Failed to update polling list:', err.message);
        }
    };

    // Initial fetch and periodic update
    updatePollingList();
    setInterval(updatePollingList, 30000); // Check for new configs every 30s

    // POLLING LOOP (Ativo)
    // Iniciar Polling Ativo Cíclico
    // Intervalo: 15s
    setInterval(() => {
        if (client && client.connected) {
            if (devicesToPoll.length === 0) return;

            devicesToPoll.forEach(device => {
                const deviceId = device.id;
                const slaveId = device.slaveId; // Dynamic Slave ID
                const topic = `devices/command/${deviceId}`;

                // console.log(`[MQTT-POLL] Polling ${deviceId} (Slave ${slaveId})...`);

                // Sequência de Comandos (Relaxada - 2s por request)
                // 1. Horímetro (60, 2 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 60, 2));
                }, 0);

                // 2. Minutos (62, 1 reg)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 62, 1));
                }, 1000); // +1s

                // 3. Motor (51, 9 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 51, 9));
                }, 3000); // +2s

                // 4. Tensões Gerador (1, 9 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 1, 9));
                }, 5000); // +2s

                // 5. Tensões Rede (14, 9 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 14, 9));
                }, 7000); // +2s

                // 6. Active Power (30, 2 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 30, 2));
                }, 9000); // +2s

                // 7. Apparent Energy (43, 2 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 43, 2));
                }, 11000); // +2s

                // 8. Alarm Code (66, 1 reg) - NEW
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 66, 1));
                }, 12000); // +1s

                // 8. Correntes (10, 3 regs) - MOVED TO END
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 10, 3));
                }, 13000); // +2s

                // 9. STATUS PROBE (23-29) - Finding Breaker Status
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 23, 3)); // Fixed len
                }, 15000); // +2s

                // 10. OPERATION MODE (0, 1 reg)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 0, 1));
                }, 16000); // +1s

                // 11. MAINS CURRENT PROBE (116, 3 regs)
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 116, 3));
                }, 17000); // +1s

                // 12. MODE PROBE (16, 1 reg) - Checking if this is the real status
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 16, 1));
                }, 18000); // +1s

                // 13. REAL STATUS PROBE (78, 1 reg) - User confirmed 0x6480 from Reg 78
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 78, 1));
                }, 19000); // +1s

                // 14. ACTIVE POWER (29, 1 reg) - User requested new source
                setTimeout(() => {
                    client.publish(topic, createModbusReadRequest(slaveId, 29, 1));
                    console.log(`[MQTT-POLL] Ciclo completo enviado para ${deviceId}`);
                }, 20000); // +1s
            });
        }
    }, 15000);
};

// ==========================================
// CONTROL & COMMAND FUNCTIONS
// ==========================================

// Helper to create Modbus Write Request (Function 06 - Write Single Register)
function createModbusWriteRequest(slaveId, address, value) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(slaveId, 0); // Slave ID
    buffer.writeUInt8(6, 1);       // Function Code 06 (Write Single Register)
    buffer.writeUInt16BE(address, 2); // Address
    buffer.writeUInt16BE(value, 4);   // Value to write

    // CRC
    const crc = crc16Modbus(buffer.slice(0, 6));
    buffer.writeUInt16LE(crc, 6);

    return buffer;
}

// Helper for Function 16 (Write Multiple Registers)
function createModbusWriteMultipleRequest(slaveId, startAddress, values) {
    const quantity = values.length;
    const byteCount = quantity * 2;
    const buffer = Buffer.alloc(7 + byteCount + 2); // 7 header + bytes + 2 crc

    buffer.writeUInt8(slaveId, 0);
    buffer.writeUInt8(16, 1); // Func 16
    buffer.writeUInt16BE(startAddress, 2);
    buffer.writeUInt16BE(quantity, 4);
    buffer.writeUInt8(byteCount, 6);

    for (let i = 0; i < quantity; i++) {
        buffer.writeUInt16BE(values[i], 7 + (i * 2));
    }

    const crc = crc16Modbus(buffer.slice(0, 7 + byteCount));
    buffer.writeUInt16LE(crc, 7 + byteCount);

    return buffer;
}

// Helper: Trigger Burst Polling for immediate feedback
const triggerBurstPolling = (client, topic, slaveId) => {
    let count = 0;
    const max = 15; // 30 seconds total

    console.log(`[MQTT-BURST] Iniciando Polling Acelerado para ${topic}`);

    const poll = () => {
        if (!client.connected) return;
        // Poll Critical Registers: Alarm (66), Status (78/0), and Voltages (1)
        console.log(`[MQTT-BURST] Envia 66 (Alarm) para ${topic}`);
        client.publish(topic, createModbusReadRequest(slaveId, 66, 1)); // Alarm
        setTimeout(() => client.publish(topic, createModbusReadRequest(slaveId, 78, 1)), 500); // Status
        setTimeout(() => client.publish(topic, createModbusReadRequest(slaveId, 1, 9)), 1000); // Voltage Check
        // console.log(`[MQTT-BURST] Ciclo ${count}/${max}`);
    };

    // Execute with a small safety delay to avoid collision with the Write Command
    setTimeout(() => {
        poll();
    }, 200);

    const interval = setInterval(() => {
        count++;
        if (count > max || !client.connected) {
            clearInterval(interval);
            console.log(`[MQTT-BURST] Fim do Polling Acelerado para ${topic}`);
            return;
        }
        poll();
    }, 2000); // Every 2 seconds
};

// Exported Command Function
export const sendControlCommand = (deviceId, action) => {
    try {
        const client = global.mqttClient;
        if (!client || !client.connected) {
            const reason = lastConnectionError || 'Unknown connection issue';
            console.error(`[MQTT-CMD] Client not connected. Reason: ${reason}`);
            return { success: false, error: `MQTT Not Connected. Reason: ${reason}` };
        }

        // Since devicesToPoll is local to this module, we can access it.
        // Ensure we find the slaveId.
        const device = devicesToPoll.find(d => d.id === deviceId);

        if (!device) {
            const available = devicesToPoll.map(d => d.id).join(', ');
            console.error(`[MQTT-CMD] Device ${deviceId} not found. Available: [${available}]`);
            return { success: false, error: `Device '${deviceId}' not found in polling list. Available: [${available}]` };
        }

        const { slaveId } = device;
        const topic = `devices/command/${deviceId}`;

        console.log(`[MQTT-CMD] Action: ${action} -> Device: ${deviceId} (Slave ${slaveId})`);

        let valueToWrite = 0;

        // Logic based on User Documentation / Confirmation
        // START: Pulse on Reg 99 (0x63). Write 1 -> Wait 500ms -> Write 0.

        if (action === 'start') {
            // Dynamic generation (Function 16, Reg 0, Val 2)
            // Works for ANY Slave ID.
            // If Slave=1, generates: 01 10 00 00 00 01 02 00 02 27 91 (Confirmed)

            const buf = createModbusWriteMultipleRequest(slaveId, 0, [2]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase(),
                modbusPeriodicitySeconds: 0
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] START: Sent Func 16 (Reg 0, Val 2). Hex: ${buf.toString('hex').toUpperCase()}`);

            // Trigger Burst Polling for immediate feedback
            triggerBurstPolling(client, topic, slaveId);

            return { success: true };
        }



        // STOP: Func 16, Reg 0, Val 1.
        // Hex: 01 10 00 00 00 01 02 00 01 [CRC]
        if (action === 'stop') {
            const buf = createModbusWriteMultipleRequest(slaveId, 0, [1]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase(),
                modbusPeriodicitySeconds: 0
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] STOP: Sent Func 16 (Reg 0, Val 1). Hex: ${buf.toString('hex').toUpperCase()}`);

            // Trigger Burst Polling for immediate feedback
            triggerBurstPolling(client, topic, slaveId);

            return { success: true };
        }

        // Default Logic for Other Commands (Reg 16 - To be confirmed if they move to 99)
        // Keeping Reg 16 for others for now based on previous config
        let regAddress = 16;

        switch (action) {
            case 'manual': // FIX: Map manual to Stop/Reset/Manual Mode (Value 1)
                valueToWrite = 1;
                break;
            case 'auto':
                valueToWrite = 4;
                break;
            case 'ack':
            case 'reset':
                valueToWrite = 64; // SGC ACK KEY
                break;
            default:
                console.warn(`[MQTT-CMD] Unknown action: ${action}`);
                return { success: false, error: `Unknown action '${action}'` };
        }

        if (valueToWrite > 0) {
            // CORRECTION: User Datasheet says Reg 16 is "DG mode change command"
            // Previous value 0 was incorrect.
            const buffer = createModbusWriteRequest(slaveId, 16, valueToWrite);
            client.publish(topic, buffer);
            console.log(`[MQTT-CMD] Sent Modbus Write: Reg 16 = ${valueToWrite} to ${topic}`);
            return { success: true };
        }

        return { success: false, error: 'No value to write for this action' };

    } catch (err) {
        console.error('[MQTT-CMD] Critical Error:', err);
        return { success: false, error: `Backend Crash: ${err.message || String(err)}` };
    }
};
