// dse-parser.js
// Parser for Deep Sea Electronics (DSE) controllers using GenComm Modbus protocol
// Mapped parameters: Voltages (Ph-N and Ph-Ph), Currents, Freq, RPM, Temperature, Oil Pressure, Battery, Fuel, Run Hours, Status.

import { parseRtuRequestHex, parseRtuResponseHex } from './sgc120-parser.js';

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

/**
 * Decode DSE registers by block (startAddress + register array)
 * Returns decoded object with block name and mapped fields
 */
export function decodeDseByBlock(slaveId, fn, startAddress, regs) {
    console.log(`[DSE-PARSER] Rx Slave: ${slaveId}, Fn: ${fn}, Addr: ${startAddress}, Len: ${regs.length}`);

    // ---- Block 1: Engine + Gen Voltages & Currents (Reg 1024-1051, 28 regs) ----
    if (startAddress === 1024 && regs.length >= 28) {
        const oilPressureRaw = u16(regs, 0); // Reg 1024 (kPa)
        const coolantTempRaw = u16(regs, 1); // Reg 1025 (°C, signed)
        const fuelLevel = u16(regs, 3);      // Reg 1027 (%)
        const batteryRaw = u16(regs, 5);     // Reg 1029 (V, scaled by 10)
        const rpm = u16(regs, 6);            // Reg 1030 (RPM)
        const frequencyRaw = u16(regs, 7);   // Reg 1031 (Hz, scaled by 10)

        // Signed coolant temp conversion
        const engineTemp = coolantTempRaw > 32767 ? coolantTempRaw - 65536 : coolantTempRaw;
        // Convert kPa to bar (1 bar = 100 kPa)
        const oilPressure = parseFloat((oilPressureRaw / 100.0).toFixed(2));
        const batteryVoltage = parseFloat((batteryRaw / 10.0).toFixed(1));
        const frequency = parseFloat((frequencyRaw / 10.0).toFixed(1));

        // Voltages (u32, scaled by 10)
        const voltageL1 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));   // Reg 1032-1033 (L1-N)
        const voltageL2 = parseFloat((u32(regs, 10) / 10.0).toFixed(1));  // Reg 1034-1035 (L2-N)
        const voltageL3 = parseFloat((u32(regs, 12) / 10.0).toFixed(1));  // Reg 1036-1037 (L3-N)

        const voltageL12 = parseFloat((u32(regs, 14) / 10.0).toFixed(1)); // Reg 1038-1039 (L1-L2)
        const voltageL23 = parseFloat((u32(regs, 16) / 10.0).toFixed(1)); // Reg 1040-1041 (L2-L3)
        const voltageL31 = parseFloat((u32(regs, 18) / 10.0).toFixed(1)); // Reg 1042-1043 (L3-L1)

        // Currents (u32, scaled by 10)
        const currentL1 = parseFloat((u32(regs, 20) / 10.0).toFixed(1));  // Reg 1044-1045
        const currentL2 = parseFloat((u32(regs, 22) / 10.0).toFixed(1));  // Reg 1046-1047
        const currentL3 = parseFloat((u32(regs, 24) / 10.0).toFixed(1));  // Reg 1048-1049

        // Calculate average voltage
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
            voltageL1,
            voltageL2,
            voltageL3,
            avgVoltage,
            voltageL12,
            voltageL23,
            voltageL31,
            currentL1,
            currentL2,
            currentL3,
            mainsCurrentL1: currentL1, // Load current matches mains current when on mains
            mainsCurrentL2: currentL2,
            mainsCurrentL3: currentL3,
        };
    }

    // ---- Block 1a: Engine + Gen Voltages L-N (Reg 1024-1037, 14 regs) ----
    if (startAddress === 1024 && regs.length >= 14) {
        const oilPressureRaw = u16(regs, 0); // Reg 1024 (kPa)
        const coolantTempRaw = u16(regs, 1); // Reg 1025 (°C, signed)
        const fuelLevel = u16(regs, 3);      // Reg 1027 (%)
        const batteryRaw = u16(regs, 5);     // Reg 1029 (V, scaled by 10)
        const rpm = u16(regs, 6);            // Reg 1030 (RPM)
        const frequencyRaw = u16(regs, 7);   // Reg 1031 (Hz, scaled by 10)

        const engineTemp = coolantTempRaw > 32767 ? coolantTempRaw - 65536 : coolantTempRaw;
        const oilPressure = parseFloat((oilPressureRaw / 100.0).toFixed(2));
        const batteryVoltage = parseFloat((batteryRaw / 10.0).toFixed(1));
        const frequency = parseFloat((frequencyRaw / 10.0).toFixed(1));

        // Voltages (u32, scaled by 10)
        const voltageL1 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));   // Reg 1032-1033 (L1-N)
        const voltageL2 = parseFloat((u32(regs, 10) / 10.0).toFixed(1));  // Reg 1034-1035 (L2-N)
        const voltageL3 = parseFloat((u32(regs, 12) / 10.0).toFixed(1));  // Reg 1036-1037 (L3-N)

        const avgVal = (voltageL1 + voltageL2 + voltageL3) / 3;
        const avgVoltage = isNaN(avgVal) ? 0 : Math.round(avgVal);

        return {
            block: 'DSE_ENGINE_GEN_1024_PART1',
            oilPressure,
            engineTemp,
            fuelLevel,
            batteryVoltage,
            rpm,
            frequency,
            voltageL1,
            voltageL2,
            voltageL3,
            avgVoltage,
        };
    }

    // ---- Block 1b: Gen Voltages L-L & Currents (Reg 1038-1051, 14 regs) ----
    if (startAddress === 1038 && regs.length >= 14) {
        // Voltages (u32, scaled by 10)
        const voltageL12 = parseFloat((u32(regs, 0) / 10.0).toFixed(1)); // Reg 1038-1039 (L1-L2)
        const voltageL23 = parseFloat((u32(regs, 2) / 10.0).toFixed(1)); // Reg 1040-1041 (L2-L3)
        const voltageL31 = parseFloat((u32(regs, 4) / 10.0).toFixed(1)); // Reg 1042-1043 (L3-L1)

        // Currents (u32, scaled by 10)
        const currentL1 = parseFloat((u32(regs, 6) / 10.0).toFixed(1));  // Reg 1044-1045
        const currentL2 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));  // Reg 1046-1047
        const currentL3 = parseFloat((u32(regs, 10) / 10.0).toFixed(1)); // Reg 1048-1049

        return {
            block: 'DSE_ENGINE_GEN_1038_PART2',
            voltageL12,
            voltageL23,
            voltageL31,
            currentL1,
            currentL2,
            currentL3,
            mainsCurrentL1: currentL1,
            mainsCurrentL2: currentL2,
            mainsCurrentL3: currentL3,
        };
    }

    // ---- Block 2: Mains Voltages & Freq (Reg 1058-1072, 15 regs) ----
    if (startAddress === 1058 && regs.length >= 15) {
        const mainsVoltageL1 = parseFloat((u32(regs, 0) / 10.0).toFixed(1));   // Reg 1058-1059 (L1-N)
        const mainsVoltageL2 = parseFloat((u32(regs, 2) / 10.0).toFixed(1));   // Reg 1060-1061 (L2-N)
        const mainsVoltageL3 = parseFloat((u32(regs, 4) / 10.0).toFixed(1));   // Reg 1062-1063 (L3-N)

        const mainsVoltageL12 = parseFloat((u32(regs, 6) / 10.0).toFixed(1));  // Reg 1064-1065 (L1-L2)
        const mainsVoltageL23 = parseFloat((u32(regs, 8) / 10.0).toFixed(1));  // Reg 1066-1067 (L2-L3)
        const mainsVoltageL31 = parseFloat((u32(regs, 10) / 10.0).toFixed(1)); // Reg 1068-1069 (L3-L1)

        const mainsFreqRaw = u16(regs, 14); // Reg 1072 (Hz, scaled by 10)
        const mainsFrequency = parseFloat((mainsFreqRaw / 10.0).toFixed(1));

        return {
            block: 'DSE_MAINS_1058',
            mainsVoltageL1,
            mainsVoltageL2,
            mainsVoltageL3,
            mainsVoltageL12,
            mainsVoltageL23,
            mainsVoltageL31,
            mainsFrequency,
        };
    }

    // ---- Block 3: Total Active Power (Reg 1536-1537, 2 regs) ----
    if (startAddress === 1536 && regs.length >= 2) {
        const activePowerRaw = s32(regs, 0); // Reg 1536-1537 (Watts)
        const activePower = parseFloat((activePowerRaw / 1000.0).toFixed(2)); // convert to kW

        return {
            block: 'DSE_POWER_1536',
            activePower,
            activePowerTotal: activePower
        };
    }

    // ---- Block 4: Run Hours (Reg 1798-1799, 2 regs) ----
    if (startAddress === 1798 && regs.length >= 2) {
        const runTimeSeconds = u32(regs, 0); // Reg 1798-1799 (Seconds)
        const runHours = parseFloat((runTimeSeconds / 3600.0).toFixed(2));

        return {
            block: 'DSE_RUNHOURS_1798',
            runHours,
            totalHours: runHours
        };
    }

    // ---- Block 5: StatusCode (Reg 1408, 1 reg) ----
    if (startAddress === 1408 && regs.length >= 1) {
        const statusVal = u16(regs, 0); // Reg 1408
        
        let status = 'STOPPED';
        if (statusVal === 8) {
            status = 'RUNNING';
        } else if (statusVal >= 1 && statusVal <= 7) {
            status = 'STARTING';
        } else if (statusVal === 9) {
            status = 'STOPPING';
        } else if (statusVal === 10) {
            status = 'ALARM';
        }

        return {
            block: 'DSE_STATUS_1408',
            status,
            statusCodeRaw: statusVal
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
