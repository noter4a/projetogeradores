// snmp-agent.js
// Exposes generator telemetry as a native SNMP agent, queried directly on this
// server (no separate process, no MQTT re-subscription). Reuses the same
// Postgres rows the REST API (`GET /api/generators`) already serves, polled on
// an interval and mapped into a standard SNMP conceptual table — one row per
// generator, indexed by a stable integer assigned the first time each
// generator is seen.
//
// Opt-in via SNMP_PORT (does nothing if unset). Read-only: no SET is ever
// honored — the table's columns are all MAX-ACCESS read-only, and the
// community/user access level is capped at ReadOnly.
//
// OID layout (see server/GENERATOR-MIB.mib for the matching MIB definition):
//   1.3.6.1.4.1.<PEN>.1              generatorTable   (walk/snmptable this)
//   1.3.6.1.4.1.<PEN>.1.1            generatorEntry   (conceptual row)
//   1.3.6.1.4.1.<PEN>.1.1.<col>.<i>  column <col> of the row at index <i>
// Replace <PEN> (SNMP_ENTERPRISE_OID) with your own IANA Private Enterprise
// Number before handing this to an external client — see pen.iana.org.

import snmp from 'net-snmp';
import pool from '../db.js';

const CONNECTION_THRESHOLD_MS = 120_000; // mirrors utils/generatorHealth.ts on the frontend

const STATUS_ENUM = { STOPPED: 1, RUNNING: 2, ALARM: 3, OFFLINE: 4 };

// Column definition: [number, name, type, scale (multiply float by this to get an integer)]
// Gauge32/Integer/Counter32 are all integer-only on the wire, so non-integer
// telemetry (voltage, frequency, hours, etc.) is scaled up and documented as
// such in the MIB (e.g. "Hz x10", "V x10").
const COLUMNS = [
    { number: 1, name: 'generatorIndex', type: snmp.ObjectType.Integer },
    { number: 2, name: 'generatorId', type: snmp.ObjectType.OctetString },
    { number: 3, name: 'generatorName', type: snmp.ObjectType.OctetString },
    { number: 4, name: 'statusCode', type: snmp.ObjectType.Integer },
    { number: 5, name: 'connected', type: snmp.ObjectType.Integer }, // 0=no, 1=yes
    { number: 6, name: 'mainsVoltage', type: snmp.ObjectType.Gauge32 },
    { number: 7, name: 'genVoltage', type: snmp.ObjectType.Gauge32 },
    { number: 8, name: 'frequency', type: snmp.ObjectType.Gauge32 },     // Hz x10
    { number: 9, name: 'rpm', type: snmp.ObjectType.Gauge32 },
    { number: 10, name: 'fuelLevel', type: snmp.ObjectType.Gauge32 },     // %
    { number: 11, name: 'batteryVoltage', type: snmp.ObjectType.Gauge32 }, // V x10
    { number: 12, name: 'oilPressure', type: snmp.ObjectType.Gauge32 },   // bar x100
    { number: 13, name: 'engineTemp', type: snmp.ObjectType.Gauge32 },    // degC
    { number: 14, name: 'activePower', type: snmp.ObjectType.Gauge32 },   // kW x10
    { number: 15, name: 'alarmCode', type: snmp.ObjectType.Integer },
    { number: 16, name: 'runHours', type: snmp.ObjectType.Gauge32 },      // hours x100
    { number: 17, name: 'lastUpdateEpoch', type: snmp.ObjectType.Gauge32 }, // unix seconds
];

function toIntOrZero(v, scale = 1) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return 0;
    return Math.max(0, Math.round(Number(v) * scale));
}

async function fetchGeneratorRows() {
    // alarm_code has no column on `generators` — the live/active alarm (if any)
    // lives in alarm_history as the row with end_time IS NULL for that generator.
    const { rows } = await pool.query(`
        SELECT g.id, g.name, g.status, g.last_connected,
               g.voltage_l1, g.mains_voltage_l1, g.frequency,
               g.rpm, g.fuel_level, g.battery_voltage, g.oil_pressure, g.engine_temp,
               g.active_power, g.run_hours,
               (SELECT ah.alarm_code FROM alarm_history ah
                WHERE ah.generator_id = g.id AND ah.end_time IS NULL
                ORDER BY ah.start_time DESC LIMIT 1) AS alarm_code
        FROM generators g
        ORDER BY g.id ASC
    `);
    return rows;
}

/** deviceId -> stable table index. Assigned once, kept for the process lifetime
 *  (a generator that disappears keeps its slot reserved so it doesn't churn a
 *  monitoring system's cache if it comes back). */
const indexByGeneratorId = new Map();
let nextIndex = 1;

function stableIndexFor(id) {
    if (!indexByGeneratorId.has(id)) {
        indexByGeneratorId.set(id, nextIndex++);
    }
    return indexByGeneratorId.get(id);
}

