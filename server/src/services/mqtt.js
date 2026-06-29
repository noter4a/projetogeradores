// Fixed by Agent - Force Update
import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeSgc120Payload, createModbusReadRequest, crc16Modbus } from '../utils/sgc120-parser.js';
import { decodeSgc420Payload, SGC420_POLL_SEQUENCE, isSgc420Controller, reconcileSgc420BreakerState } from '../utils/sgc420-parser.js';
import { decodeAgc150Payload, AGC150_POLL_SEQUENCE, isAgc150Controller, reconcileAgc150BreakerState } from '../utils/agc150-parser.js';
import { decodeKvaPayload } from '../utils/kva-parser.js';
import { decodeDsePayload } from '../utils/dse-parser.js';
import { DSE4501_POLL_SEQUENCE, DSE_CONTROL_KEYS } from '../data/dse4501-map.js';
import pool from '../db.js';
import { sendAlarmEmail } from './email.js';
import { sendAlarmWhatsApp, sendAlarmResolvedWhatsApp } from './whatsapp.js';

const notifyUsersAboutAlarm = async (clientPool, generatorId, generatorName, alarmCode, alarmMessage) => {
    try {
        const res = await clientPool.query(
            `SELECT u.email, u.email_alerts, u.phone, u.whatsapp_alerts FROM users u 
             LEFT JOIN generators g ON g.company_id = u.company_id 
             WHERE u.role = 'ADMIN' OR g.id = $1`,
            [generatorId]
        );
        const emailUsers = res.rows.filter(row => row.email && row.email_alerts !== false);
        const emails = [...new Set(emailUsers.map(row => row.email))];
        if (emails.length > 0) {
            await sendAlarmEmail(emails, generatorId, generatorName, { code: alarmCode, description: alarmMessage });
        }
        // WhatsApp notifications
        const whatsappUsers = res.rows.filter(row => row.phone && row.whatsapp_alerts === true);
        for (const user of whatsappUsers) {
            await sendAlarmWhatsApp(user.phone, generatorName, alarmMessage, 'ATIVO');
        }
    } catch (err) {
        console.error('[MQTT] Failed finding users for alarm notification:', err.message);
    }
};

const notifyUsersAlarmResolved = async (clientPool, generatorId, generatorName) => {
    try {
        const res = await clientPool.query(
            `SELECT u.phone, u.whatsapp_alerts FROM users u 
             LEFT JOIN generators g ON g.company_id = u.company_id 
             WHERE (u.role = 'ADMIN' OR g.id = $1) AND u.phone IS NOT NULL AND u.whatsapp_alerts = true`,
            [generatorId]
        );
        for (const user of res.rows) {
            await sendAlarmResolvedWhatsApp(user.phone, generatorName);
        }
    } catch (err) {
        console.error('[MQTT] Failed sending alarm resolved WhatsApp:', err.message);
    }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../../logs/mqtt_data.json');

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Global in-memory cache for generators state to avoid synchronous file operations on every MQTT packet
let currentGeneratorsState = {};

const stateFile = path.join(__dirname, '../../logs/generators_state.json');
try {
    const stateDir = path.dirname(stateFile);
    if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    if (fs.existsSync(stateFile)) {
        const rawState = fs.readFileSync(stateFile, 'utf8');
        currentGeneratorsState = JSON.parse(rawState);
    }
} catch (err) {
    console.error('[MQTT] Failed to load initial state file:', err.message);
}

// Log rotation settings
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

async function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stats = await fs.promises.stat(LOG_FILE);
        if (stats.size < MAX_LOG_SIZE_BYTES) return;

        console.log('[LOG-ROTATION] LOG_FILE size exceeded 5MB, rotating logs...');
        
        const file3 = path.join(logDir, 'mqtt_data.3.json');
        const file2 = path.join(logDir, 'mqtt_data.2.json');
        const file1 = path.join(logDir, 'mqtt_data.1.json');

        if (fs.existsSync(file2)) {
            if (fs.existsSync(file3)) {
                await fs.promises.unlink(file3).catch(() => {});
            }
            await fs.promises.rename(file2, file3).catch(() => {});
        }
        if (fs.existsSync(file1)) {
            await fs.promises.rename(file1, file2).catch(() => {});
        }
        await fs.promises.rename(LOG_FILE, file1).catch(() => {});
        
        console.log('[LOG-ROTATION] Log rotation complete.');
    } catch (err) {
        console.error('[LOG-ROTATION] Failed to rotate logs:', err.message);
    }
}

let client;
let lastConnectionError = null;
let devicesToPoll = [];
let pausedDevices = new Set(); // Prevent polling collisions during commands
const modemLastDataReceived = new Map(); // deviceId -> Date.now() — Watchdog tracking
const lastLinkHeartbeatDb = new Map(); // deviceId -> last DB heartbeat ms

/** Mark device as online at link layer (MQTT/RS485 responded) even when Modbus decode fails. */
function emitDr164LinkHeartbeat(deviceId, io) {
    const now = Date.now();
    io.emit('generator:update', {
        id: deviceId,
        timestamp: new Date().toISOString(),
        data: { lastDataReceived: now },
    });
    const lastDb = lastLinkHeartbeatDb.get(deviceId) || 0;
    if (now - lastDb > 15000) {
        lastLinkHeartbeatDb.set(deviceId, now);
        pool.query(
            "UPDATE generators SET last_connected = NOW() WHERE id = $1 OR connection_info->>'ip' = $1",
            [deviceId]
        ).catch(err => console.error('[MQTT] Link heartbeat DB error:', err.message));
    }
}

// ==========================================
// USR-DR164 TRANSPARENT MODE SUPPORT
// ==========================================
// DR164 sends/receives raw Modbus RTU bytes over MQTT (no JSON wrapper).
// Each device gets its own independent polling timer for true parallel operation.
let dr164Devices = [];
// Tracks the last operation mode commanded to a DR164 DEIF device ('AUTO' | 'MANUAL').
// Used to disambiguate the controller's operation mode when the raw registers are ambiguous
// (e.g. "AUTO stopped/faulted" reports the same Reg16=0 / Reg78 high byte 0x20 as "MANUAL stopped").
const dr164CommandedMode = new Map(); // deviceId -> 'AUTO' | 'MANUAL'
const dseCommandedMode = new Map(); // deviceId -> 'AUTO' | 'MANUAL' | 'INHIBITED'
const dr164PendingRequests = new Map();   // deviceId -> { requestHex, slaveId, fn, startAddress, quantity, sentAt }
const dr164ResponseResolvers = new Map(); // deviceId -> resolve() function for async polling
const dr164DeviceTimers = new Map();      // deviceId -> setInterval ID (per-device independent polling)
const dr164ConsecutiveTimeouts = new Map(); // deviceId -> number — tracks consecutive timeouts for abort logic
const dr164LastGhostResponse = new Map();   // deviceId -> Date.now() — tracks when a ghost response was received
let watchdogTimerId = null;                 // Global watchdog timer ID

// Resilience constants
const DR164_POLL_INTERVAL_MS = 30000;      // 30s between poll cycles (was 15s — too aggressive for RS485)
const DR164_STEP_GAP_MS = 1500;            // 1.5s gap between Modbus steps (was 1s)
const DR164_TIMEOUT_MS = 5000;             // 5s timeout per step
const DR164_POST_TIMEOUT_DRAIN_MS = 2500;  // 2.5s drain after timeout to flush late responses
const DR164_POST_ERROR_DRAIN_MS = 3000;    // 3s drain after errors
const DR164_MAX_CONSECUTIVE_TIMEOUTS = 3;  // Abort cycle after 3 consecutive timeouts
const DR164_WATCHDOG_INTERVAL_MS = 60000;  // 60s watchdog check interval
const DR164_STALE_THRESHOLD_MS = 180000;   // 3 minutes — mark device as stale
const DR164_DEAD_THRESHOLD_MS = 600000;    // 10 minutes — mark device as dead/offline

export let updatePollingList = async () => {};

const DR164_POLL_SEQUENCE = [
    { startAddress: 77, quantity: 2 },   // 1. Inputs + Mode (Reg 77-78) — PRIORITY: fastest mode feedback
    { startAddress: 60, quantity: 5 },   // 2. Run Hours (Reg 60-64)
    { startAddress: 1,  quantity: 9 },   // 3. Gen Voltages (Reg 1-9)
    { startAddress: 51, quantity: 11 },  // 4. Engine (Reg 51-61)
    { startAddress: 14, quantity: 9 },   // 5. Mains Voltages (Reg 14-22)
    { startAddress: 23, quantity: 3 },   // 6. Current/Breaker (Reg 23-25)
    { startAddress: 29, quantity: 3 },   // 7. Active Power (Reg 29-31)
    { startAddress: 16, quantity: 1 },   // 8. Status (Reg 16)
    { startAddress: 65, quantity: 12 },  // 9. Alarms Complete (Reg 65-76) — SINGLE SOURCE OF TRUTH for alarm state
];

function getPollSequenceForController(controller) {
    if (isAgc150Controller(controller)) return AGC150_POLL_SEQUENCE;
    if (isSgc420Controller(controller)) return SGC420_POLL_SEQUENCE;
    return DR164_POLL_SEQUENCE;
}

function buildPollRequestHexList(slaveId, controller) {
    return getPollSequenceForController(controller).map(req =>
        createModbusReadRequest(slaveId, req.startAddress, req.quantity, req.fn ?? 3).toString('hex').toUpperCase()
    );
}

function controllerProfileLabel(controller) {
    if (isAgc150Controller(controller)) return 'AGC150';
    if (isSgc420Controller(controller)) return 'SGC420';
    return 'DR164';
}

function resolveDeviceController(deviceId) {
    const device = dr164Devices.find(d => d.id === deviceId)
        || devicesToPoll.find(d => d.id === deviceId);
    return (device?.controller || 'deif').toLowerCase();
}

const dr164Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// KVA Controller Poll Sequence (K30XTe / K30XL / Eclipse)
// Uses register addresses in the 12000+ range
const KVA_POLL_SEQUENCE = [
    { startAddress: 12001, quantity: 7 },   // Horímetro + Falhas + Avisos + Status LEDs
    { startAddress: 12011, quantity: 15 },  // Rede + GMG Tensões LL + Correntes + Potências + FP
    { startAddress: 12027, quantity: 7 },   // RPM + Temp + Pressão + Combustível + Bateria
    { startAddress: 12043, quantity: 6 },   // Tensões Fase-Neutro (Rede + GMG)
];

// DSE4501 GenComm poll sequence — see server/src/data/dse4501-map.js
const DSE_POLL_SEQUENCE = DSE4501_POLL_SEQUENCE;

function waitForDR164Response(deviceId, timeoutMs) {
    return new Promise((resolve) => {
        dr164ResponseResolvers.set(deviceId, resolve);
        setTimeout(() => {
            if (dr164ResponseResolvers.has(deviceId)) {
                dr164ResponseResolvers.delete(deviceId);
                dr164PendingRequests.delete(deviceId);
                console.log(`[DR164] ⏱ Timeout waiting for ${deviceId} (${timeoutMs}ms)`);
                resolve('timeout');
            }
        }, timeoutMs);
    });
}

