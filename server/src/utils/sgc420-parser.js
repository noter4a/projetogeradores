// sgc420-parser.js
// Parser DEIF SGC 420 Mk II — endereçamento e escalas distintos do SGC 120

import { parseRtuRequestHex, parseRtuResponseHex } from './sgc120-parser.js';

export const SGC420_POLL_SEQUENCE = [
  { startAddress: 91, quantity: 1 },   // Status word — modo selecionado + flags
  { startAddress: 89, quantity: 1 },   // Entradas digitais
  { startAddress: 61, quantity: 4 },   // Horímetro motor 61-64
  { startAddress: 1,  quantity: 9 },   // Tensões / freq gerador
  { startAddress: 51, quantity: 8 },   // Motor 51-58
  { startAddress: 14, quantity: 9 },   // Rede 14-22
  { startAddress: 23, quantity: 3 },   // Corrente de carga
  { startAddress: 26, quantity: 5 },   // Potência 26-30 (L1/L2/L3 + total + %)
  { startAddress: 72, quantity: 14 },  // Alarmes 72-85
];

export function isSgc420Controller(controller) {
  const c = (controller || '').toLowerCase();
  return c === 'sgc420' || c === 'deif420' || c === 'deif_sgc420';
}

const u16 = (regs, i) => (regs[i] ?? 0);
const scale01 = (x) => Math.round(x * 10) / 10;

/**
 * Reg 91: modo selecionado no byte alto.
 * Campo SGC420: Auto parado = 0x4A80, Manual parado = 0x4280 — mesmo nibble 4, bytes 0x4A vs 0x42.
 * Não usar só (raw >> 12) & 0x0f — distingue errado Auto/Manual.
 */
function decodeReg91OperationMode(raw) {
  const highByte = (raw >> 8) & 0xff;

  if (highByte === 0x04 || highByte === 0x4a || highByte === 0x6c) return 'AUTO';
  if (highByte === 0x42 || highByte === 0x60 || highByte === 0x64 || highByte === 0x96) return 'MANUAL';
  if (highByte === 0x50) return 'TEST';
  return null;
}

/**
 * Reg 91 status word.
 * dgOpMode (bits 11-13) = estado de operação do DG (stop/manual/auto/test), não o botão Auto/Manual.
 */
function decodeReg91Status(raw) {
  const dgOpMode = (raw >> 11) & 0x07;
  const opMode = decodeReg91OperationMode(raw);

  // Reg 91 "DG status" load-path bits. The official DEIF SGC 420 Mk II Modbus
  // table (sgc-420-mk-ii-modbus-tables-4189341402-uk.xlsx) lists:
  //   bit 11/16 (0x0400) = "Load on Mains"
  //   bit 10/16 (0x0200) = "Load on DG"
  //   bit 15/16 (0x4000) = "Mains healthy" (grid has voltage — NOT the breaker)
  // BUT field measurement on Ciklo55 shows these two are swapped in the actual
  // firmware: with the genset STOPPED (0 V, 0 rpm) and the grid present, Reg 91
  // read 0x4280 — i.e. bit 0x0200 set. The load cannot physically be on a
  // stopped generator, so 0x0200 must be "Load on Mains", not "Load on DG".
  // (This also explains why an earlier attempt distrusted these bits: the
  // "Load on DG" bit appeared active with the genset off.) We trust the
  // measured reality over the datasheet labels:
  const loadOnMains = (raw & 0x0200) !== 0; // empirically the mains load-path bit
  const loadOnDg = (raw & 0x0400) !== 0;    // empirically the generator load-path bit

  return {
    opMode,
    dgOpMode,
    loadOnMains,
    loadOnDg,
  };
}

/**
 * Estado real das chaves QTA a partir do Reg 91 (DEIF DG status): bit "Load on
 * Mains" = chave de rede fechada, bit "Load on DG" = chave do gerador fechada.
 *
 * NÃO inferir a chave de rede pela presença de tensão: a rede pode estar
 * energizada ("Mains healthy" = 1) com a chave de rede ABERTA — era exatamente
 * esse o bug (rede aberta aparecendo como fechada porque havia tensão de rede).
 * A heurística antiga de tensão/RPM fica só como fallback para os primeiros
 * frames, antes do Reg 91 ter sido lido na sessão.
 */