function rowToColumns(row) {
    const idx = stableIndexFor(row.id);
    const connected = !!row.last_connected && (Date.now() - new Date(row.last_connected).getTime()) < CONNECTION_THRESHOLD_MS;
    const statusCode = STATUS_ENUM[row.status] || (connected ? STATUS_ENUM.STOPPED : STATUS_ENUM.OFFLINE);
    const lastUpdateEpoch = row.last_connected ? Math.floor(new Date(row.last_connected).getTime() / 1000) : 0;

    // Order MUST match COLUMNS above (index 0 = column 1, etc).
    return [
        idx,
        String(row.id),
        String(row.name || ''),
        statusCode,
        connected ? 1 : 0,
        toIntOrZero(row.mains_voltage_l1),
        toIntOrZero(row.voltage_l1),
        toIntOrZero(row.frequency, 10),
        toIntOrZero(row.rpm),
        toIntOrZero(row.fuel_level),
        toIntOrZero(row.battery_voltage, 10),
        toIntOrZero(row.oil_pressure, 100),
        toIntOrZero(row.engine_temp),
        toIntOrZero(row.active_power, 10),
        toIntOrZero(row.alarm_code),
        toIntOrZero(row.run_hours, 100),
        lastUpdateEpoch,
    ];
}

/** getTableRowCells throws (rather than returning null) if the table's tree
 *  node hasn't been created yet — which only happens lazily, the first time
 *  addTableRow() runs. Treat "provider node doesn't exist yet" the same as
 *  "row doesn't exist" so the very first refresh falls through to addTableRow. */
function safeGetRow(mib, table, rowIndex) {
    try {
        return mib.getTableRowCells(table, rowIndex);
    } catch {
        return null;
    }
}

/** Upsert every current generator into the table, and drop rows for
 *  generators that no longer exist (index stays reserved in memory so a
 *  reappearing generator gets the same index back next time). */
function refreshTable(mib) {
    return fetchGeneratorRows()
        .then((rows) => {
            const seenIndexes = new Set();

            for (const row of rows) {
                const cols = rowToColumns(row);
                const idx = cols[0];
                seenIndexes.add(idx);
                const existing = safeGetRow(mib, 'generatorTable', [idx]);
                if (existing) {
                    cols.forEach((value, i) => {
                        if (existing[i] !== value) {
                            mib.setTableSingleCell('generatorTable', i + 1, [idx], value);
                        }
                    });
                } else {
                    mib.addTableRow('generatorTable', cols);
                }
            }

            // Remove rows for generators no longer in the DB (index reservation stays).
            for (const idx of indexByGeneratorId.values()) {
                if (!seenIndexes.has(idx) && safeGetRow(mib, 'generatorTable', [idx])) {
                    mib.deleteTableRow('generatorTable', [idx]);
                }
            }
        })
        .catch((err) => {
            console.error('[SNMP] Failed to refresh generator table:', err.message);
        });
}

export function initSnmpAgent() {
    const port = parseInt(process.env.SNMP_PORT || '', 10);
    if (!port) {
        console.log('[SNMP] Disabled (set SNMP_PORT to enable).');
        return;
    }

    const community = process.env.SNMP_COMMUNITY || 'public';
    if (community === 'public') {
        console.warn('[SNMP] Using default community "public" — set SNMP_COMMUNITY for production use.');
    }
    const enterpriseOid = process.env.SNMP_ENTERPRISE_OID || '1.3.6.1.4.1.99999';
    if (enterpriseOid === '1.3.6.1.4.1.99999') {
        console.warn('[SNMP] Using placeholder enterprise OID 99999 — register a real PEN at pen.iana.org before exposing this to an external client (see server/GENERATOR-MIB.mib).');
    }
    const pollIntervalMs = parseInt(process.env.SNMP_POLL_INTERVAL_MS || '15000', 10);

    const agent = snmp.createAgent({
        port,
        address: null,
        disableAuthorization: false,
        accessControlModelType: snmp.AccessControlModelType.Simple,
    }, (error) => {
        if (error) console.error('[SNMP] Agent request error:', error.message);
    });

    const authorizer = agent.getAuthorizer();
    authorizer.addCommunity(community);
    const acm = authorizer.getAccessControlModel();
    acm.setCommunityAccess(community, snmp.AccessLevel.ReadOnly);

    agent.registerProvider({
        name: 'generatorTable',
        type: snmp.MibProviderType.Table,
        // Standard SNMP table convention: the table itself is enterpriseOid.1,
        // but the registered provider OID is the conceptual "entry" one level
        // deeper (enterpriseOid.1.1) — columns then land at entry.<col>.<idx>,
        // e.g. enterpriseOid.1.1.2.1 = column 2 (generatorId) of row index 1.
        // This matches what snmpwalk/session.table() (queried at enterpriseOid.1)
        // and third-party monitoring systems expect from a conceptual table.
        oid: `${enterpriseOid}.1.1`,
        maxAccess: snmp.MaxAccess['not-accessible'],
        tableColumns: COLUMNS.map(c => ({
            number: c.number,
            name: c.name,
            type: c.type,
            maxAccess: snmp.MaxAccess['read-only'],
        })),
        tableIndex: [{ columnName: 'generatorIndex' }],
        handler: (mibRequest) => mibRequest.done(),
    });

    const mib = agent.getMib();

    refreshTable(mib);
    setInterval(() => refreshTable(mib), pollIntervalMs);

    console.log(`[SNMP] Agent listening on UDP ${port}, table OID ${enterpriseOid}.1, refreshing every ${pollIntervalMs}ms.`);
    return agent;
}
