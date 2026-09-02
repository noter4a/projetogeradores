// dse-parser.js
// Parser for Deep Sea Electronics (DSE4501 / GenComm) Modbus protocol

import { parseRtuRequestHex, parseRtuResponseHex } from './sgc120-parser.js';
import {
    DSE_CONTROL_MODE,
    DSE_NAMED_ALARMS,
    DSE_STATUS_CODE,
} from '../data/dse4501-map.js';

const u16 = (regs, i) => (regs[i] ?? 0);

const u32 = (regs, i) => {
    const high = regs[i] ?? 0;
    const low = regs[i + 1] ?? 0;
    return (high * 65536) + low;
};

const s32 = (regs, i) => {
    let val = u32(regs, i);
    if (val > 2147483647) val -= 4294967296;
    return val;
};

const s16 = (val) => (val > 32767 ? val - 65536 : val);

// Live traffic from a real unit showed near-max raw codes (0xFFFB, 0x7FFB,
// exactly 0x7FFF) on sensors that are almost certainly not fitted on this
// genset (oil pressure, oil temperature, magnetic pickup/RPM, mains voltage
// and frequency — the same class of "not wired" gap we found on the Cummins
// mains side). We don't have DSE's official sentinel-code table in the repo,
// so rather than hardcoding those exact values, treat the whole implausible
// top-of-range neighborhood as "not fitted": every real reading for these
// fields sits far below this threshold (e.g. oil pressure raw maxes out
// around 1000 for 1000 kPa; this rejects six-figure-bar and 65,000+ RPM
// nonsense while never touching a genuine reading).
const NOT_FITTED_THRESHOLD = 32000;
const validRaw = (raw) => (raw >= NOT_FITTED_THRESHOLD ? null : raw);

/** u32 from two registers, but null if the high word alone looks like a
 * "not fitted" sentinel — a real reading never needs a high word this large
 * (e.g. any plausible voltage fits entirely in the low word, high word = 0). */
const u32OrNull = (regs, i) => {
    const high = u16(regs, i);
    if (high >= NOT_FITTED_THRESHOLD) return null;
    return (high * 65536) + u16(regs, i + 1);
};

/** u32-then-scale helper used for every ×0.1 voltage/current field — null propagates. */
const v10 = (regs, i) => {
    const raw = u32OrNull(regs, i);
    return raw === null ? null : parseFloat((raw / 10.0).toFixed(1));
};

function decodeStatusFromCode(statusVal) {
    if (DSE_STATUS_CODE[statusVal]) return DSE_STATUS_CODE[statusVal];
    if (statusVal >= 1 && statusVal <= 7) return 'STARTING';
    return 'STOPPED';
}

function decodeControlMode(raw) {
    return DSE_CONTROL_MODE[raw] ?? null;
}

function decodeAlarmNibble(code) {
    return code === 2 || code === 3 || code === 4 || code === 5;
}

function decodeNamedAlarms(regs) {
    const alarmCount = u16(regs, 0);
    if (alarmCount === 0 || alarmCount > 128) {
        return { activeAlarms: [], alarmCode: 0, alarmMessage: '', hasFault: false, isStartFailure: false };
    }

    const activeAlarms = [];
    const numPackedRegs = Math.ceil(alarmCount / 4);

    for (let regIdx = 0; regIdx < numPackedRegs; regIdx++) {
        const packed = u16(regs, regIdx + 1);
        for (let n = 0; n < 4; n++) {
            const alarmIdx = regIdx * 4 + n;
            if (alarmIdx >= alarmCount) break;

            const code = (packed >> (12 - n * 4)) & 0xF;
            if (!decodeAlarmNibble(code)) continue;

            activeAlarms.push({
                index: alarmIdx,
                name: DSE_NAMED_ALARMS[alarmIdx] || `Alarme ${alarmIdx + 1}`,
                severity: code,
            });
        }
    }

    const alarmCode = activeAlarms.length > 0
        ? activeAlarms.reduce((max, a) => Math.max(max, a.severity), 0)
        : 0;
    const alarmMessage = activeAlarms.map(a => a.name).join(', ');
    const isStartFailure = activeAlarms.some(a =>
        a.name.toLowerCase().includes('fail to start') || a.index === 6
    );

    return {
        activeAlarms,
        alarmCode,
        alarmMessage,
        hasFault: activeAlarms.length > 0,
        isStartFailure,
    };
}

/**
 * Decode DSE registers by block (startAddress + register array)
 */
