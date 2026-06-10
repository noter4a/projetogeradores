// kva-parser.js
// Parser para controladores KVA (K30XTe 8.10 / K30XL 3.00 / Eclipse 2.00)
// Protocolo Modbus RTU via KvaNet
// Endereços na faixa 10001-19108

import { hexToBuf, crc16Modbus, verifyCrcRtu, parseRtuRequestHex, parseRtuResponseHex } from './sgc120-parser.js';

// ========================================
// KVA Fault Bitmap Definitions
// ========================================

// Registro 12003 - Falhas H (High Word)
const FALHAS_H = [
    { bit: 0, name: 'Falha no Pick-Up' },
    { bit: 1, name: 'Alta Temperatura' },
    { bit: 2, name: 'Baixo Nível de Água' },
    { bit: 3, name: 'Falha na Conexão CAN' },
];

// Registro 12004 - Falhas L (Low Word)
const FALHAS_L = [
    { bit: 0,  name: 'CGR não Fecha' },
    { bit: 1,  name: 'Parada de Emergência' },
    { bit: 2,  name: 'CRD não Abre' },
    { bit: 3,  name: 'Erro no Sensor de Pressão' },
    { bit: 5,  name: 'Sem Sensor de Partida' },
    { bit: 6,  name: 'Alta Tensão do Gerador' },
    { bit: 7,  name: 'Baixa Tensão do Gerador' },
    { bit: 8,  name: 'Sobrecarga' },
    { bit: 9,  name: 'Sub Frequência' },
    { bit: 10, name: 'Falha na Partida' },
    { bit: 11, name: 'Nível de Combustível Crítico' },
    { bit: 12, name: 'Baixa Pressão do Óleo' },
    { bit: 13, name: 'Erro no Sensor Temperatura' },
    { bit: 14, name: 'Falha na Refrigeração' },
    { bit: 15, name: 'Sobre Velocidade' },
];

// Registro 12005 - Avisos H
const AVISOS_H = [
    { bit: 0, name: 'Sequência de Fases da Rede' },
    { bit: 1, name: 'Erro no Sensor de Combustível' },
];

// Registro 12006 - Avisos L
const AVISOS_L = [
    { bit: 0,  name: 'CGR não Abre' },
    { bit: 1,  name: 'Manutenção Periódica Vencida' },
    { bit: 2,  name: 'Erro no Pick-up' },
    { bit: 3,  name: 'Defeito no Carregador' },
    { bit: 4,  name: 'Bateria descarregada' },
    { bit: 5,  name: 'Nível de Combustível Baixo' },
    { bit: 6,  name: 'Motor Frio - Aquecendo' },
    { bit: 7,  name: 'Sem sensor de pressão do óleo' },
    { bit: 8,  name: 'Erro no sensor de pressão do óleo' },
    { bit: 9,  name: 'Erro no Pressostato' },
    { bit: 10, name: 'Sem sensor de temperatura' },
    { bit: 11, name: 'Erro no sensor de temperatura' },
    { bit: 13, name: 'Fora do Horário de Serviço' },
    { bit: 14, name: 'CRD não Fecha' },
    { bit: 15, name: 'Partida Inibida (Feriado)' },
];

// ========================================
// Helpers
// ========================================
const u16 = (regs, i) => (regs[i] ?? 0);

function decodeBitmap(value, defs) {
    const active = [];
    for (const def of defs) {
        if ((value >> def.bit) & 1) {
            active.push(def.name);
        }
    }
    return active;
}

// ========================================
// Block Decoder
// ========================================

/**
 * Decode KVA registers by block (startAddress + register array)
 * Returns decoded object with block name and mapped fields
 */
