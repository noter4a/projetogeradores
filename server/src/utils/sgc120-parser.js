// Fixed by Agent - Force Update
// sgc120-parser.js
// Parser SGC-120 (Modbus RTU over MQTT)
// - Decode de blocos comuns: 1-9 (tensões/frequência), 51-59 (motor/bateria/etc)

export function hexToBuf(hex) {
  if (!hex || typeof hex !== "string") return null;
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0) throw new Error(`HEX inválido (tamanho ímpar): ${hex}`);
  return Buffer.from(clean, "hex");
}

// (Opcional) CRC16 Modbus para validar frames
export function crc16Modbus(buf) {
  let crc = 0xffff;
  for (let pos = 0; pos < buf.length; pos++) {
    crc ^= buf[pos];
    for (let i = 0; i < 8; i++) {
      const lsb = crc & 0x0001;
      crc >>= 1;
      if (lsb) crc ^= 0xA001;
    }
  }
  return crc; // uint16
}

export function verifyCrcRtu(frameBuf) {
  if (!frameBuf || frameBuf.length < 5) return false;
  const data = frameBuf.subarray(0, frameBuf.length - 2);
  const crcLo = frameBuf[frameBuf.length - 2];
  const crcHi = frameBuf[frameBuf.length - 1];
  const expected = (crcHi << 8) | crcLo; // note: frame stores lo,hi; here we read back as uint16
  const got = crc16Modbus(data);
  return got === expected;
}

export function parseRtuRequestHex(reqHex) {
  // Request RTU: [slave][fn][startHi][startLo][qtyHi][qtyLo][crcLo][crcHi]
  const b = hexToBuf(reqHex);
  if (!b || b.length < 8) throw new Error(`Request RTU curta: ${reqHex}`);
  // if you want: verifyCrcRtu(b)
  return {
    slaveId: b[0],
    fn: b[1],
    startAddress: (b[2] << 8) | b[3],
    startAddress: (b[2] << 8) | b[3],
    quantity: (b[4] << 8) | b[5],
  };
}

/**
 * Creates a Modbus RTU Read Request (Function 03)
 * Returns a BUFFER (Raw Bytes)
 */
export function createModbusReadRequest(slaveId, startAddress, quantity) {
  const buf = Buffer.alloc(8);
  buf.writeUInt8(slaveId, 0);
  buf.writeUInt8(3, 1); // Function 03 (Read Holding Registers)
  buf.writeUInt16BE(startAddress, 2);
  buf.writeUInt16BE(quantity, 4);

  // Calculate CRC
  const crc = crc16Modbus(buf.subarray(0, 6));

  // Modbus RTU uses Little Endian for CRC (Low Byte, High Byte)
  buf.writeUInt16LE(crc, 6);

  return buf;
}

export function parseRtuResponseHex(respHex) {
  // Response RTU (fn 03/04 normal): [slave][fn][byteCount][data...][crcLo][crcHi]
  const b = hexToBuf(respHex);
  if (!b || b.length < 5) throw new Error(`Response RTU curta: ${respHex}`);

  const slaveId = b[0];
  const fn = b[1];

  // Exception response: [slave][fn|0x80][exceptionCode][crcLo][crcHi]
  if ((fn & 0x80) === 0x80) {
    const exceptionCode = b[2];
    return { slaveId, fn, isException: true, exceptionCode, raw: respHex, crcOk: verifyCrcRtu(b) };
  }

  const byteCount = b[2];
  const dataStart = 3;
  const dataEnd = dataStart + byteCount;
  if (dataEnd + 2 > b.length) throw new Error(`Response RTU inconsistente (byteCount): ${respHex}`);

  const data = b.subarray(dataStart, dataEnd);

  // registers are big-endian 16-bit values
  const registers = [];
  for (let i = 0; i < data.length; i += 2) {
    registers.push((data[i] << 8) | data[i + 1]);
  }

  return {
    slaveId,
    fn,
    byteCount,
    registers,
    raw: respHex,
    crcOk: verifyCrcRtu(b),
  };
}

