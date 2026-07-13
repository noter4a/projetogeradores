// snmp-agent.js
// Exposes generator telemetry as a native SNMP agent, queried directly on this
// server (no separate process, no MQTT re-subscription). Reuses the same
// Postgres rows the REST API (`GET /api/generators`) already serves, polled on
// an interval and mapped into a standard SNMP conceptual table — one row per
// generator, indexed by a stable integer assigned the first time each
// generator is seen (per agent instance — see "Scoped exports" below).
//
// Read-only, always: no SET is ever honored — the table's columns are all
// MAX-ACCESS read-only, and every community is capped at ReadOnly.
//
// OID layout (see server/GENERATOR-MIB.mib for the matching MIB definition):
//   1.3.6.1.4.1.<PEN>.1              generatorTable   (walk/snmptable this)
//   1.3.6.1.4.1.<PEN>.1.1            generatorEntry   (conceptual row)
//   1.3.6.1.4.1.<PEN>.1.1.<col>.<i>  column <col> of the row at index <i>
// Replace <PEN> (SNMP_ENTERPRISE_OID) with your own IANA Private Enterprise
// Number before handing this to an external client — see pen.iana.org.
//
// Full-fleet agent: opt-in via SNMP_PORT (does nothing if unset).
//
// Scoped exports (e.g. "give this one client SNMP for just their generator"):
// the net-snmp library's access control only supports a global ReadOnly/
// ReadWrite/None level per community, not per-row/per-OID views — so a
// community can't be restricted to a subset of rows within one shared table.
// Instead, each scoped export is a SEPARATE agent instance on its own port,
// pre-filtered by generator, with its own community. Configure as many as
// needed via numbered env vars:
//   SNMP_CLIENT_EXPORT_1_PORT=16101
//   SNMP_CLIENT_EXPORT_1_COMMUNITY=cliente_ciklo70
//   SNMP_CLIENT_EXPORT_1_GENERATORS=Ciklo70
//   SNMP_CLIENT_EXPORT_2_PORT=16102
//   SNMP_CLIENT_EXPORT_2_COMMUNITY=cliente_outro
//   SNMP_CLIENT_EXPORT_2_GENERATORS=Ciklo55,Ciklo50
// GENERATORS is a comma-separated list matched against the generator's id,
// connection_info.ip or connection_info.connectionName (whichever you know).
// Each export's table only ever contains those generator(s) — the client's
// monitoring system can walk/browse freely with no risk of seeing anyone
// else's fleet.
//
// Alarm traps: each agent instance can optionally push an SNMPv2c trap the
// moment IT notices (on its own poll cycle) that a generator's alarmCode
// changed — started, changed to a different code, or cleared back to 0.
// This is push-based on top of the poll-based table: no separate detection
// path, just a diff against what this instance last wrote for that row.
//   SNMP_TRAP_TARGET=<host>:<port>          (full-fleet agent's trap target)
//   SNMP_TRAP_COMMUNITY=<community>          (defaults to SNMP_COMMUNITY)
//   SNMP_CLIENT_EXPORT_<N>_TRAP_TARGET=<host>:<port>
//   SNMP_CLIENT_EXPORT_<N>_TRAP_COMMUNITY=<community>  (defaults to that export's own community)
// No trap target configured for an instance = no traps sent by it (opt-in).
// Trap OID and variable-binding OIDs: see server/GENERATOR-MIB.mib.

import snmp from 'net-snmp';
import pool from '../db.js';

const CONNECTION_THRESHOLD_MS = 120_000; // mirrors utils/generatorHealth.ts on the frontend

const STATUS_ENUM = { STOPPED: 1, RUNNING: 2, ALARM: 3, OFFLINE: 4 };

// Column definition: Gauge32/Integer are integer-only on the wire, so non-
// integer telemetry (voltage, frequency, hours, etc.) is scaled up and
// documented as such in the MIB (e.g. "Hz x10", "V x10").
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

/**
 * @param {string[]|null} generatorIds - when provided, only these generators
 *   are returned (matched against id, connection_info.ip or connectionName).
 *   Null/empty means "all generators" (the full-fleet agent).
 */
async function fetchGeneratorRows(generatorIds) {
    // alarm_code has no column on `generators` — the live/active alarm (if any)
    // lives in alarm_history as the row with end_time IS NULL for that generator.
    const hasFilter = Array.isArray(generatorIds) && generatorIds.length > 0;
    const { rows } = await pool.query(`
        SELECT g.id, g.name, g.status, g.last_connected,
               g.voltage_l1, g.mains_voltage_l1, g.frequency,
               g.rpm, g.fuel_level, g.battery_voltage, g.oil_pressure, g.engine_temp,
               g.active_power, g.run_hours,
               (SELECT ah.alarm_code FROM alarm_history ah
                WHERE ah.generator_id = g.id AND ah.end_time IS NULL
                ORDER BY ah.start_time DESC LIMIT 1) AS alarm_code
        FROM generators g
        ${hasFilter ? `WHERE g.id = ANY($1)
               OR g.connection_info->>'ip' = ANY($1)
               OR g.connection_info->>'connectionName' = ANY($1)` : ''}
        ORDER BY g.id ASC
    `, hasFilter ? [generatorIds] : []);
    return rows;
}

