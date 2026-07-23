// cummins-parser.js
// Parser para controladores Cummins PowerCommand — PCC 1301 / PowerCommand 1.x / PS0500.
// Fonte: A029X159 (Issue 34) "Modbus Register Mapping", seção 14.
// Protocolo: Modbus RTU, holding registers (função 03). Os registros são listados como
// 40xxx; o endereço PDU no fio é (registro - 40001), ex: 40010 -> addr 9.
// O controle lê no máximo 16 registros contíguos por requisição.

import { parseRtuRequestHex, parseRtuResponseHex } from './sgc120-parser.js';

export function isCumminsController(controller) {
    const c = (controller || '').toLowerCase();
    return c === 'cummins' || c === 'pcc1301' || c === 'powercommand';
}

// Sequência de polling — endereços PDU (registro 40xxx menos 40001), blocos <= 16 regs.
export const CUMMINS_POLL_SEQUENCE = [
    { startAddress: 9, quantity: 16, fn: 3 },  // 40010-40025: modo, estado, falha, tensões
    { startAddress: 25, quantity: 4, fn: 3 },  // 40026-40029: correntes L1/L2/L3 + média
    { startAddress: 39, quantity: 6, fn: 3 },  // 40040-40045: potência (kVA) + frequência
    { startAddress: 60, quantity: 5, fn: 3 },  // 40061-40065: bateria, óleo, temperatura
    { startAddress: 67, quantity: 4, fn: 3 },  // 40068-40071: RPM, nº de partidas, horas motor
    // % de carga por fase — bloco menos crítico, deixado por último para não
    // atrasar os dados de motor num device com timeouts (RS485 congestionado).
    { startAddress: 57, quantity: 3, fn: 3 },  // 40058-40060: % de carga (corrente/nominal)
];

const u16 = (regs, i) => (regs[i] ?? 0);
/** Trata sentinela DEIF/Cummins (65535 = registro não medido/inválido) como null. */
const val = (raw) => (raw === 65535 ? null : raw);

const GENSET_STATE = {
    0: 'STOPPED',   // Ready
    1: 'STARTING',  // Precrank
    2: 'STARTING',  // Ramp
    3: 'RUNNING',   // Running
};

/**
 * Decodifica um bloco de registros Cummins pelo endereço inicial (PDU).
 */