export function decodeKvaByBlock(slaveId, fn, startAddress, regs) {
    console.log(`[KVA-PARSER] Rx Slave: ${slaveId}, Fn: ${fn}, Addr: ${startAddress}, Len: ${regs.length}`);

    // ---- Block 1: Horímetro + Falhas + Avisos + Status (12001-12007, 7 regs) ----
    if (startAddress === 12001 && regs.length >= 7) {
        const hoursH = u16(regs, 0); // 12001
        const hoursL = u16(regs, 1); // 12002
        const rawSeconds = (hoursH << 16) | hoursL;
        // KVA stores horímetro in SECONDS — convert to hours
        const totalHours = parseFloat((rawSeconds / 3600).toFixed(2));

        const falhasH = u16(regs, 2); // 12003
        const falhasL = u16(regs, 3); // 12004
        const avisosH = u16(regs, 4); // 12005
        const avisosL = u16(regs, 5); // 12006
        const statusLed = u16(regs, 6); // 12007

        // Decode faults
        const activeFaults = [
            ...decodeBitmap(falhasH, FALHAS_H),
            ...decodeBitmap(falhasL, FALHAS_L)
        ];

        // Decode warnings
        const activeWarnings = [
            ...decodeBitmap(avisosH, AVISOS_H),
            ...decodeBitmap(avisosL, AVISOS_L)
        ];

        // Decode Status LEDs
        const isAuto     = !!(statusLed & (1 << 0));  // Bit 0: AUT
        const isManual   = !!(statusLed & (1 << 1));  // Bit 1: MAN
        const isInhibit  = !!(statusLed & (1 << 2));  // Bit 2: INIB
        const mainsFeeding = !!(statusLed & (1 << 3)); // Bit 3: RAC
        const genFeeding   = !!(statusLed & (1 << 4)); // Bit 4: GAC
        const hasWarning   = !!(statusLed & (1 << 5)); // Bit 5: WARN
        const hasFault     = !!(statusLed & (1 << 6)); // Bit 6: FAIL/ALM
        const motorRunning = !!(statusLed & (1 << 8)); // Bit 8: MOT
        const genVoltOk    = !!(statusLed & (1 << 10)); // Bit 10: GOK
        const mainsOk      = !!(statusLed & (1 << 12)); // Bit 12: ROK

        // Determine operation mode
        let operationMode = 'UNKNOWN';
        if (isAuto)    operationMode = 'AUTO';
        if (isManual)  operationMode = 'MANUAL';
        if (isInhibit) operationMode = 'INHIBITED';

        // Determine alarm state
        let alarmCode = 0;
        let alarmMessage = '';
        let isStartFailure = false;

        if (activeFaults.length > 0) {
            alarmCode = (falhasH << 16) | falhasL;
            alarmMessage = activeFaults.join(', ');
            isStartFailure = activeFaults.includes('Falha na Partida');
        }

        console.log(`[KVA-PARSER] Status: Mode=${operationMode}, Motor=${motorRunning}, Faults=${activeFaults.length}, Warnings=${activeWarnings.length}, Hours=${totalHours}`);

        return {
            block: 'KVA_STATUS_12001',
            totalHours,
            runHours: totalHours,
            operationMode,
            motorRunning,
            genFeeding,
            mainsFeeding,
            genBreakerClosed: genFeeding,
            mainsBreakerClosed: mainsFeeding,
            mainsOk,
            genVoltOk,
            hasFault,
            hasWarning,
            alarmCode,
            alarmMessage,
            isStartFailure,
            activeFaults,
            activeWarnings,
            statusLedRaw: statusLed,
            falhasH,
            falhasL,
        };
    }

    // ---- Block 2: Rede + GMG Tensões + Correntes + Potências (12011-12025, 15 regs) ----
    if (startAddress === 12011 && regs.length >= 15) {
        const rawMainsV12 = u16(regs, 0);
        const rawMainsV23 = u16(regs, 1);
        const rawMainsV31 = u16(regs, 2);
        const rawMainsFreq = u16(regs, 3);
        const rawGenV12 = u16(regs, 4);
        const rawGenV23 = u16(regs, 5);
        const rawGenV31 = u16(regs, 6);
        const rawGenFreq = u16(regs, 7);
        const rawI1 = u16(regs, 8);
        const rawI2 = u16(regs, 9);
        const rawI3 = u16(regs, 10);
        const rawPActive = u16(regs, 11);
        const rawPReactive = u16(regs, 12);
        const rawPApparent = u16(regs, 13);
        const rawPF = u16(regs, 14);

        const result = {
            block: 'KVA_ELECTRICAL_12011',
            mainsVoltageL12: rawMainsV12 === 65535 ? null : rawMainsV12,
            mainsVoltageL23: rawMainsV23 === 65535 ? null : rawMainsV23,
            mainsVoltageL31: rawMainsV31 === 65535 ? null : rawMainsV31,
            mainsFrequency: rawMainsFreq === 65535 ? null : Number((rawMainsFreq * 0.1).toFixed(1)),
            voltageL12: rawGenV12 === 65535 ? null : rawGenV12,
            voltageL23: rawGenV23 === 65535 ? null : rawGenV23,
            voltageL31: rawGenV31 === 65535 ? null : rawGenV31,
            frequency: rawGenFreq === 65535 ? null : Number((rawGenFreq * 0.1).toFixed(1)),
            currentL1: rawI1 === 65535 ? null : rawI1,
            currentL2: rawI2 === 65535 ? null : rawI2,
            currentL3: rawI3 === 65535 ? null : rawI3,
            activePower: rawPActive === 65535 ? null : rawPActive,
            reactivePower: rawPReactive === 65535 ? null : rawPReactive,
            apparentPower: rawPApparent === 65535 ? null : rawPApparent,
            powerFactor: rawPF === 65535 ? null : Number((rawPF * 0.01).toFixed(2)),
        };

        console.log(`[KVA-PARSER] Electrical: GenV=${result.voltageL12}/${result.voltageL23}/${result.voltageL31}V, Freq=${result.frequency}Hz, I=${result.currentL1}/${result.currentL2}/${result.currentL3}A, P=${result.activePower}kW`);
        return result;
    }

    // ---- Block 3: Motor (12027-12033, 7 regs) ----
    if (startAddress === 12027 && regs.length >= 7) {
        const rawRpm = u16(regs, 0);
        const rawTemp = u16(regs, 1);
        const rawPress = u16(regs, 2);
        const rawFuel = u16(regs, 3);
        const rawCons = u16(regs, 5);
        const rawBat = u16(regs, 6);

        const result = {
            block: 'KVA_ENGINE_12027',
            rpm: rawRpm === 65535 ? null : rawRpm,
            engineTemp: rawTemp === 65535 ? null : rawTemp,
            oilPressure: rawPress === 65535 ? null : Number((rawPress * 0.01).toFixed(2)),
            fuelLevel: rawFuel === 65535 ? null : rawFuel,
            fuelConsumption: rawCons === 65535 ? null : Number((rawCons * 0.1).toFixed(1)),
            batteryVoltage: rawBat === 65535 ? null : Number((rawBat * 0.1).toFixed(1)),
        };

        console.log(`[KVA-PARSER] Engine: RPM=${result.rpm}, Temp=${result.engineTemp}°C, Oil=${result.oilPressure}bar, Fuel=${result.fuelLevel}%, Bat=${result.batteryVoltage}V`);
        return result;
    }

    // ---- Block 4: Tensões Fase-Neutro (12043-12048, 6 regs) ----
    if (startAddress === 12043 && regs.length >= 6) {
        const rawMainsV1 = u16(regs, 0);
        const rawMainsV2 = u16(regs, 1);
        const rawMainsV3 = u16(regs, 2);
        const rawGenV1 = u16(regs, 3);
        const rawGenV2 = u16(regs, 4);
        const rawGenV3 = u16(regs, 5);

        const result = {
            block: 'KVA_PHASE_NEUTRAL_12043',
            mainsVoltageL1: rawMainsV1 === 65535 ? null : rawMainsV1,
            mainsVoltageL2: rawMainsV2 === 65535 ? null : rawMainsV2,
            mainsVoltageL3: rawMainsV3 === 65535 ? null : rawMainsV3,
            voltageL1: rawGenV1 === 65535 ? null : rawGenV1,
            voltageL2: rawGenV2 === 65535 ? null : rawGenV2,
            voltageL3: rawGenV3 === 65535 ? null : rawGenV3,
        };

        console.log(`[KVA-PARSER] Phase-Neutral: Mains=${result.mainsVoltageL1}/${result.mainsVoltageL2}/${result.mainsVoltageL3}V, Gen=${result.voltageL1}/${result.voltageL2}/${result.voltageL3}V`);
        return result;
    }

    // Unknown block
    console.log(`[KVA-PARSER] Unknown block at address ${startAddress} with ${regs.length} registers`);
    return null;
}

// ========================================
// Payload Decoder (processes full MQTT payload)
// ========================================

/**
 * Decode a KVA MQTT payload (same format as SGC-120: modbusRequest + modbusResponse arrays)
 * Returns array of { ok, decoded } objects
 */
export function decodeKvaPayload(payload) {
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
                console.log(`[KVA-PARSER] Exception response at index ${i}: Code ${resp.exceptionCode}`);
                results.push({ ok: false, error: `Modbus exception ${resp.exceptionCode}`, index: i });
                continue;
            }

            const decoded = decodeKvaByBlock(req.slaveId, req.fn || 3, req.startAddress, resp.registers);

            if (decoded) {
                results.push({ ok: true, decoded });
            } else {
                results.push({ ok: false, error: `Unknown KVA block at addr ${req.startAddress}`, index: i });
            }
        } catch (err) {
            console.error(`[KVA-PARSER] Error decoding index ${i}: ${err.message}`);
            results.push({ ok: false, error: err.message, index: i });
        }
    }

    return results;
}