// helpers SGC-120
const u16 = (regs, i) => (regs[i] ?? 0);
const s16 = (regs, i) => {
  const v = u16(regs, i);
  return v & 0x8000 ? v - 0x10000 : v;
};
const scale01 = (x) => Math.round(x * 10) / 10;

export function decodeSgc120ByBlock(slaveId, fn, startAddress, regs) {
  // Aqui você adiciona os blocos que você usa.
  // O startAddress precisa bater com a requisição.

  // LOG GENÉRICO PARA DEBUJAR TUDO QUE CHEGA
  console.log(`[DEBUG-PARSER] Rx Slave: ${slaveId}, Fn: ${fn}, Addr: ${startAddress}, Len: ${regs.length}`);

  let result = {};

  // Block 60: Run Hours (Reg 60=Hours, Reg 62=Minutes)
  if (startAddress === 60 && regs.length >= 3) {
    const hours = u16(regs, 0);   // Reg 60
    const minutes = u16(regs, 2); // Reg 62 (Skipping 61)

    // Calculate decimal for easier display/DB
    const decimal = hours + (minutes / 60.0);

    return {
      block: "RUNHOURS_60",
      runHours: hours,
      runMinutes: minutes,
      totalHours: Number(decimal.toFixed(2))
    };
  }

  // Bloco 66 (1 reg): Alarm Code
  // User Request: 0x0131 (305 decimal) = "Falha Partida" (Start Failure)
  if (startAddress === 66 && regs.length === 1) {
    const code = u16(regs, 0);

    // Alarm Lookup Table (Partial - Based on observation and SGC conventions)
    const ALARM_MESSAGES = {
      0: "Normal (Sem Alarme)",
      2: "Baixa Pressão de Óleo",
      3: "Alta Temperatura do Motor",
      6: "Sobrevelocidade",
      8: "Subvelocidade",
      305: "Falha na Partida",
      32: "Parada de Emergência", // (Likely, check if consistent)
    };

    const msg = ALARM_MESSAGES[code] || `Alarme Código ${code}`;
    const isStartFailure = (code === 305 || code === 0x0131);

    console.log(`[PARSER] Alarm Code (66): ${code} -> "${msg}"`);

    return {
      block: "ALARM_66",
      alarmCode: code,
      alarmMessage: msg,
      startFailure: isStartFailure
    };
  }

  // Bloco 29 (3 reg): Active Power L1, L2, L3
  // Request: 01 03 00 1D 00 03 (Reg 29, 3 qty)
  // Hypothesis: 29=L1, 30=L2, 31=L3. Scale 0.1
  if (startAddress === 29 && regs.length >= 3) {
    const r29 = u16(regs, 0);
    const r30 = u16(regs, 1);
    const r31 = u16(regs, 2);

    const pL1 = scale01(r29 * 0.1);
    const pL2 = scale01(r30 * 0.1);
    const pL3 = scale01(r31 * 0.1);
    const pTotal = parseFloat((pL1 + pL2 + pL3).toFixed(1));

    console.log(`[PARSER] Power Block (29-31): L1=${r29}(${pL1}kW) L2=${r30}(${pL2}kW) L3=${r31}(${pL3}kW) -> Total=${pTotal}kW`);

    return {
      block: "ACTIVE_POWER_29_31",
      activePowerL1: pL1,
      activePowerL2: pL2,
      activePowerL3: pL3,
      activePowerTotal: pTotal
    };
  }

  // Bloco 0 (1 reg): Operation Mode (Legacy/Alternative?)
  // Keeping this for now, but Reg 78 seems to be the real one.
  if (startAddress === 0 && regs.length >= 1) {
    const val = u16(regs, 0);
    // ... (existing logic)
    return {
      block: "MODE_0",
      reg0: val
    };
  }

  // STATUS REGISTER 32 (0x20) - Breaker Status (Debug Only)
  // Request: 01030020000185C0 -> Resp: 0000 (Open) - FAILED TO WORK
  if (startAddress === 32 && regs.length >= 1) {
    const raw = u16(regs, 0);
    // console.log(`[PARSER] Reg 32: 0x${raw.toString(16).toUpperCase()}`);
    return {
      block: "STATUS_32",
      reg32_hex: raw.toString(16).toUpperCase(),
      // Removed authoritative status because it returns 0 incorrectly.
    };
  }

  // STATUS REGISTER 11000 & 11001 (REMOVED)
  /*
  if (startAddress === 11000 && regs.length >= 1) {
    const val = u16(regs, 0);
    return { block: "MAINS_BREAKER_11000", mainsBreakerClosed: val === 1 };
  }
  if (startAddress === 11001 && regs.length >= 1) {
    const val = u16(regs, 0);
    return { block: "GEN_BREAKER_11001", genBreakerClosed: val === 1 };
  }
  */

  // STATUS REGISTER 77-78 (Digital Inputs + Mode)
  // Block 16: Status Discovery
  if (startAddress === 16 && regs.length >= 1) {
    const raw = u16(regs, 0);
    console.log(`[DISCOVERY] Reg 16 Value: ${raw} (0x${raw.toString(16).toUpperCase()})`);
    return { block: "STATUS_16", val: raw };
  }

  // Optimization: Reading 2 registers at once to save polling slots.
  // Reg 77 (Offset 0): Digital Inputs
  // Reg 78 (Offset 1): Operation Mode
  if (startAddress === 77 && regs.length >= 2) {
    const rawInputs = u16(regs, 0); // Reg 77
    const rawMode = u16(regs, 1); // Reg 78 (Offset 1) - FIXED from 2

    // Process Inputs (User Confirmed: A=Gen, B=Mains)
    // Bit 15 = Input A (Gen Breaker). Logic: Positive (1=Closed, 0=Open)
    // Bit 14 = Input B (Mains Breaker). Logic: POSITIVE (1=Closed, 0=Open) - Confirmed: 0x4011(Closed) vs 0x0013(Open)
    const inputA = (rawInputs & 0x8000) !== 0;
    const inputB = (rawInputs & 0x4000) !== 0;

    // Process Mode (Reg 78)
    const highByte = rawMode >> 8;
    // const lowByte  = rawMode & 0xFF; // Not used anymore for breakers

    let mode = 'UNKNOWN';
    if (highByte === 100) mode = 'MANUAL';      // 0x64
    else if (highByte === 96) mode = 'MANUAL';  // 0x60
    else if (highByte === 0) mode = 'INHIBITED';   // 0x00 (Restored to INHIBITED)
    else if (highByte === 32) mode = 'MANUAL';    // 0x20 (Remapped from AUTO -> MANUAL per User Feedback)
    else if (highByte === 4 || highByte === 108) mode = 'AUTO'; // 0x04 or 0x6C
    else if (highByte === 5) mode = 'TEST';

    console.log(`[STATUS-DEBUG] Reg77(Inputs): 0x${rawInputs.toString(16)} | Reg78(Mode): 0x${rawMode.toString(16)} | Mains(InB): ${inputB} | Gen(InA): ${inputA} | Mode: ${mode}`);

    return {
      block: "STATUS_COMBINED_77_78",
      reg77_hex: rawInputs.toString(16).toUpperCase(),
      reg78_hex: rawMode.toString(16).toUpperCase(),
      opMode: mode,
      mainsBreakerClosed: inputB,
      genBreakerClosed: inputA
    };
  }

  // FALLBACK: STATUS REGISTER 78 (Legacy/Old Config Support)
  // If the modem rejects the new "Reg 77 (Len 2)" config and keeps sending "Reg 78 (Len 1)",
  // we must catch it here to at least show the Operation Mode.
  if (startAddress === 78 && regs.length >= 1) {
    const raw = u16(regs, 0);
    const highByte = raw >> 8; // Op Mode

    let mode = 'UNKNOWN';
    if (highByte === 100) mode = 'MANUAL';      // 0x64
    else if (highByte === 96) mode = 'MANUAL';  // 0x60
    else if (highByte === 0) mode = 'MANUAL';   // 0x00 (Remapped from INHIBITED per user request)
    else if (highByte === 4 || highByte === 108) mode = 'AUTO'; // 0x04 or 0x6C
    else if (highByte === 5) mode = 'TEST';

    // FALLBACK BREAKER LOGIC (Since Modem enforces Reg 78)
    // Update based on user feedback:
    // Log showed 0x6080 (Bit 7 ON) -> User said Mains is OPEN.
    // Hypothesis: Mains is NEGATIVE LOGIC (1=Open, 0=Closed) in this register.
    const mainsClosed = (raw & 0x80) === 0; // Bit 7 (0=Closed)
    const genClosed = (raw & 0x10) !== 0; // Bit 4 (1=Closed)

    console.log(`[STATUS-DEBUG-FALLBACK] Reg78 Valid! Mode: ${mode} | Mains(Bit7): ${mainsClosed} | Gen(Bit4): ${genClosed}`);

    return {
      block: "STATUS_78",
      opMode: mode,
      reg78_hex: raw.toString(16).toUpperCase(),
      mainsBreakerClosed: mainsClosed,
      genBreakerClosed: genClosed
    };
  }



  // DEBUG PROBE: Address 16
  if (startAddress === 16 && regs.length >= 1) {
    const val = u16(regs, 0);
    console.log(`[PARSER] Probe Reg 16 (Status?): ${val} (Dec)`);
    // Ideally we would map this if it turns out to be better than Reg 0.
    return {
      block: "PROBE_16",
      reg16: val
    };
  }

  // Bloco 1–9 (9 regs): Tensões + freq (conforme seu comando 0001 qty 0009)
  if (startAddress === 1 && regs.length >= 9) {
    // Ajuste os nomes conforme a tabela do seu XLSX (algumas tabelas usam ordem levemente diferente).
    return {
      block: "GEN_VOLT_FREQ_1_9",
      l1n_v: scale01(u16(regs, 0) * 0.1),
      l2n_v: scale01(u16(regs, 1) * 0.1),
      l3n_v: scale01(u16(regs, 2) * 0.1),
      l12_v: scale01(u16(regs, 3) * 0.1), // Tensão Fase-Fase L1-L2 Scaled
      l23_v: scale01(u16(regs, 4) * 0.1), // Tensão Fase-Fase L2-L3 Scaled
      l31_v: scale01(u16(regs, 5) * 0.1), // Tensão Fase-Fase L3-L1 Scaled
      freq_r_hz: scale01(u16(regs, 6) * 0.1),
      freq_y_hz: scale01(u16(regs, 7) * 0.1),
      freq_b_hz: scale01(u16(regs, 8) * 0.1),
      ...result
    };
  }

  // Bloco 51–59 (9 regs) ... OR 51-61 (11 regs) for RunHours
  if (startAddress === 51) {
    console.log(`[DEBUG] Received BLOCK 51. Registers count: ${regs.length}`); // PROVA REAL
  }
  if (startAddress === 51 && regs.length >= 9) {
    // Check if we have registers 60 and 61 (indices 9 and 10)
    if (regs.length >= 11) {
      // Registers 60 and 61 are usually Run Hours (Unsigned 32-bit)
      // Index 9 = Reg 60, Index 10 = Reg 61
      const rhLo = u16(regs, 9);
      const rhHi = u16(regs, 10);
      const val32 = (rhHi << 16) | rhLo; // Assuming Little Endian Words or Big Endian? Standard strict is Big.
      // Let's try standard (60=Hi, 61=Lo) first? User image says 60-61.
      // Usually Modbus is Big Endian. so 60 is Hi, 61 is Lo.
      // But DEIF SGC often follows Little Endian for 32-bit words sometimes.
      // Let's stick to (Hi << 16) | Lo logic using the order they appear.
      // If 60 is MSW and 61 is LSW:
      const val32config1 = (u16(regs, 9) << 16) | u16(regs, 10);
      result.runHours = val32config1;
      console.log(`[PARSER] Block 51 detected RunHours (Reg 60/61): ${val32config1}h (Hi:${u16(regs, 9)} Lo:${u16(regs, 10)})`);
    }

    return {
      block: "ENGINE_51_59",
      oilPressure_bar: scale01(u16(regs, 0) * 0.1),
      coolantTemp_c: scale01(s16(regs, 1) * 0.1), // signed
      fuelLevel_pct: scale01(u16(regs, 2) * 0.1),
      fuelLiters_l: scale01(u16(regs, 3) * 0.1),
      chargeAltVoltage_v: scale01(u16(regs, 4) * 0.1),
      batteryVoltage_v: scale01(u16(regs, 5) * 0.1),
      rpm: u16(regs, 6),
      starts: u16(regs, 7),
      trips: u16(regs, 8),
      ...result
    };
  }

  // BLOCK: MAINS VOLTAGES (14 - 22) - NEW CORRECT ADDRESS
  if (startAddress === 14 && regs.length >= 7) { // Need at least 7 registers for the specified fields
    return {
      block: 'MAINS_14',
      // Phase-Neutral (Regs 14, 15, 16 -> Indices 0, 1, 2)
      l1n_v: scale01(u16(regs, 0) * 0.1),
      l2n_v: scale01(u16(regs, 1) * 0.1),
      l3n_v: scale01(u16(regs, 2) * 0.1),

      // Phase-Phase (Regs 17, 18, 19 -> Indices 3, 4, 5)
      l1l2_v: scale01(u16(regs, 3) * 0.1),
      l2l3_v: scale01(u16(regs, 4) * 0.1),
      l3l1_v: scale01(u16(regs, 5) * 0.1),

      // Frequency (Freq R)
      freq_r_hz: scale01(u16(regs, 6) * 0.1), // 20
      ...result
    };
  }

  // Bloco isolado do Horímetro (60)
  // Se recebermos apenas 2 regs (60/61 = Horas)
  if (startAddress === 60 && regs.length >= 2) {
    // FIX: Read as 32-bit Unsigned Integer
    // Reg 60 = High Word (MSW), Reg 61 = Low Word (LSW)
    const hi = u16(regs, 0);
    const lo = u16(regs, 1);
    const min = u16(regs, 2);
    const r3 = u16(regs, 3);
    const r4 = u16(regs, 4);
    const engHrs = (hi << 16) | lo;

    console.log(`[PARSER] Block 60 Raw: Reg60=${hi} Reg61=${lo} Reg62=${min} Reg63=${r3} Reg64=${r4}`);
    console.log(`[PARSER] Engine Hours Debug - Reg60(Hi): ${hi}, Reg61(Lo): ${lo} -> Total: ${engHrs}h, Min=${min}`);

    return {
      block: "RUNHOURS_60",
      runHours: engHrs,
      runHoursTotal: engHrs,
      ...result
    };
  }

  // Bloco isolado de Minutos (62)
  if (startAddress === 62 && regs.length >= 1) {
    const engMin = u16(regs, 0);
    console.log(`[PARSER] Engine Minutes (62): ${engMin}m`);
    return {
      block: "RUNMINUTES_62",
      runMinutes: engMin,
      ...result
    };
  }

  // Bloco 29–37 (9 regs): Mains Voltages (Standard SGC 120/420)
  if (startAddress === 29 && regs.length >= 9) {
    return {
      block: "MAINS_29",
      l1n_v: u16(regs, 0),
      l2n_v: u16(regs, 1),
      l3n_v: u16(regs, 2),
      l12_v: u16(regs, 3),
      l23_v: u16(regs, 4),
      l31_v: u16(regs, 5),
      freq_r_hz: scale01(u16(regs, 6) * 0.1), // Mains Freq
      freq_y_hz: scale01(u16(regs, 7) * 0.1),
      freq_b_hz: scale01(u16(regs, 8) * 0.1),
      ...result
    };
  }

  // Bloco 504 (Variant AGC-150 / Alternate Map)
  // Check modbus_maps.json: 504=L1-N, 505=L2-N, 506=L3-N ... 507=Freq L1
  if (startAddress === 504 && regs.length >= 4) {
    return {
      block: "MAINS_504",
      l1n_v: u16(regs, 0),
      l2n_v: u16(regs, 1),
      l3n_v: u16(regs, 2),
      freq_r_hz: scale01(u16(regs, 3) * 0.1), // Usually Freq is next
      ...result
    };
  }

  // Bloco 10 (3 regs): Generator Currents (L1, L2, L3)
  // Baseado na resposta do usuário: 010306010200AC0056...
  // 0102 = 258, 00AC = 172, 0056 = 86.
  // Assuming 1 decimal place (25.8A, 17.2A, 8.6A) or integer.
  // Usually currents are 1 decimal or integer depending on CT ratio.
  // Standard DEIF SGC 120 often uses integer currents, but let's check values.
  // Validating: If user has 258A load, that's high. If 25.8A, that's moderate.
  // Let's assume integer for now OR scaled. I'll use raw initially or scale01 if commonly needed.
  // Actually, standard is often 1 Amp = 1 unit? Or 0.1?
  // Let's try scaled * 0.1 since voltages are 0.1.
  if (startAddress === 10 && regs.length >= 3) {
    const c1 = scale01(u16(regs, 0) * 0.1);
    const c2 = scale01(u16(regs, 1) * 0.1);
    const c3 = scale01(u16(regs, 2) * 0.1);
    console.log(`[PARSER] Currents (10): L1=${c1}A, L2=${c2}A, L3=${c3}A (Raw: ${u16(regs, 0)}, ${u16(regs, 1)}, ${u16(regs, 2)})`);
    return {
      block: "CURRENT_10",
      curr_l1: c1,
      curr_l2: c2,
      curr_l3: c3
    };
  }

  // Bloco 116 (3 regs): Mains Currents Probe
  if (startAddress === 116 && regs.length >= 3) {
    const mc1 = scale01(u16(regs, 0) * 0.1);
    const mc2 = scale01(u16(regs, 1) * 0.1);
    const mc3 = scale01(u16(regs, 2) * 0.1);
    console.log(`[PARSER] MAINS CURRENT (116): L1=${mc1}A, L2=${mc2}A, L3=${mc3}A`);
    return {
      block: "MAINS_CURRENT_116",
      mainsCurr_l1: mc1,
      mainsCurr_l2: mc2,
      mainsCurr_l3: mc3
    };
  }

  // Bloco 23 (3 regs): LOAD CURRENTS (L1, L2, L3)
  // User provided datasheet: 23=L1, 24=L2, 25=L3 (Scale 0.1)
  if (startAddress === 23 && regs.length >= 3) {
    const c1 = scale01(u16(regs, 0) * 0.1);
    const c2 = scale01(u16(regs, 1) * 0.1);
    const c3 = scale01(u16(regs, 2) * 0.1);

    // Legacy Breaker Logic (Restored & Corrected)
    // Reg 24 (Index 1) value 172 (0xAC = 1010 1100)
    // User trace: "Mains Closed" and Val=172 (Bit 2 is 1). So Bit 2 = Mains Closed.
    // User trace: "Gen Open" and Val=172 (Bit 1 is 0). So Bit 1 = Gen Closed.
    const val24 = u16(regs, 1);
    const mainsClosed = (val24 & 0x0004) !== 0; // Bit 2
    const genClosed = (val24 & 0x0002) !== 0;   // Bit 1

    console.log(`[PARSER] Currents (23): L1=${c1}A, L2=${c2}A, L3=${c3}A`);
    console.log(`[PARSER] Breaker Flags via Reg 24: Mains=${mainsClosed}, Gen=${genClosed} (Val: ${val24})`);

    return {
      block: "LOAD_CURRENT_23",
      loadCurr_l1: c1,
      loadCurr_l2: c2,
      loadCurr_l3: c3,
      mainsBreakerClosed: mainsClosed,
      genBreakerClosed: genClosed,
      reg23: u16(regs, 0),
      reg24: u16(regs, 1)
    };
  }

  // Bloco 30 (2 regs): Active Power (kW) - Requested by User
  if (startAddress === 30 && regs.length >= 2) {
    // 32-bit Value (High/Low or Low/High? Assuming High/Low based on typical modbus)
    // User response: 00 00 00 00 (Hex) -> 0
    const val32 = (u16(regs, 0) << 16) | u16(regs, 1);

    // Scale? Usually kW is integer or 0.1. User didn't specify.
    // If it's a generator, 100kW is 100. Let's try raw first.
    return {
      block: "POWER_30",
      activePower_kw: val32
    };
  }

  // Bloco 43 (2 regs): Apparent Energy (kVAh) - Requested by User
  if (startAddress === 43 && regs.length >= 2) {
    const val32 = (u16(regs, 0) << 16) | u16(regs, 1);
    const scaled = scale01(val32 * 0.1);
    console.log(`[PARSER] Apparent Energy (43): Raw=${val32}, Scaled=${scaled} kVAh`);
    return {
      block: "ENERGY_43",
      apparentEnergy_kvah: scaled
    };
  }

  // Bloco 66 (1 reg): Alarm Code
  if (startAddress === 66 && regs.length >= 1) {
    const code = u16(regs, 0);

    // Decode Bit-Packed Alarms (Nibbles)
    // Fail to Stop: Bits 0-3 (1/16 - 4/16)
    // Fail to Start: Bits 4-7 (5/16 - 8/16)
    // Emergency Stop: Bits 8-11 (9/16 - 12/16) -> Assumption based on pattern? Or just OverSpeed?
    // User image only confirmed Start/Stop.

    const failToStopStatus = code & 0x000F;
    const failToStartStatus = (code >> 4) & 0x000F;

    let message = "";

    // Status 3 usually means "Shutdown Alarm" (Active)
    if (failToStartStatus === 3 || failToStartStatus === 2) message = "Falha na Partida (Fail to Start)";
    else if (failToStopStatus === 3 || failToStopStatus === 2) message = "Falha na Parada (Fail to Stop)";
    else if (code > 0) message = `Alarme Genérico (Código: 0x${code.toString(16).toUpperCase()})`;

    return {
      block: "ALARM_66",
      alarmCode: code,
      alarmMessage: message,
      startFailure: (failToStartStatus === 3)
    };
  }

  // Se cair aqui, é um bloco que você ainda não mapeou
  return {
    block: "UNKNOWN",
    startAddress,
    registers: regs,
    ...result
  };
}

/**
 * Decodifica o payload que vem do modem:
 * {
 *   modbusRequest: ["...","..."],
 *   modbusResponse: ["...","..."]
 * }
 */
export function decodeSgc120Payload(payload) {
  const reqs = payload?.modbusRequest ?? [];
  const resps = payload?.modbusResponse ?? [];

  const out = [];

  for (let i = 0; i < Math.max(reqs.length, resps.length); i++) {
    const reqHex = reqs[i];
    const respHex = resps[i];

    if (!reqHex) continue;

    const req = parseRtuRequestHex(reqHex);

    // Quando resp vem "" (timeout), reporta isso
    if (!respHex) {
      out.push({
        request: req,
        ok: false,
        error: "NO_RESPONSE",
      });
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

    const decoded = decodeSgc120ByBlock(req.slaveId, req.fn, req.startAddress, resp.registers);

    out.push({
      request: req,
      response: resp,
      decoded,
      ok: true,
    });
  }

  return out;
}