/**
 * Handle binary response from DR164 device.
 * Creates a synthetic JSON payload compatible with existing decodeSgc120Payload parser.
 */
function handleDR164BinaryResponse(deviceId, rawBuffer, io) {
    const pending = dr164PendingRequests.get(deviceId);
    if (!pending) {
        // Ghost response — arrived after timeout. Track it to avoid sending next command too fast.
        dr164LastGhostResponse.set(deviceId, Date.now());
        console.log(`[DR164] ⚠ Ghost response for ${deviceId} (no pending request) — marking for drain.`);
        return;
    }

    const respHex = rawBuffer.toString('hex');
    console.log(`[DR164] Response for ${deviceId}: ${respHex} (Req: Addr ${pending.startAddress}, Qty ${pending.quantity})`);

    // Modbus exception (fn >= 0x80): link is OK but register map/slave may be wrong
    if (rawBuffer.length >= 3 && (rawBuffer[1] & 0x80)) {
        console.warn(`[DR164] Modbus EXCEPTION for ${deviceId}: code ${rawBuffer[2]} at Addr ${pending.startAddress} — no telemetry decoded`);
    }

    // Valid response received — reset consecutive timeout counter
    dr164ConsecutiveTimeouts.set(deviceId, 0);

    // Create synthetic modem payload that the existing parser understands
    const syntheticPayload = {
        modbusRequest: [pending.requestHex],
        modbusResponse: [respHex]
    };

    // Clear pending request BEFORE processing to avoid re-entry issues
    dr164PendingRequests.delete(deviceId);

    // Resolve the polling promise so next request can proceed
    const resolver = dr164ResponseResolvers.get(deviceId);
    if (resolver) {
        dr164ResponseResolvers.delete(deviceId);
        resolver();
    }

    // Return the synthetic payload so the main handler can process it
    return syntheticPayload;
}

/**
 * Poll a single DR164 device sequentially (one Modbus request at a time).
 */
async function pollDR164Device(device) {
    if (!client || !client.connected) return;

    // Select poll sequence based on controller type
    const isKva = device.controller === 'kva' || device.controller === 'kvar';
    const isDse = device.controller === 'dse';
    const isSgc420 = isSgc420Controller(device.controller);
    const isAgc150 = isAgc150Controller(device.controller);
    const pollSequence = isKva ? KVA_POLL_SEQUENCE
        : (isDse ? DSE_POLL_SEQUENCE : getPollSequenceForController(device.controller));
    const controllerLabel = isKva ? 'KVA' : (isDse ? 'DSE' : controllerProfileLabel(device.controller));

    const topic = `devices/command/${device.id}`;
    console.log(`[${controllerLabel}] Starting poll cycle for ${device.id} (Slave ${device.slaveId}) — ${pollSequence.length} steps`);

    let consecutiveTimeouts = 0;
    let stepIndex = 0;
    for (const req of pollSequence) {
        stepIndex++;

        // === GUARD 1: MQTT client alive ===
        if (!client || !client.connected) {
            console.log(`[DR164] Client disconnected, aborting cycle for ${device.id}`);
            break;
        }

        // === GUARD 2: Device not paused for command ===
        if (pausedDevices.has(device.id)) {
            console.log(`[DR164] Polling loop for ${device.id} paused due to command, aborting cycle`);
            break;
        }

        // === GUARD 3: Too many consecutive timeouts — serial bus is broken ===
        if (consecutiveTimeouts >= DR164_MAX_CONSECUTIVE_TIMEOUTS) {
            console.warn(`[DR164] ⛔ ${device.id}: ${consecutiveTimeouts} consecutive timeouts — aborting cycle to protect serial bus`);
            break;
        }

        // === GUARD 4: Ghost response drain — wait if a late response just arrived ===
        const lastGhost = dr164LastGhostResponse.get(device.id);
        if (lastGhost && (Date.now() - lastGhost) < 1000) {
            console.log(`[DR164] Draining ghost response for ${device.id}, waiting 1s...`);
            await dr164Sleep(1000);
            dr164LastGhostResponse.delete(device.id);
        }

        try {
            console.log(`[${controllerLabel}] [${device.id}] Step ${stepIndex}/${pollSequence.length}: Fn ${req.fn ?? 3} Addr ${req.startAddress}, Qty ${req.quantity}`);
            const frame = createModbusReadRequest(device.slaveId, req.startAddress, req.quantity, req.fn ?? 3);

            // Store pending request info for response correlation
            dr164PendingRequests.set(device.id, {
                requestHex: frame.toString('hex').toUpperCase(),
                slaveId: device.slaveId,
                fn: req.fn ?? 3,
                startAddress: req.startAddress,
                quantity: req.quantity,
                sentAt: Date.now()
            });

            // Send raw binary frame to DR164
            client.publish(topic, frame);

            // Wait for response
            const result = await waitForDR164Response(device.id, DR164_TIMEOUT_MS);

            if (result === 'timeout') {
                consecutiveTimeouts++;
                dr164ConsecutiveTimeouts.set(device.id, (dr164ConsecutiveTimeouts.get(device.id) || 0) + 1);
                console.warn(`[DR164] ${device.id} timeout streak: ${consecutiveTimeouts} (global: ${dr164ConsecutiveTimeouts.get(device.id)})`);
                // Post-timeout drain — give the serial bus time to flush any late bytes
                await dr164Sleep(DR164_POST_TIMEOUT_DRAIN_MS);
            } else {
                // Successful response — reset timeout counter
                consecutiveTimeouts = 0;
                // Normal gap between requests
                await dr164Sleep(DR164_STEP_GAP_MS);
            }
        } catch (stepErr) {
            console.error(`[DR164] Error polling ${device.id} addr ${req.startAddress}: ${stepErr.message}`);
            // Clean up any dangling state for this device
            dr164PendingRequests.delete(device.id);
            const resolver = dr164ResponseResolvers.get(device.id);
            if (resolver) {
                dr164ResponseResolvers.delete(device.id);
                resolver('error');
            }
            consecutiveTimeouts++;
            // Longer recovery after error — give the gateway time to flush
            await dr164Sleep(DR164_POST_ERROR_DRAIN_MS);
        }
    }

    // Log final result
    if (consecutiveTimeouts >= DR164_MAX_CONSECUTIVE_TIMEOUTS) {
        console.warn(`[DR164] ⚠ Poll cycle for ${device.id} ABORTED due to serial timeouts. Device may be offline or RS485 bus congested.`);
    } else {
        console.log(`[${controllerLabel}] ✓ Poll cycle complete for ${device.id}`);
    }
}

/**
 * DR164 polling loop — runs sequentially through all DR164 devices.
 * Uses a finally block to GUARANTEE the active flag is always reset.
 */
// Per-device active flags to prevent overlapping polls on the same device
const dr164DevicePollingActive = new Map(); // deviceId -> boolean

/**
 * Start independent polling for a single DR164 device.
 * Each device gets its own setInterval, so all devices poll in parallel.
 */
function startDR164DevicePolling(device) {
    if (dr164DeviceTimers.has(device.id)) {
        return; // Already polling this device
    }

    const label = devicePollingLabel(device);
    console.log(`[${label}] Starting independent polling timer for ${device.id} (interval: ${DR164_POLL_INTERVAL_MS}ms)`);

    // Clear stale state before starting
    dr164ConsecutiveTimeouts.set(device.id, 0);
    dr164LastGhostResponse.delete(device.id);
    dr164PendingRequests.delete(device.id);
    dr164DevicePollingActive.set(device.id, false);

    const deviceId = device.id;

    // Run immediately on first start
    pollSingleDR164Device(deviceId);

    // Always resolve latest config from dr164Devices (controller may change in DB)
    const timerId = setInterval(() => {
        if (client && client.connected) {
            pollSingleDR164Device(deviceId);
        }
    }, DR164_POLL_INTERVAL_MS);

    dr164DeviceTimers.set(device.id, timerId);
}

function devicePollingLabel(device) {
    if (!device) return 'DR164';
    const isKva = device.controller === 'kva' || device.controller === 'kvar';
    const isDse = device.controller === 'dse';
    return isKva ? 'KVA' : (isDse ? 'DSE' : controllerProfileLabel(device.controller));
}

function restartDR164DevicePolling(device) {
    stopDR164DevicePolling(device.id);
    startDR164DevicePolling(device);
}

/**
 * WATCHDOG SYSTEM — Monitors all DR164 devices for staleness and auto-recovers.
 * Runs every 60 seconds. Detects devices that stopped responding and cleans up
 * stuck state to allow recovery when they reconnect.
 */
function startDeviceWatchdog() {
    if (watchdogTimerId) {
        clearInterval(watchdogTimerId);
    }

    console.log(`[WATCHDOG] Starting device watchdog (interval: ${DR164_WATCHDOG_INTERVAL_MS}ms, stale: ${DR164_STALE_THRESHOLD_MS}ms, dead: ${DR164_DEAD_THRESHOLD_MS}ms)`);

    watchdogTimerId = setInterval(() => {
        const now = Date.now();
        let staleCount = 0;
        let deadCount = 0;
        let healthyCount = 0;

        for (const device of dr164Devices) {
            const lastSeen = modemLastDataReceived.get(device.id);
            const hasTimer = dr164DeviceTimers.has(device.id);
            const isActive = dr164DevicePollingActive.get(device.id);
            const globalTimeouts = dr164ConsecutiveTimeouts.get(device.id) || 0;

            if (!lastSeen) {
                // Never received data — might be newly registered or powered off
                if (!hasTimer && client && client.connected) {
                    console.log(`[WATCHDOG] ${device.id}: Never seen, ensuring polling timer exists`);
                    startDR164DevicePolling(device);
                }
                continue;
            }

            const elapsed = now - lastSeen;

            if (elapsed > DR164_DEAD_THRESHOLD_MS) {
                // DEAD — device has not responded in 10+ minutes
                deadCount++;
                // Clean up stuck state so it can recover when it reconnects
                if (isActive) {
                    console.warn(`[WATCHDOG] ☠ ${device.id}: DEAD (${Math.round(elapsed/1000)}s silent). Resetting stuck polling state.`);
                    dr164DevicePollingActive.set(device.id, false);
                    dr164PendingRequests.delete(device.id);
                    const resolver = dr164ResponseResolvers.get(device.id);
                    if (resolver) {
                        dr164ResponseResolvers.delete(device.id);
                        resolver('watchdog-reset');
                    }
                }
                pausedDevices.delete(device.id); // Reset stuck command pause state
            } else if (elapsed > DR164_STALE_THRESHOLD_MS) {
                // STALE — 3+ minutes without data, might be disconnecting/reconnecting
                staleCount++;
                console.warn(`[WATCHDOG] ⚠ ${device.id}: STALE (${Math.round(elapsed/1000)}s, timeouts: ${globalTimeouts}). Cleaning up state for recovery.`);

                // Reset polling state to allow clean restart
                if (isActive) {
                    dr164DevicePollingActive.set(device.id, false);
                }
                dr164PendingRequests.delete(device.id);
                dr164ConsecutiveTimeouts.set(device.id, 0);
                pausedDevices.delete(device.id); // Reset stuck command pause state

                // If timer is missing, recreate it
                if (!hasTimer && client && client.connected) {
                    console.log(`[WATCHDOG] Restarting polling timer for stale device ${device.id}`);
                    startDR164DevicePolling(device);
                }
            } else {
                healthyCount++;
            }
        }

        if (staleCount > 0 || deadCount > 0) {
            console.log(`[WATCHDOG] Status: ${healthyCount} healthy, ${staleCount} stale, ${deadCount} dead (of ${dr164Devices.length} DR164 devices)`);
        }
    }, DR164_WATCHDOG_INTERVAL_MS);
}