export function reconcileSgc420BreakerState(data) {
  if (data.loadOnMains !== undefined || data.loadOnDg !== undefined) {
    data.mainsBreakerClosed = data.loadOnMains === true;
    data.genBreakerClosed = data.loadOnDg === true;
    return data;
  }

  // Fallback (só até o Reg 91 chegar): tensão/RPM.
  const mainsV = Math.max(data.mainsVoltageL1 || 0, data.mainsVoltageL2 || 0, data.mainsVoltageL3 || 0);
  const genV = Math.max(data.voltageL1 || 0, data.voltageL2 || 0, data.voltageL3 || 0);
  const rpm = data.rpm ?? 0;

  const genEnergized = rpm > 100 || genV > 80;
  const mainsEnergized = mainsV > 100;

  if (!genEnergized && mainsEnergized) {
    data.mainsBreakerClosed = true;
    data.genBreakerClosed = false;
  } else if (genEnergized && !mainsEnergized) {
    data.genBreakerClosed = true;
    data.mainsBreakerClosed = false;
  } else if (genEnergized && mainsEnergized) {
    if (genV > mainsV + 20) {
      data.genBreakerClosed = true;
      data.mainsBreakerClosed = false;
    } else {
      data.mainsBreakerClosed = true;
      data.genBreakerClosed = false;
    }
  } else {
    data.mainsBreakerClosed = false;
    data.genBreakerClosed = false;
  }

  return data;
}

/** Combustível: valor ≤100 = % inteiro; >100 = escala 0.1 (ex. 890 → 89%) */
function decodeFuelLevelPct(raw) {
  if (raw <= 0) return 0;
  if (raw <= 100) return raw;
  return scale01(Math.min(raw * 0.1, 100));
}

const ALARM_DEFS_420 = {
  72: [
    { name: 'Baixa Pressão Óleo', shift: 12 },
    { name: 'Alta Temp. Motor', shift: 8 },
    { name: 'Baixo Nível Combustível', shift: 4 },
    { name: 'Nível de Água', shift: 0 },
  ],
  73: [
    { name: 'Subvelocidade', shift: 12 },
    { name: 'Sobrevelocidade', shift: 8 },
    { name: 'Falha na Partida', shift: 4 },
    { name: 'Falha na Parada', shift: 0 },
  ],
  74: [
    { name: 'Circ. Temp Abrigo Aberto', shift: 12 },
    { name: 'Alta Temp. Abrigo', shift: 8 },
    { name: 'Baixa Frequência Ger.', shift: 4 },
    { name: 'Alta Frequência Ger.', shift: 0 },
  ],
  75: [
    { name: 'Alta Corrente Ger.', shift: 12 },
    { name: 'Sobrecarga Ger.', shift: 8 },
    { name: 'Carga Desbalanceada', shift: 4 },
    { name: 'Parada de Emergência', shift: 0 },
  ],
  76: [
    { name: 'Falha Alt. de Carga', shift: 12 },
    { name: 'Manutenção Filtro Óleo', shift: 8 },
    { name: 'Lâmpada MIL', shift: 4 },
    { name: 'Lâmpada Vermelha', shift: 0 },
  ],
  77: [
    { name: 'Baixa Tensão Bateria', shift: 12 },
    { name: 'Alta Tensão Bateria', shift: 8 },
    { name: 'Circ. Temp Motor Aberto', shift: 4 },
    { name: 'Potência Reversa', shift: 0 },
  ],
  78: [
    { name: 'Roubo de Combustível', shift: 12 },
    { name: 'Falha Pick-up Mag.', shift: 8 },
    { name: 'Circ. Pressão Óleo Aberto', shift: 4 },
  ],
  83: [
    { name: 'Fase L1 Baixa Tensão', shift: 12 },
    { name: 'Fase L1 Alta Tensão', shift: 8 },
    { name: 'Fase L2 Baixa Tensão', shift: 4 },
    { name: 'Fase L2 Alta Tensão', shift: 0 },
  ],
  84: [
    { name: 'Fase L3 Baixa Tensão', shift: 12 },
    { name: 'Fase L3 Alta Tensão', shift: 8 },
    { name: 'Rotação Fase Ger.', shift: 4 },
    { name: 'Rotação Fase Rede', shift: 0 },
  ],
  85: [
    { name: 'Baixa Carga', shift: 12 },
    { name: 'Correia Quebrada', shift: 8 },
    { name: 'Circ. Combustível Aberto', shift: 4 },
    { name: 'Alta Pressão Óleo Detc.', shift: 0 },
  ],
};