export function decodeDseByBlock(slaveId, fn, startAddress, regs) {
    console.log(`[DSE-PARSER] Rx Slave: ${slaveId}, Fn: ${fn}, Addr: ${startAddress}, Len: ${regs.length}`);

    // ---- Block 1: Engine + Gen Voltages & Currents (Reg 1024-1051, 28 regs) ----
    // currentL1-3 aqui é só a corrente do GERADOR (mesmo registrador do "Gen
    // Currents" do GenComm) — o DSE não tem um CT dedicado pro lado da rede.
    // Não duplicar em mainsCurrentL1-3 aqui: mqtt.js decide pra qual lado essa
    // leitura conta de verdade (routeSingleCtCurrentToClosedBreaker), olhando o
    // estado real da chave em vez de assumir "rede = mesmo valor do gerador".
    if (startAddress === 1024 && regs.length >= 28) {
        const oilPressureRaw = validRaw(u16(regs, 0));
        const coolantTempRaw = u16(regs, 1);
        const oilTempRaw = validRaw(u16(regs, 2));
        const fuelLevel = u16(regs, 3);
        const batteryRaw = u16(regs, 5);
        const rpm = validRaw(u16(regs, 6));
        const frequencyRaw = validRaw(u16(regs, 7));

        const engineTemp = s16(coolantTempRaw);
        const oilTemp = oilTempRaw === null ? null : s16(oilTempRaw);
        const oilPressure = oilPressureRaw === null ? null : parseFloat((oilPressureRaw / 100.0).toFixed(2));
        const batteryVoltage = parseFloat((batteryRaw / 10.0).toFixed(1));
        const frequency = frequencyRaw === null ? null : parseFloat((frequencyRaw / 10.0).toFixed(1));

        const voltageL1 = v10(regs, 8);
        const voltageL2 = v10(regs, 10);
        const voltageL3 = v10(regs, 12);
        const voltageL12 = v10(regs, 14);
        const voltageL23 = v10(regs, 16);
        const voltageL31 = v10(regs, 18);
        const currentL1 = v10(regs, 20);
        const currentL2 = v10(regs, 22);
        const currentL3 = v10(regs, 24);
        const avgVal = ((voltageL1 || 0) + (voltageL2 || 0) + (voltageL3 || 0)) / 3;
        const avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);

        return {
            block: 'DSE_ENGINE_GEN_1024',
            oilPressure,
            engineTemp,
            oilTemp,
            fuelLevel,
            batteryVoltage,
            rpm,
            frequency,
            voltageL1, voltageL2, voltageL3, avgVoltage,
            voltageL12, voltageL23, voltageL31,
            currentL1, currentL2, currentL3,
        };
    }

    // ---- Block 1a: Engine + Gen Voltages L-N (Reg 1024-1037, 14 regs) ----
    if (startAddress === 1024 && regs.length >= 14) {
        const oilPressureRaw = validRaw(u16(regs, 0));
        const coolantTempRaw = u16(regs, 1);
        const oilTempRaw = validRaw(u16(regs, 2)); // /Engine/OilTemperature (reg 1026) — was fetched but never decoded
        const fuelLevel = u16(regs, 3);
        const batteryRaw = u16(regs, 5);
        const rpm = validRaw(u16(regs, 6));
        const frequencyRaw = validRaw(u16(regs, 7));

        const engineTemp = s16(coolantTempRaw);
        const oilTemp = oilTempRaw === null ? null : s16(oilTempRaw);
        const oilPressure = oilPressureRaw === null ? null : parseFloat((oilPressureRaw / 100.0).toFixed(2));
        const batteryVoltage = parseFloat((batteryRaw / 10.0).toFixed(1));
        const frequency = frequencyRaw === null ? null : parseFloat((frequencyRaw / 10.0).toFixed(1));
        const voltageL1 = v10(regs, 8);
        const voltageL2 = v10(regs, 10);
        const voltageL3 = v10(regs, 12);
        const avgVal = ((voltageL1 || 0) + (voltageL2 || 0) + (voltageL3 || 0)) / 3;
        const avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);

        return {
            block: 'DSE_ENGINE_GEN_1024_PART1',
            oilPressure, engineTemp, oilTemp, fuelLevel, batteryVoltage, rpm, frequency,
            voltageL1, voltageL2, voltageL3, avgVoltage,
        };
    }

    // ---- Block 1b: Gen Voltages L-L & Currents (Reg 1038-1051, 14 regs) ----
    if (startAddress === 1038 && regs.length >= 14) {
        const voltageL12 = v10(regs, 0);
        const voltageL23 = v10(regs, 2);
        const voltageL31 = v10(regs, 4);
        const currentL1 = v10(regs, 6);
        const currentL2 = v10(regs, 8);
        const currentL3 = v10(regs, 10);

        return {
            block: 'DSE_ENGINE_GEN_1038_PART2',
            voltageL12, voltageL23, voltageL31,
            currentL1, currentL2, currentL3,
        };
    }

    // ---- Block 1c: Per-phase active power (Reg 1052-1057, 6 regs) ----
    if (startAddress === 1052 && regs.length >= 6) {
        const powerL1 = parseFloat((s32(regs, 0) / 1000.0).toFixed(2));
        const powerL2 = parseFloat((s32(regs, 2) / 1000.0).toFixed(2));
        const powerL3 = parseFloat((s32(regs, 4) / 1000.0).toFixed(2));

        return {
            block: 'DSE_POWER_PHASE_1052',
            powerL1, powerL2, powerL3,
        };
    }

    // ---- Block 2: Mains Voltages & Freq (Reg 1058-1072, 15 regs) ----
    //
    // FIX 2026-07-28: todo este bloco estava lendo 2 registradores adiantado.
    // Conferido contra GenComm.pdf "Page 4 - Basic Instrumentation": reg 1058
    // (offset 34) é na verdade "Generator current lag/lead", não o começo da
    // tensão de rede. O layout real a partir de 1058 é:
    //   offset local 0     (reg 1058)      = Generator current lag/lead (ignorado)
    //   offset local 1     (reg 1059)      = Mains frequency
    //   offset local 2-3   (reg 1060-1061) = Mains L1-N voltage
    //   offset local 4-5   (reg 1062-1063) = Mains L2-N voltage
    //   offset local 6-7   (reg 1064-1065) = Mains L3-N voltage
    //   offset local 8-9   (reg 1066-1067) = Mains L1-L2 voltage
    //   offset local 10-11 (reg 1068-1069) = Mains L2-L3 voltage
    //   offset local 12-13 (reg 1070-1071) = Mains L3-L1 voltage
    //   offset local 14    (reg 1072)      = Mains voltage phase lag/lead (ignorado)
    // O código antigo lia tudo 2 registradores cedo demais: "L1" pegava lixo
    // (Generator lag/lead + metade da frequência), "L2"/"L3" na verdade eram
    // L1-N/L2-N (por isso pareciam magnitude de fase-neutro corretas), "L12"
    // era na verdade L3-N (por isso saía ~226V em vez de ~380V — o bug
    // reportado em campo), "L23"/"L31" eram na verdade L1-L2/L2-L3, e a
    // frequência lia o campo de phase lag/lead (por isso sempre null/lixo).
    // L3-L1 nunca era lido. Corrigido abaixo para os offsets reais.
    if (startAddress === 1058 && regs.length >= 15) {
        const mainsFreqRaw = validRaw(u16(regs, 1));
        const mainsFrequency = mainsFreqRaw === null ? null : parseFloat((mainsFreqRaw / 10.0).toFixed(1));
        const mainsVoltageL1 = v10(regs, 2);
        const mainsVoltageL2 = v10(regs, 4);
        const mainsVoltageL3 = v10(regs, 6);
        const mainsVoltageL12 = v10(regs, 8);
        const mainsVoltageL23 = v10(regs, 10);
        const mainsVoltageL31 = v10(regs, 12);

        return {
            block: 'DSE_MAINS_1058',
            mainsVoltageL1, mainsVoltageL2, mainsVoltageL3,
            mainsVoltageL12, mainsVoltageL23, mainsVoltageL31,
            mainsFrequency,
        };
    }

    // ---- Block 2a: Serial number (Reg 770-771, Page 3 offset 2-3, 32-bit) ----
    // GenComm.pdf "Page 3 - Generating Set Status Information": offset 0 =
    // Manufacturer code, offset 1 = Model number, offset 2-3 = Serial number
    // (unsigned 32-bit, range 0-999999999) — confirmado contra a mesma página
    // já usada pelos blocos de Control mode (772 = offset 4) e Status flags
    // (774 = offset 6) logo abaixo, então o endereçamento bate.
    if (startAddress === 770 && regs.length >= 2) {
        const serialNumberRaw = u32(regs, 0);

        return {
            block: 'DSE_SERIAL_770',
            serialNumber: serialNumberRaw > 0 ? String(serialNumberRaw) : null,
        };
    }

    // ---- Block 3: Control mode (Reg 772, Page 3 offset 4) ----
    if (startAddress === 772 && regs.length >= 1) {
        const controlModeRaw = u16(regs, 0);
        const operationMode = decodeControlMode(controlModeRaw);

        return {
            block: 'DSE_CONTROL_772',
            controlModeRaw,
            operationMode,
        };
    }

    // ---- Block 4: Status flags (Reg 774, Page 3 offset 6) ----
    if (startAddress === 774 && regs.length >= 1) {
        const flags = u16(regs, 0);
        return {
            block: 'DSE_FLAGS_774',
            shutdownAlarmActive: Boolean(flags & (1 << 13)),
            electricalTripActive: Boolean(flags & (1 << 12)),
            warningAlarmActive: Boolean(flags & (1 << 11)),
            controlledShutdownActive: Boolean(flags & (1 << 7)),
        };
    }

    // ---- Block 5: Total Active Power (Reg 1536-1537, 2 regs) ----
    if (startAddress === 1536 && regs.length >= 2) {
        const activePowerRaw = s32(regs, 0);
        const activePower = parseFloat((activePowerRaw / 1000.0).toFixed(2));

        return {
            block: 'DSE_POWER_1536',
            activePower,
            activePowerTotal: activePower,
        };
    }

    // ---- Block 6: Engine load (Reg 1558, 1 reg) ----
    if (startAddress === 1558 && regs.length >= 1) {
        const loadRaw = u16(regs, 0);
        const engineLoad = parseFloat((s16(loadRaw) / 10.0).toFixed(1));

        return {
            block: 'DSE_LOAD_1558',
            engineLoad,
        };
    }

    // ---- Block 7: Run Hours (1798-1799) + Total Energy (1800-1801) + Engine
    // Starts (1808-1809). Widened read (see DSE4501_POLL_SEQUENCE) — energy and
    // starts are decoded only if the response actually carries that many
    // registers, so this stays backward-compatible with a bare 2-register read.
    if (startAddress === 1798 && regs.length >= 2) {
        const runTimeSeconds = u32(regs, 0);
        const runHours = parseFloat((runTimeSeconds / 3600.0).toFixed(2));

        const result = {
            block: 'DSE_RUNHOURS_1798',
            runHours,
            totalHours: runHours,
        };

        if (regs.length >= 4) {
            // /Ac/Energy/Forward (reg 1800-1801), scale 10 -> kWh
            const energyRaw = u32(regs, 2);
            result.totalEnergy = parseFloat((energyRaw / 10.0).toFixed(1));
        }

        if (regs.length >= 12) {
            // /Engine/Starts (reg 1808-1809), scale 1
            result.startAttempts = u32(regs, 10);
        }

        return result;
    }

    // ---- Block 8: StatusCode (Reg 1408, 1 reg) ----
    if (startAddress === 1408 && regs.length >= 1) {
        const statusVal = u16(regs, 0);

        return {
            block: 'DSE_STATUS_1408',
            status: decodeStatusFromCode(statusVal),
            statusCodeRaw: statusVal,
        };
    }

    // ---- Block 10: Mains/Generator loading relay — breaker status (Reg 3328, Page 13) ----
    //
    // NOVO 2026-07-28: mainsBreakerClosed/genBreakerClosed nunca eram lidos do
    // DSE — ficavam travados em "aberta" pra sempre (o default do schema),
    // não importava o estado real. Conferido contra GenComm.pdf "Page 13 -
    // Diagnostic - Digital Outputs": um único registrador com campos de 2 bits
    // cada (código 0=De-energised, 1=Energised, 2=Reserved, 3=Unimplemented):
    // bits 15-16 Fuel relay, 13-14 Start relay, 11-12 Mains loading relay,
    // 9-10 Generator loading relay, 7-8 Modem power relay.
    // Código 3 (Unimplemented) significa que este DSE4501 não reporta esse
    // relé — nesse caso retornamos null em vez de forçar true/false errado.
    if (startAddress === 3328 && regs.length >= 1) {
        const raw = u16(regs, 0);
        const mainsCode = (raw >> 10) & 0x3;
        const genCode = (raw >> 8) & 0x3;
        const decodeRelay = (code) => (code === 1 ? true : code === 0 ? false : null);

        return {
            block: 'DSE_RELAYS_3328',
            mainsBreakerClosed: decodeRelay(mainsCode),
            genBreakerClosed: decodeRelay(genCode),
        };
    }

    // ---- Block 9: Named alarms (Reg 2048+, Page 8) ----
    if (startAddress === 2048 && regs.length >= 2) {
        const alarmData = decodeNamedAlarms(regs);

        return {
            block: 'DSE_ALARMS_2048',
            ...alarmData,
        };
    }

    return null;
}

/**
 * Parses a complete DSE MQTT payload.
 * Returns array of { ok, decoded } objects.
 */
export function decodeDsePayload(payload) {
    const results = [];

    if (!payload || !payload.modbusRequest || !payload.modbusResponse) {
        return results;
    }

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
                console.log(`[DSE-PARSER] Exception response at index ${i}: Code ${resp.exceptionCode}`);
                results.push({ ok: false, error: `Modbus exception ${resp.exceptionCode}`, index: i });
                continue;
            }

            const decoded = decodeDseByBlock(req.slaveId, req.fn || 3, req.startAddress, resp.registers);

            if (decoded) {
                results.push({ ok: true, decoded });
            } else {
                results.push({ ok: false, error: `Unknown DSE block at address ${req.startAddress}`, index: i });
            }
        } catch (err) {
            console.error(`[DSE-PARSER] Error decoding index ${i}: ${err.message}`);
            results.push({ ok: false, error: err.message, index: i });
        }
    }

    return results;
}