/**
 * AUTO-RECOVERY: Called when we receive data from a DR164 device.
 * If the device doesn't have an active polling timer, restart it automatically.
 * This handles the case where a modem reconnects after a disconnect.
 */
function autoRecoverDR164Device(deviceId) {
    // Check if this deviceId belongs to a DR164 device
    const device = dr164Devices.find(d => d.id === deviceId);
    if (!device) return; // Not a DR164 device, skip

    // If the device has no polling timer, it disconnected and lost its timer
    if (!dr164DeviceTimers.has(deviceId)) {
        console.log(`[AUTO-RECOVERY] 🔄 ${deviceId}: Data received but no polling timer — restarting polling now!`);
        // Clear any stale state
        dr164ConsecutiveTimeouts.set(deviceId, 0);
        dr164DevicePollingActive.set(deviceId, false);
        dr164PendingRequests.delete(deviceId);
        // Restart polling
        startDR164DevicePolling(device);
        return;
    }

    // If polling is stuck (active flag is true for too long), reset it
    const isActive = dr164DevicePollingActive.get(deviceId);
    const lastSeen = modemLastDataReceived.get(deviceId);
    if (isActive && lastSeen) {
        const timeSinceLastData = Date.now() - lastSeen;
        // If we're getting data but the polling flag says "active" for 2+ minutes, it's stuck
        if (timeSinceLastData > 120000) {
            console.log(`[AUTO-RECOVERY] 🔧 ${deviceId}: Polling flag stuck for ${Math.round(timeSinceLastData/1000)}s — resetting.`);
            dr164DevicePollingActive.set(deviceId, false);
        }
    }
}

/**
 * Stop polling for a single DR164 device.
 */
function stopDR164DevicePolling(deviceId) {
    const timerId = dr164DeviceTimers.get(deviceId);
    if (timerId) {
        clearInterval(timerId);
        dr164DeviceTimers.delete(deviceId);
        dr164DevicePollingActive.delete(deviceId);
        const resolver = dr164ResponseResolvers.get(deviceId);
        if (resolver) {
            dr164ResponseResolvers.delete(deviceId);
            resolver('stopped');
        }
        console.log(`[DR164] Stopped polling timer for ${deviceId}`);
    }
}

/**
 * Poll a single device (called by its own independent timer).
 * Has a per-device guard to prevent overlapping if previous cycle is still running.
 */
async function pollSingleDR164Device(deviceOrId) {
    const device = typeof deviceOrId === 'string'
        ? dr164Devices.find(d => d.id === deviceOrId)
        : deviceOrId;
    if (!device) return;

    if (dr164DevicePollingActive.get(device.id)) {
        return; // Previous poll cycle for THIS device is still running
    }
    if (pausedDevices.has(device.id)) {
        console.log(`[DR164] Skipping poll cycle for ${device.id} because device is paused for command.`);
        return;
    }
    dr164DevicePollingActive.set(device.id, true);
    try {
        await pollDR164Device(device);
    } catch (err) {
        const label = devicePollingLabel(device);
        console.error(`[${label}] Polling error for ${device.id}:`, err.message);
    } finally {
        dr164DevicePollingActive.set(device.id, false);
    }
}
// ==========================================
// END DR164 SUPPORT
// ==========================================

// Configuration
const BROKER_URL = process.env.MQTT_BROKER_URL;
if (!BROKER_URL) {
    console.error('[MQTT] FATAL: MQTT_BROKER_URL not set in environment variables!');
}

function buildMqttOptions() {
    const rejectUnauthorized = process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== 'false'
        && process.env.NODE_ENV === 'production';
    console.log(`[MQTT] TLS rejectUnauthorized=${rejectUnauthorized} (MQTT_TLS_REJECT_UNAUTHORIZED=${process.env.MQTT_TLS_REJECT_UNAUTHORIZED ?? 'unset'})`);
    return {
        username: process.env.MQTT_USER,
        password: process.env.MQTT_PASSWORD,
        rejectUnauthorized
    };
}

const TOPIC = 'devices/data/#';

/**
 * Initializes the MQTT Service
 * @param {Object} io - The Socket.io server instance
 */
// Initialize Cache
global.mqttDeviceCache = {};