function rowToColumns(row, stableIndexFor) {
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

const ALARM_CODE_COLUMN_INDEX = 14; // 0-based position in the `cols` array (column number 15)

/**
 * Builds a one-shot trap sender bound to a target/community, or a no-op if
 * no target is configured. Reuses one SNMP session for the agent instance's
 * lifetime rather than opening a new socket per trap.
 */
function createTrapSender({ target, community, enterpriseOid, label }) {
    if (!target) return null;

    const parts = target.split(':');
    const host = parts[0];
    const port = parseInt(parts[1], 10);
    if (!host || !port) {
        console.error(`[SNMP]${label ? ` [${label}]` : ''} Invalid trap target "${target}" — expected host:port. Traps disabled for this instance.`);
        return null;
    }

    // NOTE: session.trap() sends to `trapPort`, a SEPARATE option from `port`
    // (which is only used for get/set/walk requests) — defaults to 162 if not
    // set explicitly, regardless of `port`. Must set both to the same value.
    const trapSession = snmp.createSession(host, community, { port, trapPort: port, version: snmp.Version2c });
    trapSession.on('error', (err) => {
        console.error(`[SNMP]${label ? ` [${label}]` : ''} Trap session error:`, err.message);
    });

    const trapOid = `${enterpriseOid}.2.1`;

    return function sendAlarmTrap({ generatorId, generatorName, previousCode, newCode }) {
        const eventType = newCode === 0 ? 'CLEARED' : (previousCode === 0 ? 'STARTED' : 'CHANGED');
        const varbinds = [
            { oid: `${enterpriseOid}.3.1`, type: snmp.ObjectType.OctetString, value: generatorId },
            { oid: `${enterpriseOid}.3.2`, type: snmp.ObjectType.OctetString, value: generatorName },
            { oid: `${enterpriseOid}.3.3`, type: snmp.ObjectType.Integer, value: previousCode },
            { oid: `${enterpriseOid}.3.4`, type: snmp.ObjectType.Integer, value: newCode },
            { oid: `${enterpriseOid}.3.5`, type: snmp.ObjectType.OctetString, value: eventType },
        ];
        trapSession.trap(trapOid, varbinds, (err) => {
            if (err) {
                console.error(`[SNMP]${label ? ` [${label}]` : ''} Failed to send alarm trap for ${generatorId}:`, err.message);
            } else {
                console.log(`[SNMP]${label ? ` [${label}]` : ''} Alarm trap sent: ${generatorId} (${generatorName}) ${eventType} — ${previousCode} -> ${newCode}`);
            }
        });
    };
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
 *  reappearing generator gets the same index back next time). When
 *  `sendAlarmTrap` is provided, fires a trap on any alarmCode transition for
 *  a row this instance had already seen before (never on first sight of a
 *  row, to avoid a trap storm for pre-existing alarms on process start). */
function refreshTable(mib, generatorIds, stableIndexFor, indexValues, label, sendAlarmTrap) {
    return fetchGeneratorRows(generatorIds)
        .then((rows) => {
            const seenIndexes = new Set();

            for (const row of rows) {
                const cols = rowToColumns(row, stableIndexFor);
                const idx = cols[0];
                seenIndexes.add(idx);
                const existing = safeGetRow(mib, 'generatorTable', [idx]);
                if (existing) {
                    if (sendAlarmTrap && existing[ALARM_CODE_COLUMN_INDEX] !== cols[ALARM_CODE_COLUMN_INDEX]) {
                        sendAlarmTrap({
                            generatorId: cols[1],
                            generatorName: cols[2],
                            previousCode: existing[ALARM_CODE_COLUMN_INDEX],
                            newCode: cols[ALARM_CODE_COLUMN_INDEX],
                        });
                    }
                    cols.forEach((value, i) => {
                        if (existing[i] !== value) {
                            mib.setTableSingleCell('generatorTable', i + 1, [idx], value);
                        }
                    });
                } else {
                    mib.addTableRow('generatorTable', cols);
                }
            }

            for (const idx of indexValues()) {
                if (!seenIndexes.has(idx) && safeGetRow(mib, 'generatorTable', [idx])) {
                    mib.deleteTableRow('generatorTable', [idx]);
                }
            }
        })
        .catch((err) => {
            console.error(`[SNMP]${label ? ` [${label}]` : ''} Failed to refresh generator table:`, err.message);
        });
}

/**
 * Starts one SNMP agent instance bound to `port`, serving only `generatorIds`
 * (or the whole fleet if null/empty). Each instance has its own independent
 * index-assignment map, so a scoped export's row indices don't depend on
 * what other instances/exports exist.
 */
function startAgentInstance({ port, community, enterpriseOid, pollIntervalMs, generatorIds, label, trapTarget, trapCommunity }) {
    if (community === 'public') {
        console.warn(`[SNMP]${label ? ` [${label}]` : ''} Using default community "public" — set a real community for production use.`);
    }
    if (enterpriseOid === '1.3.6.1.4.1.99999') {
        console.warn(`[SNMP]${label ? ` [${label}]` : ''} Using placeholder enterprise OID 99999 — register a real PEN at pen.iana.org before exposing this to an external client (see server/GENERATOR-MIB.mib).`);
    }

    const agent = snmp.createAgent({
        port,
        address: null,
        disableAuthorization: false,
        accessControlModelType: snmp.AccessControlModelType.Simple,
    }, (error) => {
        if (error) console.error(`[SNMP]${label ? ` [${label}]` : ''} Agent request error:`, error.message);
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

    // Index assignment is local to this agent instance.
    const indexByGeneratorId = new Map();
    let nextIndex = 1;
    const stableIndexFor = (id) => {
        if (!indexByGeneratorId.has(id)) indexByGeneratorId.set(id, nextIndex++);
        return indexByGeneratorId.get(id);
    };
    const indexValues = () => indexByGeneratorId.values();

    const sendAlarmTrap = createTrapSender({
        target: trapTarget,
        community: trapCommunity || community,
        enterpriseOid,
        label,
    });

    refreshTable(mib, generatorIds, stableIndexFor, indexValues, label, sendAlarmTrap);
    setInterval(() => refreshTable(mib, generatorIds, stableIndexFor, indexValues, label, sendAlarmTrap), pollIntervalMs);

    const scope = generatorIds?.length ? `scoped to [${generatorIds.join(', ')}]` : 'full fleet';
    const trapInfo = sendAlarmTrap ? `, traps -> ${trapTarget}` : '';
    console.log(`[SNMP]${label ? ` [${label}]` : ''} Agent listening on UDP ${port} (${scope}), table OID ${enterpriseOid}.1, refreshing every ${pollIntervalMs}ms${trapInfo}.`);
    return agent;
}

/** Reads SNMP_CLIENT_EXPORT_<N>_{PORT,COMMUNITY,GENERATORS} for N=1,2,3,... until one is missing. */
function readClientExportConfigs() {
    const configs = [];
    for (let n = 1; ; n++) {
        const port = parseInt(process.env[`SNMP_CLIENT_EXPORT_${n}_PORT`] || '', 10);
        if (!port) break;
        const community = process.env[`SNMP_CLIENT_EXPORT_${n}_COMMUNITY`] || `client${n}`;
        const generatorsRaw = process.env[`SNMP_CLIENT_EXPORT_${n}_GENERATORS`] || '';
        const generatorIds = generatorsRaw.split(',').map(s => s.trim()).filter(Boolean);
        if (generatorIds.length === 0) {
            console.warn(`[SNMP] SNMP_CLIENT_EXPORT_${n}_GENERATORS is empty — skipping export ${n} (a scoped export needs at least one generator, otherwise use the full-fleet SNMP_PORT instead).`);
            continue;
        }
        const trapTarget = process.env[`SNMP_CLIENT_EXPORT_${n}_TRAP_TARGET`] || null;
        const trapCommunity = process.env[`SNMP_CLIENT_EXPORT_${n}_TRAP_COMMUNITY`] || null;
        configs.push({ n, port, community, generatorIds, trapTarget, trapCommunity });
    }
    return configs;
}

export function initSnmpAgent() {
    const enterpriseOid = process.env.SNMP_ENTERPRISE_OID || '1.3.6.1.4.1.99999';
    const pollIntervalMs = parseInt(process.env.SNMP_POLL_INTERVAL_MS || '15000', 10);

    const agents = [];

    const fullPort = parseInt(process.env.SNMP_PORT || '', 10);
    if (fullPort) {
        agents.push(startAgentInstance({
            port: fullPort,
            community: process.env.SNMP_COMMUNITY || 'public',
            enterpriseOid,
            pollIntervalMs,
            generatorIds: null,
            label: 'fleet',
            trapTarget: process.env.SNMP_TRAP_TARGET || null,
            trapCommunity: process.env.SNMP_TRAP_COMMUNITY || null,
        }));
    } else {
        console.log('[SNMP] Full-fleet agent disabled (set SNMP_PORT to enable).');
    }

    for (const cfg of readClientExportConfigs()) {
        agents.push(startAgentInstance({
            port: cfg.port,
            community: cfg.community,
            enterpriseOid,
            pollIntervalMs,
            generatorIds: cfg.generatorIds,
            label: `client-export-${cfg.n}`,
            trapTarget: cfg.trapTarget,
            trapCommunity: cfg.trapCommunity,
        }));
    }

    return agents;
}