function decodeAlarms(startAddress, regs) {
  logReg76IfPresent(startAddress, regs);
  const activeAlarms = [];
  let syntheticCode = 0;
  let isStartFailure = false;

  for (let i = 0; i < regs.length; i++) {
    const addr = startAddress + i;
    const val = u16(regs, i);
    if (val === 0) continue;

    const defs = ALARM_DEFS_420[addr];
    if (!defs) continue;

    for (const def of defs) {
      const nibble = (val >> def.shift) & 0x0f;
      // DEIF: 0=off, 1=aviso, 2=desarme, 3=parada — 0xF = sem ECU/dado inválido (não é alarme)
      if (nibble === 2 || nibble === 3) {
        let severityText = '';
        if (nibble === 2) severityText = '(Desarme Elétrico)';
        if (nibble === 3) severityText = '(Parada)';

        activeAlarms.push(`${def.name} ${severityText}`.trim());
        syntheticCode += (addr * 100) + def.shift + nibble;

        if (addr === 73 && def.shift === 4) {
          isStartFailure = true;
        }
      }
    }
  }

  console.log(`[PARSER-420] Alarms: code=${activeAlarms.length > 0 ? syntheticCode : 0} -> "${activeAlarms.length > 0 ? activeAlarms.join(' | ') : 'Normal (Sem Alarme)'}"`);

  return {
    block: 'ALARM_65_76',
    alarmCode: activeAlarms.length > 0 ? syntheticCode : 0,
    alarmMessage: activeAlarms.length > 0 ? activeAlarms.join(' | ') : 'Normal (Sem Alarme)',
    startFailure: isStartFailure,
  };
}

function logReg76IfPresent(startAddress, regs) {
  if (startAddress !== 72) return;
  const idx = 76 - startAddress;
  if (idx >= 0 && idx < regs.length) {
    const v = u16(regs, idx);
    if (v !== 0) console.log(`[PARSER-420] Reg76=0x${v.toString(16).toUpperCase()} (ECU/MIL field — 0xF=não disponível)`);
  }
}