export const initMqttService = (io) => {
    // io is used for real-time updates via the message handler below
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

    client = mqtt.connect(BROKER_URL, buildMqttOptions());
    global.mqttClient = client; // FIX: Expose to global scope for sendControlCommand

    client.on('connect', () => {
        console.log('[MQTT] Connected');
        lastConnectionError = null;
        // AGENT FIX: Clear pausedDevices on reconnect to prevent stuck states
        pausedDevices.clear();
        console.log('[MQTT] Connected & Paused Devices Cleared');
        client.subscribe('devices/data/+');
        console.log('[MQTT] Subscribed to devices/data/+');

        setTimeout(async () => {
            console.log('[MQTT] Fetching fresh polling lists on connection...');
            await updatePollingList();

            console.log(`[MQTT] Sending Initial Configuration to ${devicesToPoll.length} devices...`);

            devicesToPoll.forEach(device => {
                const topic = `devices/command/${device.id}`;
                restorePolling(client, topic, device.slaveId, device.id, device.controller);
            });

            // START WATCHDOG — monitors all DR164 devices for staleness and auto-recovers
            startDeviceWatchdog();
        }, 5000); // Wait 5s for DB fetch and Connection Stability
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

            // DR164 SUPPORT: Try JSON parse first (existing modem pathway).
            // If it fails, the message is raw binary from a DR164 device.
            let payload;
            try {
                payload = JSON.parse(message.toString());
            } catch (jsonErr) {
                // Not JSON — DR164 transparent binary mode
                const deviceId = topic.split('/').pop();

                // AUTO-RECOVERY: Device is alive and sending data — ensure polling is running
                autoRecoverDR164Device(deviceId);

                const syntheticPayload = handleDR164BinaryResponse(deviceId, message, io);
                if (!syntheticPayload) return; // No pending request, ignore
                // Use the synthetic payload and continue with existing processing below
                payload = syntheticPayload;
            }
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
            modemLastDataReceived.set(deviceId, Date.now()); // Watchdog: mark device as alive

            const deviceController = resolveDeviceController(deviceId);
            const isSgc420Device = isSgc420Controller(deviceController);
            const isAgc150Device = isAgc150Controller(deviceController);
            const results = isAgc150Device ? decodeAgc150Payload(payload)
                : isSgc420Device ? decodeSgc420Payload(payload)
                : decodeSgc120Payload(payload);

            // Check if this device uses a KVA or DSE controller
            const isKvaDevice = dr164Devices.some(d => d.id === deviceId && (d.controller === 'kva' || d.controller === 'kvar'));
            const isDseDevice = dr164Devices.some(d => d.id === deviceId && d.controller === 'dse');
            const isDr164Device = dr164Devices.some(d => d.id === deviceId);
            const isDeifDr164Device = isDr164Device && !isKvaDevice && !isDseDevice && !isAgc150Device && !isSgc420Device;
            const isDeifDevice = !isKvaDevice && !isDseDevice && (isDeifDr164Device || isSgc420Device || isAgc150Device);
            const kvaResults = isKvaDevice ? decodeKvaPayload(payload) : [];
            const dseResults = isDseDevice ? decodeDsePayload(payload) : [];

            // If we have valid decoded blocks, merge them into a unified status object
            if (results.length > 0 || kvaResults.length > 0 || dseResults.length > 0) {
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



                        // Map ENGINE_51_59
                        // Map ENGINE_51_59
                        if (d.block === 'ENGINE_51_59') {
                            unifiedData.oilPressure = d.oilPressure_bar || 0;
                            unifiedData.engineTemp = d.coolantTemp_c || 0;
                            unifiedData.fuelLevel = d.fuelLevel_pct || 0;
                            unifiedData.rpm = d.rpm || 0;
                            unifiedData.batteryVoltage = d.batteryVoltage_v || 0;
                            if (d.engineLoad != null) unifiedData.engineLoad = d.engineLoad;

                            // FIX: Capture Run Hours if present in extended Block 51
                            if (d.runHours !== undefined) {
                                global.mqttDeviceCache[deviceId].runHours = d.runHours;
                            }
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

                        // Map ALARM_66 and ALARM_65_76
                        if (d.block === 'ALARM_66' || d.block === 'ALARM_65_76') {
                            if (!unifiedData.alarms) unifiedData.alarms = {};
                            unifiedData.alarms.startFailure = d.startFailure;
                            unifiedData.alarmCode = d.alarmCode;
                            unifiedData.alarmMessage = d.alarmMessage;

                            // Let the centralized Alarm History Persistence logic at the end of this loop handle SQL and Emails.
                            // The old inline logic here was removed to avoid duplication and missing ID resolution bugs.
                        }

                        // Map ENERGY_43 (Apparent Energy)
                        if (d.block === 'ENERGY_43') {
                            unifiedData.apparentEnergy = d.apparentEnergy_kvah || 0;
                        }

                        // Map RUNHOURS_60 (Consolidated Hours + Minutes)
                        if (d.block === 'RUNHOURS_60') {
                            unifiedData.runHours = d.totalHours; // Use the decimal value (e.g. 66.50)
                            unifiedData.totalHours = d.totalHours;

                            // Update Cache (Optional, but good for persistence)
                            if (global.mqttDeviceCache[deviceId]) {
                                global.mqttDeviceCache[deviceId].runHours = d.runHours;
                                global.mqttDeviceCache[deviceId].runMinutes = d.runMinutes;
                            }
                        }

                        // Map CURRENT_10
                        if (d.block === 'CURRENT_10') {
                            // console.log(`[MQTT-DEBUG] Mapping CURRENT_10: L1=${d.curr_l1}, L2=${d.curr_l2}, L3=${d.curr_l3}`);
                            unifiedData.currentL1 = d.curr_l1 || 0;
                            unifiedData.currentL2 = d.curr_l2 || 0;
                            unifiedData.currentL3 = d.curr_l3 || 0;
                        }

                        // Map MAINS_CURRENT_116
                        if (d.block === 'MAINS_CURRENT_116') {
                            // User request: Use Generator Current for Mains. Disabling this to prevent overwrite.
                            // console.log(`[MQTT-DEBUG] IGNORED MAINS_CURRENT_116: ${d.mainsCurr_l1}, ${d.mainsCurr_l2}, ${d.mainsCurr_l3}`);
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

                            // console.log(`[MQTT-DEBUG] Mapping LOAD_CURRENT_23 -> unifiedData: ${d.loadCurr_l1}A`);

                            // Also map to reg23/24 for debug view
                            unifiedData.reg23 = d.reg23;
                            unifiedData.reg24 = d.reg24;
                        }

                        // Map STATUS_COMBINED_77_78 (New Consolidated Block)
                        if (d.block === 'STATUS_COMBINED_77_78') {
                            unifiedData.reg77_hex = d.reg77_hex;
                            unifiedData.reg78_hex = d.reg78_hex;

                            // Cache Reg 78 Integer for Hybrid Logic (Reg 16 + Reg 78 Validation)
                            if (global.mqttDeviceCache[deviceId]) {
                                const reg78_int = parseInt(d.reg78_hex, 16);
                                global.mqttDeviceCache[deviceId].reg78_int = reg78_int;
                                console.log(`[DEBUG-CACHE] ${deviceId} cached Reg78: ${reg78_int} (Hex: 0x${d.reg78_hex})`);
                            }

                            // DR164 DEIF: resolve operation mode from Reg 78, disambiguating with the
                            // last commanded mode when the raw registers are ambiguous.
                            // Field findings:
                            //   - high byte 0x6C (108) / 0x04 (4) => unambiguous AUTO (auto running/ready)
                            //   - high byte 0x64 (100) / 0x60 (96) => unambiguous MANUAL (manual running/test)
                            //   - high byte 0x20 (32) with Reg16=0 => AMBIGUOUS: this is reported both by
                            //     "AUTO stopped/standby/faulted" and "MANUAL stopped". The registers alone
                            //     cannot tell them apart, so we fall back to the last commanded mode.
                            // Only pure DR164 DEIF devices use this; modem SGC120, KVA and DSE keep their logic.
                            // SGC 420: modo no byte alto do Reg 91 (0x4A80=Auto, 0x4280=Manual); ambíguo → último comando
                            if (isAgc150Device) {
                                const resolvedMode = d.opMode
                                    || dr164CommandedMode.get(deviceId)
                                    || currentGeneratorsState[deviceId]?.data?.operationMode
                                    || 'AUTO';
                                unifiedData.operationMode = resolvedMode;
                                if (d.opMode) dr164CommandedMode.set(deviceId, d.opMode);
                                if (d.genBreakerClosed != null) unifiedData.genBreakerClosed = d.genBreakerClosed;
                                console.log(`[AGC150-MODE] ${deviceId} discrete -> ${resolvedMode}${d.running ? ' (running)' : ''}`);
                            } else if (isSgc420Device) {
                                let resolvedMode = d.opMode || null;
                                if (!resolvedMode) {
                                    resolvedMode = dr164CommandedMode.get(deviceId)
                                        || currentGeneratorsState[deviceId]?.data?.operationMode
                                        || 'AUTO';
                                }
                                unifiedData.operationMode = resolvedMode;
                                if (d.opMode) {
                                    dr164CommandedMode.set(deviceId, d.opMode);
                                }
                                console.log(`[SGC420-MODE] ${deviceId} Reg91=0x${d.reg78_hex} dgOp=${d.dgOpMode ?? '?'} -> ${resolvedMode}${d.opMode ? '' : ' (held)'}`);
                                // Chaves QTA: definidas por reconcileSgc420BreakerState (tensão/RPM)
                            } else if (isDeifDevice) {
                                const highByte = parseInt(d.reg78_hex, 16) >> 8;
                                let resolvedMode = null;

                                if (highByte === 108 || highByte === 4) {
                                    resolvedMode = 'AUTO';
                                    dr164CommandedMode.set(deviceId, 'AUTO'); // sync tracker with physical state
                                } else if (highByte === 100 || highByte === 96) {
                                    resolvedMode = 'MANUAL';
                                    dr164CommandedMode.set(deviceId, 'MANUAL'); // sync tracker with physical state
                                } else {
                                    // Ambiguous register state -> trust last commanded mode, else parser opMode
                                    resolvedMode = dr164CommandedMode.get(deviceId)
                                        || (d.opMode && d.opMode !== 'UNKNOWN' ? d.opMode : null);
                                }

                                if (resolvedMode) {
                                    unifiedData.operationMode = resolvedMode;
                                    if (resolvedMode === 'AUTO' && global.mqttDeviceCache[deviceId]) {
                                        global.mqttDeviceCache[deviceId].lastAutoTime = Date.now();
                                    }
                                }
                                console.log(`[DR164-MODE] ${deviceId} Reg78=0x${d.reg78_hex} (Hi=${highByte}) | commanded=${dr164CommandedMode.get(deviceId) || 'none'} -> mode=${resolvedMode || 'hold'}`);
                            }

                            if (!isSgc420Device && !isAgc150Device) {
                                unifiedData.mainsBreakerClosed = d.mainsBreakerClosed;
                                unifiedData.genBreakerClosed = d.genBreakerClosed;
                            }
                        }

                        // Map STATUS_78 (Legacy / Fallback)
                        if (d.block === 'STATUS_78') {
                            // EXCLUSIVE REG 16 MODE:
                            // Ignore d.opMode from Reg 78 completely.

                            unifiedData.reg78_hex = d.reg78_hex;
                            // Fallback Mapping
                            unifiedData.mainsBreakerClosed = d.mainsBreakerClosed;
                            unifiedData.genBreakerClosed = d.genBreakerClosed;
                        }

                        // Map STATUS_77 (Legacy) - REMOVED

                        // Map ACTIVE POWER (29-31)
                        if (d.block === 'ACTIVE_POWER_29_31') {
                            unifiedData.activePowerL1 = d.activePowerL1;
                            unifiedData.activePowerL2 = d.activePowerL2;
                            unifiedData.activePowerL3 = d.activePowerL3;
                            unifiedData.activePowerTotal = d.activePowerTotal;
                            // Alias for DB Storage and Legacy Compatibility
                            unifiedData.activePower = d.activePowerTotal;
                            if (d.engineLoad !== undefined) unifiedData.engineLoad = d.engineLoad;
                        }

                        // Map STATUS_32 (Debug Only)
                        if (d.block === 'STATUS_32') {
                            unifiedData.reg32_hex = d.reg32_hex;
                        }

                        // Map MAINS BREAKER (11000)
                        if (d.block === 'MAINS_BREAKER_11000') {
                            unifiedData.mainsBreakerClosed = d.mainsBreakerClosed;
                        }

                        // Map GEN BREAKER (11001)
                        if (d.block === 'GEN_BREAKER_11001') {
                            unifiedData.genBreakerClosed = d.genBreakerClosed;
                        }

                        // Map STATUS_16 (Discovery/Auto Probe)
                        if (d.block === 'STATUS_16') {
                            // GLITCH FILTER: REMOVED. 0 is a valid value (Manual/Stop).
                            // if (d.val === 0) return;

                            unifiedData.reg16 = d.val;

                            // PERSIST REG 16 IN CACHE (Critical for Anti-Flicker)
                            if (global.mqttDeviceCache[deviceId]) {
                                global.mqttDeviceCache[deviceId].reg16 = d.val;
                            }
                            // OVERRIDE: Bitwise Logic for Auto Mode (Refined)
                            // Rule: Bits 2 (0x04) and 3 (0x08) MUST be OFF for Auto.
                            // BUT Reg 16 value 0 (0x00) is MANUAL/STOP, so it must be excluded.
                            // ---------------------------------------------------------
                            // PRIORITY 1: CHECK REG 78 (MANUAL CONFIRMATION)
                            // ---------------------------------------------------------
                            // User Feedback: "Reg 78 says Manual, but Reg 16 forces Auto".
                            // Fix: If Reg 78 explicitly reports a Manual state (32, 96, 100), we MUST respect it.
                            // We do this BEFORE looking at Reg 16's bitmask.

                            // For pure DR164 DEIF devices the mode is resolved in the Reg 77/78 block
                            // (with commanded-mode disambiguation), so skip the Reg 16 heuristics here
                            // to avoid forcing MANUAL while AUTO-stopped/standby.
                            const skipReg16Mode = isDeifDevice;

                            let priorityManual = false;
                            if (!skipReg16Mode && global.mqttDeviceCache[deviceId]) {
                                const reg78 = global.mqttDeviceCache[deviceId].reg78_int || 0;
                                const highByte = reg78 >> 8;

                                // Manual Codes: 32 (Alarm/Stop), 96 (Test), 100/101 (Manual).
                                // SPECIAL HANDLING FOR 101 (Manual Start):
                                // Code 101 persists while running. If user switches to AUTO while running, 
                                // Reg 16 becomes 2320 (0x910). We must ALLOW this swtich.
                                // So we only enforce Manual for 101 if Reg 16 is NOT 2320.

                                if (highByte === 32 || highByte === 96 || highByte === 100) {
                                    priorityManual = true;
                                } else if (highByte === 101 || highByte === 97) {
                                    // Only force Manual if Reg 16 IS NOT showing clear Auto (Mask 0x0C must be 0)
                                    // 101 (0x65) and 97 (0x61) are Manual Start codes.
                                    // AGENT FIX: Use Bitmask instead of exact 2320 (0x910)
                                    const isReg16Auto = (d.val & 0x0C) === 0 && d.val !== 0;

                                    if (!isReg16Auto) {
                                        priorityManual = true;
                                    } else {
                                        console.log(`[DEBUG-MODE] ${deviceId} Reg78=${highByte} (Start Seq) BUT Reg16=${d.val} (Mask OK) -> ALLOWING AUTO`);
                                        priorityManual = false;
                                    }
                                }

                                console.log(`[DEBUG-MODE] ${deviceId} Reg78 Priority Check: Reg78=${reg78} (Hi=${highByte}) -> Manual? ${priorityManual}`);
                            }

                            if (skipReg16Mode) {
                                // Operation mode for DR164 DEIF is set by the STATUS_COMBINED_77_78 block.
                            } else if (priorityManual) {
                                unifiedData.operationMode = 'MANUAL';
                                console.log(`[DEBUG-MODE] ${deviceId} -> FORCED MANUAL (Priority: Reg78 says Manual - Overrides Reg16)`);
                            } else {
                                const maskResult = (d.val & 0x0C);
                                // console.log(`[DEBUG-MODE] ${deviceId} Reg16=${d.val} (0x${d.val.toString(16)}) | Mask(0x0C)=${maskResult}`);

                                if (maskResult === 0 && d.val !== 0) {
                                    // AGENT TUNING: Immediate Auto if Mask passes and not Manual
                                    unifiedData.operationMode = 'AUTO';
                                    if (global.mqttDeviceCache[deviceId]) {
                                        global.mqttDeviceCache[deviceId].lastAutoTime = Date.now();
                                    }
                                    // console.log(`[DEBUG-MODE] ${deviceId} -> AUTO (Reg16 Valid)`);
                                } else {
                                    // If not explicit Auto, and not explicit Manual -> Do NOT change mode (Hold previous)
                                    // This prevents "Flickering" to Manual during transition bits

                                    // OPTIONAL: If it was Auto recently (Glitch Filter), keep Auto
                                    // But if it's been a while, we just let it be (likely undefined/hold)
                                    if (global.mqttDeviceCache[deviceId] && global.mqttDeviceCache[deviceId].lastAutoTime) {
                                        const timeSinceAuto = Date.now() - global.mqttDeviceCache[deviceId].lastAutoTime;
                                        if (timeSinceAuto < 2000) { // Reduced to 2s debounce
                                            unifiedData.operationMode = 'AUTO';
                                        }
                                    }
                                }
                            }
                        }

                        // Recalculate Combined Decimal Run Hours if cache has data
                        // SKIP for KVA and DSE devices — they have their own totalHours from Modbus registers
                        if (global.mqttDeviceCache[deviceId] && !isKvaDevice && !isDseDevice) {
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

                // ========================================
                // KVA Controller Data Mapping
                // ========================================
                kvaResults.forEach(res => {
                    if (res.ok && res.decoded) {
                        const d = res.decoded;

                        if (d.block === 'KVA_STATUS_12001') {
                            unifiedData.totalHours = d.totalHours;
                            unifiedData.runHours = d.totalHours;
                            unifiedData.operationMode = d.operationMode;
                            unifiedData.mainsBreakerClosed = d.mainsBreakerClosed;
                            unifiedData.genBreakerClosed = d.genBreakerClosed;

                            // Alarm mapping
                            unifiedData.alarmCode = d.alarmCode;
                            unifiedData.alarmMessage = d.alarmMessage;
                            if (!unifiedData.alarms) unifiedData.alarms = {};
                            unifiedData.alarms.startFailure = d.isStartFailure;

                            // Motor running status from LED
                            if (d.motorRunning) {
                                unifiedData.status = 'RUNNING';
                            } else if (d.hasFault) {
                                // Keep status from RPM/voltage check below
                            }
                        }

                        if (d.block === 'KVA_ELECTRICAL_12011') {
                            unifiedData.voltageL12 = d.voltageL12;
                            unifiedData.voltageL23 = d.voltageL23;
                            unifiedData.voltageL31 = d.voltageL31;
                            unifiedData.frequency = d.frequency;
                            unifiedData.mainsVoltageL12 = d.mainsVoltageL12;
                            unifiedData.mainsVoltageL23 = d.mainsVoltageL23;
                            unifiedData.mainsVoltageL31 = d.mainsVoltageL31;
                            unifiedData.mainsFrequency = d.mainsFrequency;
                            unifiedData.currentL1 = d.currentL1;
                            unifiedData.currentL2 = d.currentL2;
                            unifiedData.currentL3 = d.currentL3;
                            unifiedData.activePower = d.activePower;
                            unifiedData.reactivePower = d.reactivePower;
                            unifiedData.apparentPower = d.apparentPower;
                            unifiedData.powerFactor = d.powerFactor;
                            // Use same currents for mains (load current)
                            unifiedData.mainsCurrentL1 = d.currentL1;
                            unifiedData.mainsCurrentL2 = d.currentL2;
                            unifiedData.mainsCurrentL3 = d.currentL3;
                        }

                        if (d.block === 'KVA_ENGINE_12027') {
                            unifiedData.rpm = d.rpm;
                            unifiedData.engineTemp = d.engineTemp;
                            unifiedData.oilPressure = d.oilPressure;
                            unifiedData.fuelLevel = d.fuelLevel;
                            unifiedData.batteryVoltage = d.batteryVoltage;
                        }

                        if (d.block === 'KVA_PHASE_NEUTRAL_12043') {
                            unifiedData.voltageL1 = d.voltageL1;
                            unifiedData.voltageL2 = d.voltageL2;
                            unifiedData.voltageL3 = d.voltageL3;
                            unifiedData.mainsVoltageL1 = d.mainsVoltageL1;
                            unifiedData.mainsVoltageL2 = d.mainsVoltageL2;
                            unifiedData.mainsVoltageL3 = d.mainsVoltageL3;
                            // Calculate average voltage
                            const avgVal = (d.voltageL1 + d.voltageL2 + d.voltageL3) / 3;
                            unifiedData.avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);
                        }
                    }
                });

                // ========================================
                // DSE Controller Data Mapping
                // ========================================
                dseResults.forEach(res => {
                    if (res.ok && res.decoded) {
                        const d = res.decoded;

                        if (d.block === 'DSE_ENGINE_GEN_1024' || d.block === 'DSE_ENGINE_GEN_1024_PART1') {
                            unifiedData.oilPressure = d.oilPressure;
                            unifiedData.engineTemp = d.engineTemp;
                            unifiedData.fuelLevel = d.fuelLevel;
                            unifiedData.batteryVoltage = d.batteryVoltage;
                            unifiedData.rpm = d.rpm;
                            unifiedData.frequency = d.frequency;
                            unifiedData.voltageL1 = d.voltageL1;
                            unifiedData.voltageL2 = d.voltageL2;
                            unifiedData.voltageL3 = d.voltageL3;
                            unifiedData.avgVoltage = d.avgVoltage;
                        }

                        if (d.block === 'DSE_ENGINE_GEN_1024' || d.block === 'DSE_ENGINE_GEN_1038_PART2') {
                            unifiedData.voltageL12 = d.voltageL12;
                            unifiedData.voltageL23 = d.voltageL23;
                            unifiedData.voltageL31 = d.voltageL31;
                            unifiedData.currentL1 = d.currentL1;
                            unifiedData.currentL2 = d.currentL2;
                            unifiedData.currentL3 = d.currentL3;
                            unifiedData.mainsCurrentL1 = d.mainsCurrentL1;
                            unifiedData.mainsCurrentL2 = d.mainsCurrentL2;
                            unifiedData.mainsCurrentL3 = d.mainsCurrentL3;
                        }

                        if (d.block === 'DSE_MAINS_1058') {
                            unifiedData.mainsVoltageL1 = d.mainsVoltageL1;
                            unifiedData.mainsVoltageL2 = d.mainsVoltageL2;
                            unifiedData.mainsVoltageL3 = d.mainsVoltageL3;
                            unifiedData.mainsVoltageL12 = d.mainsVoltageL12;
                            unifiedData.mainsVoltageL23 = d.mainsVoltageL23;
                            unifiedData.mainsVoltageL31 = d.mainsVoltageL31;
                            unifiedData.mainsFrequency = d.mainsFrequency;
                        }

                        if (d.block === 'DSE_POWER_1536') {
                            unifiedData.activePower = d.activePower;
                            unifiedData.activePowerTotal = d.activePowerTotal;
                        }

                        if (d.block === 'DSE_RUNHOURS_1798') {
                            unifiedData.runHours = d.runHours;
                            unifiedData.totalHours = d.totalHours;
                        }

                        if (d.block === 'DSE_POWER_PHASE_1052') {
                            unifiedData.powerL1 = d.powerL1;
                            unifiedData.powerL2 = d.powerL2;
                            unifiedData.powerL3 = d.powerL3;
                        }

                        if (d.block === 'DSE_CONTROL_772') {
                            if (d.operationMode) {
                                unifiedData.operationMode = d.operationMode;
                                dseCommandedMode.set(deviceId, d.operationMode);
                            }
                            console.log(`[DSE-MODE] ${deviceId} Reg772=${d.controlModeRaw} -> mode=${d.operationMode || 'unknown'}`);
                        }

                        if (d.block === 'DSE_FLAGS_774') {
                            if (d.shutdownAlarmActive || d.electricalTripActive) {
                                unifiedData.alarmCode = unifiedData.alarmCode || 3;
                                unifiedData.alarmMessage = unifiedData.alarmMessage || 'Alarme de shutdown no DSE';
                            } else if (d.warningAlarmActive && !unifiedData.alarmCode) {
                                unifiedData.alarmCode = 2;
                                unifiedData.alarmMessage = unifiedData.alarmMessage || 'Alarme de aviso no DSE';
                            }
                        }

                        if (d.block === 'DSE_LOAD_1558') {
                            unifiedData.engineLoad = d.engineLoad;
                        }

                        if (d.block === 'DSE_STATUS_1408') {
                            unifiedData.status = d.status;
                        }

                        if (d.block === 'DSE_ALARMS_2048') {
                            unifiedData.alarmCode = d.alarmCode;
                            unifiedData.alarmMessage = d.alarmMessage || '';
                            if (!unifiedData.alarms) unifiedData.alarms = {};
                            unifiedData.alarms.startFailure = d.isStartFailure;
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
                    // AGENT FIX: Also check Voltage. If Gen Voltage > 50V, it is definitely RUNNING.
                    if (unifiedData.rpm !== undefined || unifiedData.voltageL1 !== undefined) {
                        const isRpmRunning = (unifiedData.rpm && unifiedData.rpm > 100);
                        const isVoltageRunning = (unifiedData.voltageL1 && unifiedData.voltageL1 > 50);

                        // IF either RPM or Voltage indicates running, set RUNNING.
                        // But be careful: If Voltage is 0 and RPM is undefined, we shouldn't force STOPPED if we don't know RPM.
                        // Logic:
                        // If RPM is known: trust RPM.
                        // If RPM is unknown (undefined) but Voltage > 50: trust Voltage.
                        // If RPM is 0 and Voltage > 50: Trust Voltage (Sensor fail?).

                        if (isRpmRunning || isVoltageRunning) {
                            unifiedData.status = 'RUNNING';
                        } else if (unifiedData.rpm !== undefined && unifiedData.rpm < 100) {
                            // Only set STOPPED if RPM explicitly says so (and Voltage is low)
                            if (!isVoltageRunning) unifiedData.status = 'STOPPED';
                        }
                    }

                    const updatePayload = {
                        id: deviceId,
                        timestamp: new Date().toISOString(),
                        data: unifiedData
                    };

                    const decodeLabel = isAgc150Device ? 'AGC-150' : (isSgc420Device ? 'SGC-420' : 'SGC-120');
                    console.log(`[MQTT] Decoded ${decodeLabel} data for ${deviceId}:`, JSON.stringify(unifiedData));

                    // 1. Append valid data to History Log
                    try {
                        const logEntry = JSON.stringify(updatePayload) + '\n';
                        rotateLogIfNeeded().then(() => {
                            fs.promises.appendFile(LOG_FILE, logEntry).catch(err => {
                                console.error('[MQTT] Async History Log Error:', err.message);
                            });
                        }).catch(err => {
                            console.error('[MQTT] Log rotation check failed:', err.message);
                        });
                    } catch (err) {
                        console.error('[MQTT] History Log Error:', err.message);
                    }

                    // 2. Update Current State (generators_state.json) in-memory first, then write asynchronously
                    let existingDeviceData = {}; // HOISTED by Agent
                    try {
                        const stateFile = path.join(__dirname, '../../logs/generators_state.json');
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

                        // Merge logic: Defaults <- Existing from memory <- New Unified Data
                        existingDeviceData = currentGeneratorsState[deviceId]?.data || {}; // Assignment only
                        let mergedData = { ...existingDeviceData, ...unifiedData };

                        if (isSgc420Device) {
                            reconcileSgc420BreakerState(mergedData);
                            unifiedData.mainsBreakerClosed = mergedData.mainsBreakerClosed;
                            unifiedData.genBreakerClosed = mergedData.genBreakerClosed;
                        } else if (isAgc150Device) {
                            reconcileAgc150BreakerState(mergedData);
                            unifiedData.mainsBreakerClosed = mergedData.mainsBreakerClosed;
                            unifiedData.genBreakerClosed = mergedData.genBreakerClosed;
                        }

                        currentGeneratorsState[deviceId] = {
                            ...updatePayload,
                            data: mergedData
                        };

                        // Non-blocking disk write
                        fs.promises.writeFile(stateFile, JSON.stringify(currentGeneratorsState, null, 2)).catch(writeErr => {
                            console.error('[MQTT] Failed to write state file:', writeErr.message);
                        });

                        // 3. Broadcast to Real-Time Clients (Moved inside Try block to access currentState)
                        if (currentGeneratorsState[deviceId]) {
                            // console.log(`[MQTT-SOCKET] Emitting update for ${deviceId}`);
                            io.emit('generator:update', currentGeneratorsState[deviceId]);
                        } else {
                            // console.log(`[MQTT-SOCKET] Emitting payload for ${deviceId}`);
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
                            // --- ALARM HISTORY PERSISTENCE (Robust / Self-Healing) ---
                            if (unifiedData.alarmCode !== undefined) {
                                const newAlarm = unifiedData.alarmCode;
                                const newMsg = unifiedData.alarmMessage || `Alarme Código ${newAlarm}`;

                                // Resolve the real Generator ID from the DB
                                let resolvedGenId = deviceId;
                                let resolvedGenName = deviceId;
                                try {
                                    const resGen = await pool.query(
                                        "SELECT id, name FROM generators WHERE id = $1 OR connection_info->>'ip' = $1 LIMIT 1",
                                        [deviceId]
                                    );
                                    if (resGen.rows.length > 0) {
                                        resolvedGenId = resGen.rows[0].id;
                                        resolvedGenName = resGen.rows[0].name;
                                    }
                                } catch (err) {
                                    console.error('[MQTT] Failed to resolve Generator ID for Alarm History:', err.message);
                                }

                                // Check what's currently open in the DB (source of truth)
                                let dbOpenAlarmCode = 0;
                                try {
                                    const openResult = await pool.query(
                                        "SELECT alarm_code FROM alarm_history WHERE generator_id = $1 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1",
                                        [resolvedGenId]
                                    );
                                    if (openResult.rows.length > 0) {
                                        dbOpenAlarmCode = openResult.rows[0].alarm_code;
                                    }
                                } catch (err) {
                                    console.error('[MQTT] Failed to check open alarms:', err.message);
                                }

                                console.log(`[MQTT-ALARM] ${resolvedGenId}: MQTT code=${newAlarm}, DB open=${dbOpenAlarmCode}`);

                                if (newAlarm > 0 && dbOpenAlarmCode === 0) {
                                    // ALARM STARTED — No open record in DB, insert one
                                    try {
                                        await pool.query(
                                            "INSERT INTO alarm_history (generator_id, alarm_code, alarm_message) VALUES ($1, $2, $3)",
                                            [resolvedGenId, newAlarm, newMsg]
                                        );
                                        console.log(`[MQTT] ✅ ALARME REGISTRADO: ${resolvedGenId} -> ${newAlarm} ("${newMsg}")`);
                                        notifyUsersAboutAlarm(pool, resolvedGenId, resolvedGenName, newAlarm, newMsg);
                                    } catch (insErr) {
                                        console.error('[MQTT] Alarm INSERT Error:', insErr.message);
                                    }
                                } else if (newAlarm > 0 && dbOpenAlarmCode > 0 && newAlarm !== dbOpenAlarmCode) {
                                    // ALARM CHANGED — Close old, open new
                                    try {
                                        await pool.query(
                                            "UPDATE alarm_history SET end_time = NOW() WHERE generator_id = $1 AND end_time IS NULL",
                                            [resolvedGenId]
                                        );
                                        await pool.query(
                                            "INSERT INTO alarm_history (generator_id, alarm_code, alarm_message) VALUES ($1, $2, $3)",
                                            [resolvedGenId, newAlarm, newMsg]
                                        );
                                        console.log(`[MQTT] ⚠️ ALARME MUDOU: ${resolvedGenId} ${dbOpenAlarmCode} -> ${newAlarm}`);
                                        notifyUsersAboutAlarm(pool, resolvedGenId, resolvedGenName, newAlarm, newMsg);
                                    } catch (chgErr) {
                                        console.error('[MQTT] Alarm CHANGE Error:', chgErr.message);
                                    }
                                } else if (newAlarm === 0 && dbOpenAlarmCode > 0) {
                                    // ALARM CLEARED — Close open record
                                    try {
                                        await pool.query(
                                            "UPDATE alarm_history SET end_time = NOW() WHERE generator_id = $1 AND end_time IS NULL",
                                            [resolvedGenId]
                                        );
                                        console.log(`[MQTT] ✅ ALARME RESOLVIDO: ${resolvedGenId} (was ${dbOpenAlarmCode})`);
                                        notifyUsersAlarmResolved(pool, resolvedGenId, resolvedGenName);
                                    } catch (clrErr) {
                                        console.error('[MQTT] Alarm CLEAR Error:', clrErr.message);
                                    }
                                }
                                // else: newAlarm === dbOpenAlarmCode (no change) -> skip
                            }
                            // --------------------------------------------------

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
                                    power_factor = COALESCE($24, power_factor),
                                    last_connected = NOW()
                                WHERE id = $18 OR connection_info->>'ip' = $18
                            `;

                            // FIX: Safe rounding/float mapping
                            // Filters out Modbus error/null flags (e.g. 65535, 6553.5) to prevent numeric overflow
                            const isModbusNull = (v) => {
                                if (v === undefined || v === null || isNaN(v)) return true;
                                const val = parseFloat(v);
                                const abs = Math.abs(val);
                                
                                // Catch-all for large out-of-bounds values (e.g. 32-bit Modbus error flags like 0x7FFFFFFF)
                                if (abs > 999999) return true;
                                
                                // Check ranges for standard Modbus error/null flags
                                // 16-bit Unsigned (65532 - 65535)
                                if (abs >= 65532 && abs <= 65535) return true;
                                if (abs >= 6553.2 && abs <= 6553.5) return true;
                                if (abs >= 655.32 && abs <= 655.35) return true;
                                
                                // 16-bit Signed (32764 - 32768)
                                if (abs >= 32764 && abs <= 32768) return true;
                                if (abs >= 3276.4 && abs <= 3276.8) return true;
                                if (abs >= 327.64 && abs <= 327.68) return true;

                                // 32-bit (4294967292 - 4294967295)
                                if (abs >= 4294967292 && abs <= 4294967295) return true;
                                if (abs >= 429496729.2 && abs <= 429496729.5) return true;
                                if (abs >= 42949672.92 && abs <= 42949672.95) return true;
                                
                                return false;
                            };

                            const safeRound = (v) => {
                                if (isModbusNull(v)) return null;
                                return Math.round(parseFloat(v));
                            };

                            const safeFloat = (v) => {
                                if (isModbusNull(v)) return null;
                                return parseFloat(parseFloat(v).toFixed(2));
                            };

                            const values = [
                                safeFloat(unifiedData.voltageL1),
                                safeFloat(unifiedData.voltageL2),
                                safeFloat(unifiedData.voltageL3),
                                safeRound(unifiedData.currentL1),
                                safeRound(unifiedData.currentL2),
                                safeRound(unifiedData.currentL3),
                                safeFloat(unifiedData.frequency),
                                safeFloat(unifiedData.oilPressure),
                                safeRound(unifiedData.engineTemp),
                                safeRound(unifiedData.fuelLevel),
                                safeRound(unifiedData.rpm),
                                safeFloat(unifiedData.batteryVoltage),
                                safeFloat(unifiedData.mainsVoltageL1),
                                safeFloat(unifiedData.mainsVoltageL2),
                                safeFloat(unifiedData.mainsVoltageL3),
                                safeFloat(unifiedData.mainsFrequency),
                                unifiedData.status || null,
                                // ID to match
                                deviceId,
                                safeRound(unifiedData.voltageL12),
                                safeRound(unifiedData.voltageL23),
                                safeRound(unifiedData.voltageL31),
                                safeFloat(unifiedData.runHours),
                                safeFloat(unifiedData.activePower),
                                safeFloat(unifiedData.powerFactor)
                            ];

                            await pool.query(query, values);
                            console.log(`[MQTT] Persisted data for ${deviceId} to DB.`);

                            // --- INSERT HISTORICAL READING (for Charts) ---
                            if (unifiedData.activePower !== undefined || unifiedData.activePowerTotal !== undefined) {
                                try {
                                    // Resolve the real generator ID for readings
                                    let readingGenId = deviceId;
                                    const genLookup = await pool.query(
                                        "SELECT id FROM generators WHERE id = $1 OR connection_info->>'ip' = $1 LIMIT 1",
                                        [deviceId]
                                    );
                                    if (genLookup.rows.length > 0) readingGenId = genLookup.rows[0].id;

                                    await pool.query(
                                        `INSERT INTO generator_readings (generator_id, active_power, rpm, frequency, voltage_l1, current_l1, fuel_level, engine_temp)
                                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                                        [
                                            readingGenId,
                                            safeFloat(unifiedData.activePower || unifiedData.activePowerTotal || 0),
                                            safeRound(unifiedData.rpm),
                                            safeFloat(unifiedData.frequency),
                                            safeFloat(unifiedData.voltageL1),
                                            safeRound(unifiedData.currentL1),
                                            safeRound(unifiedData.fuelLevel),
                                            safeRound(unifiedData.engineTemp)
                                        ]
                                    );
                                } catch (readingErr) {
                                    console.error('[MQTT] Reading Insert Error:', readingErr.message);
                                }
                            }
                        } catch (dbErr) {
                            console.error('[MQTT] DB Persistence Error:', dbErr.message);
                        }
                    })();
                } else if (isDr164Device) {
                    // Modbus responded but no telemetry decoded (e.g. KVA exception / wrong map)
                    emitDr164LinkHeartbeat(deviceId, io);
                }
            } else if (isDr164Device && payload?.modbusResponse?.some(r => r && r !== '')) {
                emitDr164LinkHeartbeat(deviceId, io);
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

    updatePollingList = async () => {
        try {
            const res = await pool.query("SELECT connection_info FROM generators");
            const allRows = res.rows
                .filter(row => row.connection_info && row.connection_info.ip);

            // Separate modem (default) vs DR164 devices
            const modemRows = allRows.filter(row => (row.connection_info.deviceType || 'modem') !== 'dr164');
            const dr164Rows = allRows.filter(row => row.connection_info.deviceType === 'dr164');

            // --- MODEM DEVICES (existing logic, unchanged) ---
            const newModemDevices = modemRows.map(row => ({
                id: row.connection_info.ip,
                slaveId: parseInt(row.connection_info.slaveId) || 1,
                controller: (row.connection_info.controller || 'deif').toLowerCase()
            }));

            const currentIds = new Set(devicesToPoll.map(d => d.id));
            const newlyAdded = newModemDevices.filter(d => !currentIds.has(d.id));

            devicesToPoll = newModemDevices;

            if (newlyAdded.length > 0 && client && client.connected) {
                console.log(`[MQTT] Detected ${newlyAdded.length} new modem generator(s). Sending configuration...`);
                newlyAdded.forEach(device => {
                    const topic = `devices/command/${device.id}`;
                    restorePolling(client, topic, device.slaveId, device.id, device.controller);
                });
            }

            // --- DR164 DEVICES (new logic) ---
            const newDR164List = dr164Rows.map(row => ({
                id: row.connection_info.ip,
                slaveId: parseInt(row.connection_info.slaveId) || 1,
                controller: (row.connection_info.controller || '').toLowerCase()
            }));

            const prevDr164Ids = new Set(dr164Devices.map(d => d.id));
            const prevDr164ById = new Map(dr164Devices.map(d => [d.id, d]));
            const newDr164Ids = new Set(newDR164List.map(d => d.id));
            const newDr164Added = newDR164List.filter(d => !prevDr164Ids.has(d.id));
            const removedDr164 = dr164Devices.filter(d => !newDr164Ids.has(d.id));
            const configChangedDr164 = newDR164List.filter(d => {
                const prev = prevDr164ById.get(d.id);
                return prev && (prev.controller !== d.controller || prev.slaveId !== d.slaveId);
            });

            dr164Devices = newDR164List;

            // Stop timers for removed devices
            for (const device of removedDr164) {
                stopDR164DevicePolling(device.id);
            }

            // Restart polling when controller or slave ID changes (timer used to keep stale config)
            if (client && client.connected) {
                for (const device of configChangedDr164) {
                    const prev = prevDr164ById.get(device.id);
                    console.log(`[DR164] Config changed for ${device.id}: ${prev?.controller} -> ${device.controller} — restarting poll`);
                    restartDR164DevicePolling(device);
                    const topic = `devices/command/${device.id}`;
                    restorePolling(client, topic, device.slaveId, device.id, device.controller);
                }
            }

            // Start independent timers for any DR164 device not currently being polled
            if (client && client.connected) {
                const missingTimers = dr164Devices.filter(d => !dr164DeviceTimers.has(d.id));
                if (missingTimers.length > 0) {
                    console.log(`[DR164] Starting polling timers for ${missingTimers.length} generator(s): ${missingTimers.map(d => d.id).join(', ')}`);
                    for (const device of missingTimers) {
                        startDR164DevicePolling(device);
                    }
                }
            }

            // console.log('[MQTT] Updated Polling List:', devicesToPoll, 'DR164:', dr164Devices);
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

                // SELF-HEALING: Se este aparelho NÃO estiver na lista de pausados,
                // significa que ele NUNCA recebeu a String de Configuração JSON (ou a conexão caiu e limpou a lista).
                // Ao invés de bombardear com RAW, mandamos a configuração e bloqueamos.
                if (!pausedDevices.has(deviceId)) {
                    console.log(`[MQTT-HEAL] Dispositivo ${deviceId} não inicializado detectado! Enviando Configuração...`);
                    const topic = `devices/command/${deviceId}`;
                    restorePolling(client, topic, device.slaveId, deviceId, device.controller);
                    return; // Interrompe para não mandar RAW
                }

                // SKIP scheduling if already paused
                // Em teoria o return acima já impede, mas mantemos por precaução.
                if (pausedDevices.has(deviceId)) return;

                const slaveId = device.slaveId; // Dynamic Slave ID
                const topic = `devices/command/${deviceId}`;

                // console.log(`[MQTT-POLL] Polling ${deviceId} (Slave ${slaveId})...`);

                // Sequência de Comandos (Relaxada - 2s por request)
                // Checa 'pausedDevices' DENTRO de cada timeout para cancelar se o usuário mandou comando

                // 1. Horímetro (60, 5 regs) - Expanded for DEBUG
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 60, 5));
                }, 0);

                // 2. Minutos (62, 1 reg)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 62, 1));
                }, 1000); // +1s

                // 3. Motor (51, 11 regs) - Expanded to include Run Hours (60-61)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 51, 11));
                }, 3000); // +2s

                // 4. Tensões Gerador (1, 9 regs)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 1, 9));
                }, 5000); // +2s

                // 5. Tensões Rede (14, 9 regs)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 14, 9));
                }, 7000); // +2s

                // 6. Active Power (30, 2 regs)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 30, 2));
                }, 9000); // +2s

                // 7. Apparent Energy (43, 2 regs)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 43, 2));
                }, 11000); // +2s

                // 8. Alarm Code (66, 1 reg) - NEW
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 66, 1));
                }, 12000); // +1s

                // 8. Correntes (10, 3 regs) - MOVED TO END
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 10, 3));
                }, 13000); // +2s

                // 9. STATUS PROBE (23-29) - Finding Breaker Status
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 23, 3)); // Fixed len
                }, 15000); // +2s

                // 10. OPERATION MODE (0, 1 reg)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 0, 1));
                }, 16000); // +1s

                // 11. MAINS CURRENT PROBE (116, 3 regs)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 116, 3));
                }, 17000); // +1s

                // 12. MODE PROBE (16, 1 reg) - Checking if this is the real status
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 16, 1));
                }, 18000); // +1s

                // 13b. STATUS 77-78 (Inputs + Mode)
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 77, 2));
                }, 19000);

                // 14. ACTIVE POWER (29, 3 regs) - Reading L1, L2, L3 to calculate Total
                setTimeout(() => {
                    if (pausedDevices.has(deviceId)) return;
                    client.publish(topic, createModbusReadRequest(slaveId, 29, 3));
                    console.log(`[MQTT-POLL] Ciclo completo enviado para ${deviceId}`);
                }, 20000); // +1s
            });
        }
    }, 15000);

    // ==========================================
    // MODEM WATCHDOG — Auto-Recovery
    // ==========================================
    // If a modem device stops sending data for 2+ minutes, it likely lost its
    // polling configuration (e.g. a command set modbusPeriodicitySeconds=0 and
    // restorePolling failed due to network issues). The watchdog detects this
    // and automatically re-sends the Golden List.
    const WATCHDOG_CHECK_INTERVAL = 60000;  // Check every 60 seconds
    const WATCHDOG_STALE_THRESHOLD = 120000; // 2 minutes without data = stale

    setInterval(() => {
        if (!client || !client.connected) return;
        if (devicesToPoll.length === 0) return;

        const now = Date.now();
        devicesToPoll.forEach(device => {
            const deviceId = device.id;
            const lastReceived = modemLastDataReceived.get(deviceId);

            // If never received data OR stale for more than threshold
            if (lastReceived && (now - lastReceived) > WATCHDOG_STALE_THRESHOLD) {
                const staleSecs = Math.round((now - lastReceived) / 1000);
                console.log(`[WATCHDOG] ⚠️ Modem ${deviceId} sem dados há ${staleSecs}s. Reenviando configuração de polling...`);
                const topic = `devices/command/${deviceId}`;
                restorePolling(client, topic, device.slaveId, deviceId, device.controller);
                // restorePolling resets modemLastDataReceived, preventing re-trigger for 2 min
            }
        });
    }, WATCHDOG_CHECK_INTERVAL);

    // DR164 PARALLEL POLLING — each device gets its own independent timer
    // Started automatically by updatePollingList when new devices are detected.
    // No global setInterval needed here.
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

