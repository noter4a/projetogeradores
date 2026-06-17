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
    if (startAddress === 1024 && regs.length >= 28) {
        const oilPressureRaw = u16(regs, 0);
        const coolantTempRaw = u16(regs, 1);
        const fuelLevel = u16(regs, 3);
        const batteryRaw = u16(regs, 5);
        const rpm = u16(regs, 6);
        const frequencyRaw = u16(regs, 7);

        const engineTemp = s16(coolantTempRaw);
        const oilPressure = parseFloat((oilPressureRaw / 100.0).toFixed(2));
        const batteryVoltage = parseFloat((batteryRaw / 10.0).toFixed(1));
        const frequency = parseFloat((frequencyRaw / 10.0).toFixed(1));

        const voltageL1 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));
        const voltageL2 = parseFloat((u32(regs, 10) / 10.0).toFixed(1));
        const voltageL3 = parseFloat((u32(regs, 12) / 10.0).toFixed(1));
        const voltageL12 = parseFloat((u32(regs, 14) / 10.0).toFixed(1));
        const voltageL23 = parseFloat((u32(regs, 16) / 10.0).toFixed(1));
        const voltageL31 = parseFloat((u32(regs, 18) / 10.0).toFixed(1));
        const currentL1 = parseFloat((u32(regs, 20) / 10.0).toFixed(1));
        const currentL2 = parseFloat((u32(regs, 22) / 10.0).toFixed(1));
        const currentL3 = parseFloat((u32(regs, 24) / 10.0).toFixed(1));
        const avgVal = (voltageL1 + voltageL2 + voltageL3) / 3;
        const avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);

        return {
            block: 'DSE_ENGINE_GEN_1024',
            oilPressure,
            engineTemp,
            fuelLevel,
            batteryVoltage,
            rpm,
            frequency,
            voltageL1, voltageL2, voltageL3, avgVoltage,
            voltageL12, voltageL23, voltageL31,
            currentL1, currentL2, currentL3,
            mainsCurrentL1: currentL1,
            mainsCurrentL2: currentL2,
            mainsCurrentL3: currentL3,
        };
    }

    // ---- Block 1a: Engine + Gen Voltages L-N (Reg 1024-1037, 14 regs) ----
    if (startAddress === 1024 && regs.length >= 14) {
        const oilPressureRaw = u16(regs, 0);
        const coolantTempRaw = u16(regs, 1);
        const fuelLevel = u16(regs, 3);
        const batteryRaw = u16(regs, 5);
        const rpm = u16(regs, 6);
        const frequencyRaw = u16(regs, 7);

        const engineTemp = s16(coolantTempRaw);
        const oilPressure = parseFloat((oilPressureRaw / 100.0).toFixed(2));
        const batteryVoltage = parseFloat((batteryRaw / 10.0).toFixed(1));
        const frequency = parseFloat((frequencyRaw / 10.0).toFixed(1));
        const voltageL1 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));
        const voltageL2 = parseFloat((u32(regs, 10) / 10.0).toFixed(1));
        const voltageL3 = parseFloat((u32(regs, 12) / 10.0).toFixed(1));
        const avgVal = (voltageL1 + voltageL2 + voltageL3) / 3;
        const avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);

        return {
            block: 'DSE_ENGINE_GEN_1024_PART1',
            oilPressure, engineTemp, fuelLevel, batteryVoltage, rpm, frequency,
            voltageL1, voltageL2, voltageL3, avgVoltage,
        };
    }

    // ---- Block 1b: Gen Voltages L-L & Currents (Reg 1038-1051, 14 regs) ----
    if (startAddress === 1038 && regs.length >= 14) {
        const voltageL12 = parseFloat((u32(regs, 0) / 10.0).toFixed(1));
        const voltageL23 = parseFloat((u32(regs, 2) / 10.0).toFixed(1));
        const voltageL31 = parseFloat((u32(regs, 4) / 10.0).toFixed(1));
        const currentL1 = parseFloat((u32(regs, 6) / 10.0).toFixed(1));
        const currentL2 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));
        const currentL3 = parseFloat((u32(regs, 10) / 10.0).toFixed(1));

        return {
            block: 'DSE_ENGINE_GEN_1038_PART2',
            voltageL12, voltageL23, voltageL31,
            currentL1, currentL2, currentL3,
            mainsCurrentL1: currentL1,
            mainsCurrentL2: currentL2,
            mainsCurrentL3: currentL3,
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
    if (startAddress === 1058 && regs.length >= 15) {
        const mainsVoltageL1 = parseFloat((u32(regs, 0) / 10.0).toFixed(1));
        const mainsVoltageL2 = parseFloat((u32(regs, 2) / 10.0).toFixed(1));
        const mainsVoltageL3 = parseFloat((u32(regs, 4) / 10.0).toFixed(1));
        const mainsVoltageL12 = parseFloat((u32(regs, 6) / 10.0).toFixed(1));
        const mainsVoltageL23 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));
        const mainsVoltageL31 = parseFloat((u32(regs, 10) / 10.0).toFixed(1));
        const mainsFreqRaw = u16(regs, 14);
        const mainsFrequency = parseFloat((mainsFreqRaw / 10.0).toFixed(1));

        return {
            block: 'DSE_MAINS_1058',
            mainsVoltageL1, mainsVoltageL2, mainsVoltageL3,
            mainsVoltageL12, mainsVoltageL23, mainsVoltageL31,
            mainsFrequency,
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

    // ---- Block 7: Run Hours (Reg 1798-1799, 2 regs) ----
    if (startAddress === 1798 && regs.length >= 2) {
        const runTimeSeconds = u32(regs, 0);
        const runHours = parseFloat((runTimeSeconds / 3600.0).toFixed(2));

        return {
            block: 'DSE_RUNHOURS_1798',
            runHours,
            totalHours: runHours,
        };
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