export function decodeSgc420ByBlock(slaveId, fn, startAddress, regs) {
  const result = { slaveId, fn, startAddress };

  // Reg 89-91 combinado (modem pode agrupar)
  if (startAddress === 89 && regs.length >= 3) {
    const rawInputs = u16(regs, 0);
    const rawMode = u16(regs, 2);
    const status = decodeReg91Status(rawMode);

    return {
      block: 'STATUS_COMBINED_77_78',
      reg77_hex: rawInputs.toString(16).toUpperCase(),
      reg78_hex: rawMode.toString(16).toUpperCase(),
      ...status,
      ...result,
    };
  }

  // Reg 89: entrada digital A (SGC 420 não expõe feedback de chaves aqui como o SGC 120)
  if (startAddress === 89 && regs.length >= 1) {
    const rawInputs = u16(regs, 0);

    return {
      block: 'STATUS_INPUTS_89',
      reg77_hex: rawInputs.toString(16).toUpperCase(),
      digitalInputA: (rawInputs & 0x8000) !== 0,
      ...result,
    };
  }

  if (startAddress === 91 && regs.length >= 1) {
    const rawMode = u16(regs, 0);
    const status = decodeReg91Status(rawMode);

    console.log(`[PARSER-420] Reg91=0x${rawMode.toString(16)} dgOp=${status.dgOpMode} mains=${status.loadOnMains} dg=${status.loadOnDg} -> ${status.opMode}`);

    return {
      block: 'STATUS_MODE_91',
      reg78_hex: rawMode.toString(16).toUpperCase(),
      reg91_raw: rawMode,
      ...status,
      ...result,
    };
  }

  if (startAddress === 61 && regs.length >= 2) {
    const engHrs = u16(regs, 0);
    const engMin = u16(regs, 1);
    const totalHours = parseFloat((engHrs + engMin / 60).toFixed(2));

    console.log(`[PARSER-420] RunHours Reg61=${engHrs}h Reg62=${engMin}m -> ${totalHours}h`);

    return {
      block: 'RUNHOURS_60',
      runHours: engHrs,
      runMinutes: engMin,
      runHoursTotal: engHrs,
      totalHours,
      ...result,
    };
  }

  // Tensões gerador — freq B com escala 0.01 no SGC 420
  if (startAddress === 1 && regs.length >= 9) {
    return {
      block: 'GEN_VOLT_FREQ_1_9',
      l1n_v: scale01(u16(regs, 0) * 0.1),
      l2n_v: scale01(u16(regs, 1) * 0.1),
      l3n_v: scale01(u16(regs, 2) * 0.1),
      l12_v: scale01(u16(regs, 3) * 0.1),
      l23_v: scale01(u16(regs, 4) * 0.1),
      l31_v: scale01(u16(regs, 5) * 0.1),
      freq_r_hz: scale01(u16(regs, 6) * 0.1),
      freq_y_hz: scale01(u16(regs, 7) * 0.1),
      freq_b_hz: scale01(u16(regs, 8) * 0.01),
      ...result,
    };
  }

  // Motor 51-58 — escalas SGC 420
  // Nota: regs 52/56 vêm do ECU em décimos (391 → 39,1 °C; 276 → 27,6 V)
  if (startAddress === 51 && regs.length >= 8) {
    return {
      block: 'ENGINE_51_59',
      oilPressure_bar: scale01(u16(regs, 0) * 0.1),
      coolantTemp_c: scale01(u16(regs, 1) * 0.1),
      fuelLevel_pct: decodeFuelLevelPct(u16(regs, 2)),
      fuelLiters_l: scale01(u16(regs, 3) * 0.1),
      chargeAltVoltage_v: scale01(u16(regs, 4) * 0.1),
      batteryVoltage_v: scale01(u16(regs, 5) * 0.1),
      rpm: u16(regs, 6),
      starts: u16(regs, 7),
      ...result,
    };
  }

  // Rede 14-22
  if (startAddress === 14 && regs.length >= 7) {
    return {
      block: 'MAINS_14',
      l1n_v: scale01(u16(regs, 0) * 0.1),
      l2n_v: scale01(u16(regs, 1) * 0.1),
      l3n_v: scale01(u16(regs, 2) * 0.1),
      l1l2_v: scale01(u16(regs, 3) * 0.1),
      l2l3_v: scale01(u16(regs, 4) * 0.1),
      l3l1_v: scale01(u16(regs, 5) * 0.1),
      freq_r_hz: scale01(u16(regs, 6) * 0.1),
      ...result,
    };
  }

  // Corrente de carga 23-25
  if (startAddress === 23 && regs.length >= 3) {
    const c1 = scale01(u16(regs, 0) * 0.1);
    const c2 = scale01(u16(regs, 1) * 0.1);
    const c3 = scale01(u16(regs, 2) * 0.1);

    // Raw log so we can confirm the controller actually returns load current
    // when there is load (regs are "Load L1/L2/L3 current" per the DEIF table).
    console.log(`[PARSER-420] Load current 23-25: L1=${c1}A L2=${c2}A L3=${c3}A (raw ${u16(regs,0)},${u16(regs,1)},${u16(regs,2)})`);

    return {
      block: 'LOAD_CURRENT_23',
      loadCurr_l1: c1,
      loadCurr_l2: c2,
      loadCurr_l3: c3,
      reg23: u16(regs, 0),
      reg24: u16(regs, 1),
      ...result,
    };
  }

  // Potência 26-30: watts por fase (0.1 kW), total (0.1 kW), % carga (0.1)
  if (startAddress === 26 && regs.length >= 5) {
    const pL1 = scale01(u16(regs, 0) * 0.1);
    const pL2 = scale01(u16(regs, 1) * 0.1);
    const pL3 = scale01(u16(regs, 2) * 0.1);
    const phaseSum = parseFloat((pL1 + pL2 + pL3).toFixed(1));
    const pTotal = phaseSum;
    const loadPct = scale01(u16(regs, 4) * 0.1);

    console.log(`[PARSER-420] Power 26-30: L1=${pL1} L2=${pL2} L3=${pL3} Total=${pTotal}kW Load=${loadPct}% (Reg29 raw=${u16(regs, 3)})`);

    return {
      block: 'ACTIVE_POWER_29_31',
      activePowerL1: pL1,
      activePowerL2: pL2,
      activePowerL3: pL3,
      activePowerTotal: pTotal,
      engineLoad: loadPct,
      ...result,
    };
  }

  // Alarmes 72-85
  if (startAddress === 72 && regs.length >= 1) {
    return decodeAlarms(startAddress, regs);
  }

  return {
    block: 'UNKNOWN',
    startAddress,
    registers: regs,
    ...result,
  };
}