// Helper: Restore Polling Configuration (User Request: Send full list after 30s)
const restorePolling = (client, topic, slaveId, deviceId, controller = 'deif') => {
    // Immediately pause active Node.js loop for this device to prevent RAW buffer collisions
    // with the Gateway's JSON-based internal polling.
    pausedDevices.add(deviceId);
    modemLastDataReceived.set(deviceId, Date.now()); // Reset watchdog timer to prevent re-trigger
    const profileLabel = isAgc150Controller(controller) ? 'AGC-150' : (isSgc420Controller(controller) ? 'SGC-420' : 'SGC-120');
    console.log(`[MQTT-RESTORE] Aguardando 10s para restaurar lista de polling (${profileLabel})... (Polling ativo Node.js pausado para ${deviceId})`);

    setTimeout(() => {
        if (!client.connected) return;

        console.log(`[MQTT-RESTORE] Enviando lista de polling completa para ${topic} (${profileLabel})`);

        const requests = buildPollRequestHexList(slaveId, controller);

        console.log(`[MQTT-RESTORE] Payload para ${deviceId}:`, JSON.stringify(requests)); // DEBUG LOG

        // REMOVED: Keep-Alive / Config Write (Func 6) - caused "Inhibited" state


        const payload = JSON.stringify({
            modbusRequest: requests,
            modbusPeriodicitySeconds: 10 // User requested 10s
        });

        client.publish(topic, payload);
        console.log(`[MQTT-RESTORE] Configuração enviada! Payload size: ${requests.length} items.`);

        // UNPAUSE Polling - DISABLED
        // Reason: We enabled Gateway Internal Polling (Periodicity: 10s) above.
        // If we also resume Node.js polling, we double-poll and crash the modem.
        // Leaving this device in 'pausedDevices' ensures Node.js stays silent and lets Gateway work.

        /* 
        if (deviceId && pausedDevices.has(deviceId)) {
            pausedDevices.delete(deviceId);
            console.log(`[MQTT-RESTORE] Resuming main polling for ${deviceId}`);
        }
        */

        // FORCE Immediate Status Check REMOVED
        // Reason: The Gateway's internal polling (Bulk 15 items) can take 5-10s if timeouts occur.
        // Injecting any extra poll (even at T+10s) risks colliding with the tail of the Bulk Poll.
        // We must trust the Gateway's internal cycle (Periodicity 30s) completely.

    }, 10000); // Back to 10 seconds as requested by user
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

        // PAUSE Polling for DR164 devices to prevent collisions (modem devices use Gateway internal polling, no pause needed)
        console.log(`[MQTT-CMD] Processing command for ${deviceId}`);

        // Search in both modem and DR164 device lists
        let device = devicesToPoll.find(d => d.id === deviceId);
        let isDR164 = false;

        if (!device) {
            device = dr164Devices.find(d => d.id === deviceId);
            if (device) isDR164 = true;
        }

        if (!device) {
            const allAvailable = [...devicesToPoll, ...dr164Devices].map(d => d.id).join(', ');
            console.error(`[MQTT-CMD] Device ${deviceId} not found. Available: [${allAvailable}]`);
            return { success: false, error: `Device '${deviceId}' not found in polling list. Available: [${allAvailable}]` };
        }

        const { slaveId } = device;
        const topic = `devices/command/${deviceId}`;

        console.log(`[MQTT-CMD] Action: ${action} -> Device: ${deviceId} (Slave ${slaveId}) [${isDR164 ? 'DR164' : 'Modem'}]`);

        // DR164/KVA: Send raw Modbus binary (no JSON wrapper)
        if (isDR164) {
            // Check if this is a KVA or DSE controller
            const isKvaController = device.controller === 'kva' || device.controller === 'kvar';
            const isDseController = device.controller === 'dse';

            if (isKvaController) {
                // KVA: Use register 19108 with Function 06 (Write Single Register)
                // Full KVA Modbus Table (K30XL 3.00 / K30XTe 8.10 / Eclipse 2.00):
                //   1 = Modo Automático, 2 = Modo Manual, 3 = Modo Inibido
                //   4 = Limpa Falha Ativa, 5 = Partida Manual, 6 = Parada Manual
                //   7 = Liga Chave de Carga do Gerador, 8 = Desliga Chave de Carga do Gerador
                //   9 = Liga Chave de Carga da Rede, 10 = Desliga Chave de Carga da Rede
                let commandValue;
                switch (action) {
                    case 'auto':       commandValue = 1;  break;  // Modo Automático
                    case 'manual':     commandValue = 2;  break;  // Modo Manual
                    case 'inhibit':    commandValue = 3;  break;  // Modo Inibido
                    case 'start':      commandValue = 5;  break;  // Partida Manual
                    case 'stop':       commandValue = 6;  break;  // Parada Manual
                    case 'reset': case 'ack': commandValue = 4; break; // Limpa Falha Ativa
                    case 'toggleGen': {
                        // Read current breaker state from in-memory cache
                        const genClosed = currentGeneratorsState[deviceId]?.data?.genBreakerClosed || false;
                        commandValue = genClosed ? 8 : 7; // 8=Desliga, 7=Liga Chave Carga Gerador
                        console.log(`[KVA-CMD] toggleGen: currentState=${genClosed ? 'CLOSED' : 'OPEN'}, sending ${commandValue === 7 ? 'LIGA(7)' : 'DESLIGA(8)'}`);
                        break;
                    }
                    case 'toggleMains': {
                        // Read current breaker state from in-memory cache
                        const mainsClosed = currentGeneratorsState[deviceId]?.data?.mainsBreakerClosed || false;
                        commandValue = mainsClosed ? 10 : 9; // 10=Desliga, 9=Liga Chave Carga Rede
                        console.log(`[KVA-CMD] toggleMains: currentState=${mainsClosed ? 'CLOSED' : 'OPEN'}, sending ${commandValue === 9 ? 'LIGA(9)' : 'DESLIGA(10)'}`);
                        break;
                    }
                    case 'genBreakerOn':    commandValue = 7;  break; // Liga Chave de Carga do Gerador
                    case 'genBreakerOff':   commandValue = 8;  break; // Desliga Chave de Carga do Gerador
                    case 'mainsBreakerOn':  commandValue = 9;  break; // Liga Chave de Carga da Rede
                    case 'mainsBreakerOff': commandValue = 10; break; // Desliga Chave de Carga da Rede
                    default:
                        return { success: false, error: `Unknown KVA action '${action}'` };
                }

                pausedDevices.add(deviceId); // Only pause when action is valid and command is being sent
                const buf = createModbusWriteRequest(slaveId, 19108, commandValue);
                client.publish(topic, buf); // Raw binary frame
                console.log(`[KVA-CMD] ${action.toUpperCase()}: Sent Func 06 (Reg 19108, Val ${commandValue}) to ${deviceId}. Hex: ${buf.toString('hex').toUpperCase()}`);

                // Mode will update naturally when the next poll cycle reads the register

                // Resume polling after 2s (enough for controller to process, faster UI feedback)
                setTimeout(() => {
                    pausedDevices.delete(deviceId);
                    console.log(`[KVA-CMD] Resumed polling for ${deviceId}`);
                }, 2000);

                return { success: true };
            }

            if (isDseController) {
                // DSE4501 GenComm System Control Keys (Reg 4104 + one's complement at 4105)
                let key;
                switch (action) {
                    case 'auto':
                        key = DSE_CONTROL_KEYS.AUTO;
                        dseCommandedMode.set(deviceId, 'AUTO');
                        break;
                    case 'manual':
                        key = DSE_CONTROL_KEYS.MANUAL;
                        dseCommandedMode.set(deviceId, 'MANUAL');
                        break;
                    case 'start': {
                        const mode = dseCommandedMode.get(deviceId)
                            || currentGeneratorsState[deviceId]?.data?.operationMode;
                        key = (mode === 'MANUAL')
                            ? DSE_CONTROL_KEYS.START_MANUAL
                            : DSE_CONTROL_KEYS.TELEMETRY_START;
                        break;
                    }
                    case 'stop':
                        key = DSE_CONTROL_KEYS.TELEMETRY_STOP;
                        break;
                    case 'reset':
                    case 'ack':
                        key = DSE_CONTROL_KEYS.RESET_ALARMS;
                        break;
                    default:
                        return { success: false, error: `DSE command '${action}' not supported` };
                }

                pausedDevices.add(deviceId);
                const onesComplement = 65535 - key;
                const buf = createModbusWriteMultipleRequest(slaveId, 4104, [key, onesComplement]);
                client.publish(topic, buf);
                console.log(`[DSE-CMD] ${action.toUpperCase()}: Sent SCF command to ${deviceId}. Key: ${key}, Compl: ${onesComplement}. Hex: ${buf.toString('hex').toUpperCase()}`);

                setTimeout(() => {
                    pausedDevices.delete(deviceId);
                    console.log(`[DSE-CMD] Resumed polling for ${deviceId}`);
                }, 2000);

                return { success: true };
            }

            // DEIF DR164: existing command logic
            let commandValue;
            switch (action) {
                case 'start':  commandValue = 2;  break;
                case 'stop':   commandValue = 1;  break;
                case 'auto':   commandValue = 4;  break;
                case 'manual': commandValue = 1;  break;
                case 'reset': case 'ack': commandValue = 64; break;
                default:
                    return { success: false, error: `Unknown action '${action}'` };
            }

            // Track the commanded operation mode so the UI can resolve the mode even when the
            // controller's registers are ambiguous (e.g. AUTO-stopped after a start failure).
            if (action === 'auto') {
                dr164CommandedMode.set(deviceId, 'AUTO');
            } else if (action === 'manual') {
                dr164CommandedMode.set(deviceId, 'MANUAL');
            }

            pausedDevices.add(deviceId); // Only pause when action is valid and command is being sent
            const buf = createModbusWriteMultipleRequest(slaveId, 0, [commandValue]);
            client.publish(topic, buf); // Raw binary frame
            console.log(`[DR164-CMD] ${action.toUpperCase()}: Sent raw Modbus to ${deviceId}. Hex: ${buf.toString('hex').toUpperCase()}`);

            // Mode will update naturally when the next poll cycle reads the register

            // Resume polling after 2s (enough for controller to process, faster UI feedback)
            setTimeout(() => {
                pausedDevices.delete(deviceId);
                console.log(`[DR164-CMD] Resumed polling for ${deviceId}`);
            }, 2000);

            return { success: true };
        }

        // MODEM: Existing command logic below (unchanged)
        let valueToWrite = 0;

        // Logic based on User Documentation / Confirmation
        // START: Pulse on Reg 99 (0x63). Write 1 -> Wait 500ms -> Write 0.

        if (action === 'start') {
            // Dynamic generation (Function 16, Reg 0, Val 2)
            // Works for ANY Slave ID.
            // If Slave=1, generates: 01 10 00 00 00 01 02 00 02 27 91 (Confirmed)

            const buf = createModbusWriteMultipleRequest(slaveId, 0, [2]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase()
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] START: Sent Func 16 (Reg 0, Val 2). Hex: ${buf.toString('hex').toUpperCase()}`);

            return { success: true };
        }



        // STOP: Func 16, Reg 0, Val 1.
        // Hex: 01 10 00 00 00 01 02 00 01 [CRC]
        if (action === 'stop') {
            const buf = createModbusWriteMultipleRequest(slaveId, 0, [1]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase()
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] STOP: Sent Func 16 (Reg 0, Val 1). Hex: ${buf.toString('hex').toUpperCase()}`);

            return { success: true };
        }

        // AUTO: Func 16, Reg 0, Val 4.
        // Hex: 01 10 00 00 00 01 02 00 04 [CRC]
        if (action === 'auto') {
            const buf = createModbusWriteMultipleRequest(slaveId, 0, [4]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase()
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] AUTO: Sent Func 16 (Reg 0, Val 4). Hex: ${buf.toString('hex').toUpperCase()}`);

            return { success: true };
        }

        // MANUAL: User requested Manual Mode (Usually maps to STOP mode in SGC 120, waiting for Start)
        // Hex: 01 10 00 00 00 01 02 00 01 [CRC] (Was incorrectly sending 4/Auto)
        if (action === 'manual') {
            const buf = createModbusWriteMultipleRequest(slaveId, 0, [1]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase()
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] MANUAL: Sent Func 16 (Reg 0, Val 1) [STOP/MANUAL]. Hex: ${buf.toString('hex').toUpperCase()}`);

            return { success: true };
        }

        // RESET / ACK: User requested Func 16, Reg 0, Val 64 (0x40).
        // Hex: 01 10 00 00 00 01 02 00 40 [CRC]
        if (action === 'reset' || action === 'ack') {
            const buf = createModbusWriteMultipleRequest(slaveId, 0, [64]);

            const payload = JSON.stringify({
                modbusCommand: buf.toString('hex').toUpperCase()
            });

            client.publish(topic, payload);
            console.log(`[MQTT-CMD] RESET/ACK: Sent Func 16 (Reg 0, Val 64). Hex: ${buf.toString('hex').toUpperCase()}`);

            return { success: true };
        }

        // Default Logic for Other Commands (Reg 16 - To be confirmed if they move to 99)
        // Keeping Reg 16 for others for now based on previous config
        let regAddress = 16;

        switch (action) {
            // 'manual' removed (handled above)
            // 'auto' removed (handled above)
            // 'reset'/'ack' removed (handled above)
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
        if (deviceId) {
            pausedDevices.delete(deviceId); // Ensure cleanup on crash
        }
        return { success: false, error: `Backend Crash: ${err.message || String(err)}` };
    }
};