export function decodeCumminsByBlock(slaveId, fn, startAddress, regs) {
    console.log(`[CUMMINS-PARSER] Rx Slave: ${slaveId}, Fn: ${fn}, Addr: ${startAddress}, Len: ${regs.length}`);

    // ---- Bloco A: Status + Tensões (addr 9 = 40010, 16 regs) ----
    if (startAddress === 9 && regs.length >= 16) {
        const switchPos = u16(regs, 0);   // 40010: 0=Off, 1=Auto, 2=Manual
        const gensetState = u16(regs, 1); // 40011: 0=Ready,1=Precrank,2=Ramp,3=Running
        const activeFault = u16(regs, 2); // 40012
        const faultType = u16(regs, 3);   // 40013: 0=Normal,1=Warning,4=Shutdown

        let operationMode = 'MANUAL';
        if (switchPos === 1) operationMode = 'AUTO';
        else if (switchPos === 2) operationMode = 'MANUAL';

        const status = GENSET_STATE[gensetState] ?? 'STOPPED';

        const alarmCode = activeFault || 0;
        let alarmMessage = 'Normal (Sem Alarme)';
        if (activeFault > 0) {
            const kind = faultType === 4 ? 'Shutdown' : faultType === 1 ? 'Aviso' : 'Falha';
            alarmMessage = `${kind} Cummins (código ${activeFault})`;
        }

        return {
            block: 'CUMMINS_STATUS',
            operationMode,
            status,
            running: status === 'RUNNING',
            alarmCode,
            alarmMessage,
            isShutdown: faultType === 4,
            // Tensões: L-N (40018-40020) e L-L (40022-40025)
            voltageL1: val(u16(regs, 8)),   // 40018
            voltageL2: val(u16(regs, 9)),   // 40019
            voltageL3: val(u16(regs, 10)),  // 40020
            voltageL12: val(u16(regs, 12)), // 40022
            voltageL23: val(u16(regs, 13)), // 40023
            voltageL31: val(u16(regs, 14)), // 40024
            avgVoltage: val(u16(regs, 15)), // 40025 (média L-L)
        };
    }

    // ---- Bloco B: Correntes (addr 25 = 40026, 4 regs) ----
    if (startAddress === 25 && regs.length >= 3) {
        const scale = (r) => (r === 65535 ? null : Number((r * 0.1).toFixed(1)));
        return {
            block: 'CUMMINS_CURRENT',
            currentL1: scale(u16(regs, 0)),                     // 40026 (×0.1 A)
            currentL2: scale(u16(regs, 1)),                     // 40027
            currentL3: scale(u16(regs, 2)),                     // 40028
            avgCurrent: regs.length >= 4 ? scale(u16(regs, 3)) : null, // 40029 corrente média
        };
    }

    // ---- Bloco F: % de carga por fase (addr 57 = 40058-40060, ×0.1 %) ----
    // "Rated Alternator L1/L2/L3 Current (%)": corrente como % da nominal.
    if (startAddress === 57 && regs.length >= 3) {
        const pct = (r) => (r === 65535 ? null : Number((r * 0.1).toFixed(1)));
        const p1 = pct(u16(regs, 0)), p2 = pct(u16(regs, 1)), p3 = pct(u16(regs, 2));
        const vals = [p1, p2, p3].filter((v) => v != null);
        const avg = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
        return {
            block: 'CUMMINS_LOAD_PCT',
            loadPercentL1: p1,
            loadPercentL2: p2,
            loadPercentL3: p3,
            loadPercent: avg, // média das fases — "% de carga"
        };
    }

    // ---- Bloco C: Potência (kVA) + Frequência (addr 39 = 40040, 6 regs) ----
    if (startAddress === 39 && regs.length >= 5) {
        const apparentTotal = val(u16(regs, 3)); // 40043 kVA total
        return {
            block: 'CUMMINS_POWER',
            apparentPower: apparentTotal,
            activePower: apparentTotal,          // PCC 1301 expõe kVA; usamos como potência exibida
            activePowerTotal: apparentTotal,
            frequency: val(u16(regs, 4)) == null ? null : Number((u16(regs, 4) * 0.1).toFixed(1)), // 40044
        };
    }

    // ---- Bloco D: Bateria + Óleo + Temperatura (addr 60 = 40061, 5 regs) ----
    if (startAddress === 60 && regs.length >= 4) {
        const rawBat = u16(regs, 0);  // 40061 (×0.1 Vdc)
        const rawOil = u16(regs, 1);  // 40062 (kPa)
        const rawTemp = u16(regs, 3); // 40064 (×0.1 °C)
        return {
            block: 'CUMMINS_ENGINE1',
            batteryVoltage: rawBat === 65535 ? null : Number((rawBat * 0.1).toFixed(1)),
            // kPa -> bar (1 bar = 100 kPa)
            oilPressure: rawOil === 65535 ? null : Number((rawOil / 100).toFixed(2)),
            engineTemp: rawTemp === 65535 ? null : Math.round(rawTemp * 0.1),
        };
    }

    // ---- Bloco E: RPM + nº de partidas + Horas motor (addr 67 = 40068, 4 regs) ----
    if (startAddress === 67 && regs.length >= 4) {
        const rpm = val(u16(regs, 0));       // 40068
        const totalRuns = val(u16(regs, 1)); // 40069 "Total Runs" (nº de partidas/ciclos)
        const runHi = u16(regs, 2);          // 40070 (segundos, high word — mult 1)
        const runLo = u16(regs, 3);          // 40071 (segundos, low word)
        // >>> 0 evita o resultado negativo do << quando o bit alto está setado.
        const totalSeconds = ((runHi << 16) | runLo) >>> 0;
        const totalHours = Number((totalSeconds / 3600).toFixed(2));
        return {
            block: 'CUMMINS_ENGINE2',
            rpm,
            startAttempts: totalRuns,
            totalHours,
            runHours: totalHours,
        };
    }

    console.log(`[CUMMINS-PARSER] Bloco desconhecido no endereço ${startAddress} (${regs.length} regs)`);
    return null;
}

/**
 * Decodifica um payload MQTT Cummins (mesmo formato do SGC-120: modbusRequest + modbusResponse).
 * Retorna array de { ok, decoded }.
 */
export function decodeCumminsPayload(payload) {
    const results = [];
    if (!payload || !payload.modbusRequest || !payload.modbusResponse) return results;

    const requests = Array.isArray(payload.modbusRequest) ? payload.modbusRequest : [payload.modbusRequest];
    const responses = Array.isArray(payload.modbusResponse) ? payload.modbusResponse : [payload.modbusResponse];

    for (let i = 0; i < requests.length; i++) {
        const reqHex = requests[i];
        const respHex = responses[i];
        if (!reqHex || !respHex || respHex === '') {
            results.push({ ok: false, error: 'Empty request or response', index: i });
            continue;
        }
        try {
            const req = parseRtuRequestHex(reqHex);
            const resp = parseRtuResponseHex(respHex);
            if (resp.isException) {
                console.log(`[CUMMINS-PARSER] Exception at index ${i}: Code ${resp.exceptionCode}`);
                results.push({ ok: false, error: `Modbus exception ${resp.exceptionCode}`, index: i });
                continue;
            }
            const decoded = decodeCumminsByBlock(req.slaveId, req.fn || 3, req.startAddress, resp.registers);
            if (decoded) results.push({ ok: true, decoded });
            else results.push({ ok: false, error: `Unknown Cummins block at addr ${req.startAddress}`, index: i });
        } catch (err) {
            console.error(`[CUMMINS-PARSER] Error decoding index ${i}: ${err.message}`);
            results.push({ ok: false, error: err.message, index: i });
        }
    }
    return results;
}