export function decodeSgc420Payload(payload) {
  const reqs = payload?.modbusRequest ?? [];
  const resps = payload?.modbusResponse ?? [];
  const out = [];

  // Cache parcial para combinar Reg 89 + Reg 91 quando chegam separados
  let pendingInputs = null;

  for (let i = 0; i < Math.max(reqs.length, resps.length); i++) {
    const reqHex = reqs[i];
    const respHex = resps[i];
    if (!reqHex) continue;

    const req = parseRtuRequestHex(reqHex);

    if (!respHex) {
      out.push({ request: req, ok: false, error: 'NO_RESPONSE' });
      continue;
    }

    const resp = parseRtuResponseHex(respHex);

    if (resp.isException) {
      out.push({
        request: req,
        response: resp,
        ok: false,
        error: `MODBUS_EXCEPTION_${resp.exceptionCode}`,
      });
      continue;
    }

    let decoded = decodeSgc420ByBlock(req.slaveId, req.fn, req.startAddress, resp.registers);

    // Mescla entradas (89) + modo (91) em bloco compatível com o pipeline existente
    if (decoded.block === 'STATUS_INPUTS_89') {
      pendingInputs = decoded;
      out.push({ request: req, response: resp, decoded, ok: true });
      continue;
    }

    if (decoded.block === 'STATUS_MODE_91' && pendingInputs) {
      decoded = {
        block: 'STATUS_COMBINED_77_78',
        reg77_hex: pendingInputs.reg77_hex,
        reg78_hex: decoded.reg78_hex,
        opMode: decoded.opMode,
        dgOpMode: decoded.dgOpMode,
        loadOnMains: decoded.loadOnMains,
        loadOnDg: decoded.loadOnDg,
      };
      pendingInputs = null;
    } else if (decoded.block === 'STATUS_MODE_91') {
      decoded = {
        block: 'STATUS_COMBINED_77_78',
        reg77_hex: '0',
        reg78_hex: decoded.reg78_hex,
        opMode: decoded.opMode,
        dgOpMode: decoded.dgOpMode,
        loadOnMains: decoded.loadOnMains,
        loadOnDg: decoded.loadOnDg,
      };
    }

    out.push({ request: req, response: resp, decoded, ok: true });
  }

  return out;
}
