// TCP <-> MQTT bridge for transparent serial-over-TCP modems (e.g. USR-G806s in
// "TCP Client" mode) that don't speak MQTT.
//
// Such a modem opens a raw TCP connection to this server and tunnels its RS485
// serial bytes over it. This bridge makes that connection look IDENTICAL to an
// MQTT modem to the rest of the system, so polling, parsers, commands and the
// fragment-reassembly all work unchanged:
//
//   modem TCP bytes (Modbus response)  ->  publish to  devices/data/<id>
//   devices/command/<id> (Modbus request) ->  write to the modem's TCP socket
//
// Device identity: TCP is just a byte stream with no device id, so the modem is
// configured with a "registration package" (registro) sent once when the TCP
// connection is established. The FIRST bytes received on a fresh connection are
// that id string (must match the generator's connection_info.ip, e.g. "Ciklo51").
// This is safe because a Modbus slave never sends unsolicited data — nothing
// comes off the serial line until we send a request, which only happens after
// the device is identified.
//
// Opt-in: does nothing unless TCP_BRIDGE_PORT is set.

import net from 'net';
import mqtt from 'mqtt';

const DATA_TOPIC = (id) => `devices/data/${id}`;
const COMMAND_TOPIC_WILDCARD = 'devices/command/+';

const REGISTRATION_MAX_BYTES = 64;      // a registration id longer than this is almost certainly not an id
const SOCKET_IDLE_TIMEOUT_MS = 180000;  // drop a socket with no traffic for 3 min (modem will reconnect)

function buildMqttOptions() {
    const rejectUnauthorized = process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== 'false'
        && process.env.NODE_ENV === 'production';
    return {
        username: process.env.MQTT_USER,
        password: process.env.MQTT_PASSWORD,
        rejectUnauthorized,
    };
}

/** Extract a clean ASCII device id from a registration packet, or null if it doesn't look like one. */
function parseRegistrationId(buffer) {
    if (!buffer || buffer.length === 0 || buffer.length > REGISTRATION_MAX_BYTES) return null;
    // Trim trailing CR/LF/NUL/whitespace the modem may append.
    let end = buffer.length;
    while (end > 0 && [0x00, 0x0d, 0x0a, 0x20, 0x09].includes(buffer[end - 1])) end--;
    const trimmed = buffer.subarray(0, end);
    if (trimmed.length === 0) return null;
    // Must be printable ASCII (rules out a Modbus frame arriving where a registration was expected).
    for (const b of trimmed) {
        if (b < 0x20 || b > 0x7e) return null;
    }
    return trimmed.toString('ascii');
}

export function initTcpBridge() {
    const port = parseInt(process.env.TCP_BRIDGE_PORT || '', 10);
    if (!port) {
        console.log('[TCP-BRIDGE] Disabled (set TCP_BRIDGE_PORT to enable).');
        return;
    }

    const brokerUrl = process.env.MQTT_BROKER_URL;
    if (!brokerUrl) {
        console.error('[TCP-BRIDGE] FATAL: MQTT_BROKER_URL not set — cannot bridge.');
        return;
    }

    // Dedicated MQTT client so command-topic subscriptions never reach the main
    // data handler in mqtt.js.
    const bridgeClient = mqtt.connect(brokerUrl, buildMqttOptions());

    const socketsByDevice = new Map();  // deviceId -> net.Socket

    bridgeClient.on('connect', () => {
        console.log('[TCP-BRIDGE] MQTT client connected — subscribing to command topics.');
        bridgeClient.subscribe(COMMAND_TOPIC_WILDCARD, (err) => {
            if (err) console.error('[TCP-BRIDGE] Failed to subscribe to command topics:', err.message);
        });
    });

    bridgeClient.on('error', (err) => {
        console.error('[TCP-BRIDGE] MQTT client error:', err.message);
    });

    // Server -> modem: forward a Modbus request published on devices/command/<id>.
    bridgeClient.on('message', (topic, message) => {
        const deviceId = topic.split('/').pop();
        const socket = socketsByDevice.get(deviceId);
        if (!socket || socket.destroyed) return; // device not connected via TCP (or is an MQTT modem)
        socket.write(message, (err) => {
            if (err) console.error(`[TCP-BRIDGE] Write to ${deviceId} failed:`, err.message);
        });
    });

    const server = net.createServer((socket) => {
        const peer = `${socket.remoteAddress}:${socket.remotePort}`;
        let deviceId = null;
        socket.setKeepAlive(true, 30000);
        socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS);
        console.log(`[TCP-BRIDGE] New connection from ${peer} — awaiting registration package.`);

        socket.on('data', (chunk) => {
            if (!deviceId) {
                // First bytes on a fresh connection = registration id.
                const id = parseRegistrationId(chunk);
                if (!id) {
                    console.warn(`[TCP-BRIDGE] ${peer}: first packet is not a valid registration id (got ${chunk.length} bytes: ${chunk.toString('hex').slice(0, 24)}…). Check the modem's registration-package config. Dropping.`);
                    socket.destroy();
                    return;
                }
                deviceId = id;

                // Replace any stale socket for this device (e.g. reconnect after a 4G drop).
                const existing = socketsByDevice.get(deviceId);
                if (existing && existing !== socket) existing.destroy();
                socketsByDevice.set(deviceId, socket);
                console.log(`[TCP-BRIDGE] ${peer} registered as "${deviceId}".`);
                return;
            }

            // Modem -> server: a (possibly fragmented) Modbus response. Publish it on the
            // same topic an MQTT modem would use; mqtt.js reassembles and decodes it.
            bridgeClient.publish(DATA_TOPIC(deviceId), chunk);
        });

        socket.on('timeout', () => {
            console.warn(`[TCP-BRIDGE] ${deviceId || peer}: idle timeout — closing socket.`);
            socket.destroy();
        });

        socket.on('close', () => {
            if (deviceId && socketsByDevice.get(deviceId) === socket) {
                socketsByDevice.delete(deviceId);
            }
            console.log(`[TCP-BRIDGE] ${deviceId || peer} disconnected.`);
        });

        socket.on('error', (err) => {
            console.warn(`[TCP-BRIDGE] ${deviceId || peer} socket error: ${err.message}`);
        });
    });

    server.on('error', (err) => {
        console.error(`[TCP-BRIDGE] TCP server error on port ${port}: ${err.message}`);
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[TCP-BRIDGE] Listening for serial-over-TCP modems on 0.0.0.0:${port}`);
    });
}
