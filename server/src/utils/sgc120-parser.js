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
    quantity: (b[4] << 8) | b[5],
  };
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

export function decodeSgc120ByBlock(startAddress, regs) {
  // Aqui você adiciona os blocos que você usa.
  // O startAddress precisa bater com a requisição.

  let result = {};

  // Check for Run Hours (Reg 22 - 32bit) inside this block?
  // 22 is Running Hours (Int32/Uint32).
  const idx22 = 22 - startAddress;
  if (idx22 >= 0 && idx22 + 1 < regs.length) {
    // Found Run Hours candidates
    const rhUpper = u16(regs, idx22 + 1); // Order depends on Little/Big Endian. DEIF usually Little?
    // Actually Modbus Standard: Registers are Big Endian. But 32-bit values can be Hi-Low or Low-Hi words.
    // SGC 120 manual usually says. Let's try Hi-Low (Big Endian words).
    const rhLower = u16(regs, idx22);
    // Wait, usually it is (Hi << 16) | Low.
    // Let's assume (Reg22 << 16) | Reg23 ? Or Reg23 << 16 | Reg22?
    // Standard Modbus is often Big Endian Words order too.
    // Let's try default: 
    const val32 = (u16(regs, idx22) << 16) | u16(regs, idx22 + 1);

    // If the value looks crazy, maybe swap. But 0 is 0.
    result.runHours = val32;
  }

  // Bloco 1–9 (9 regs): Tensões + freq (conforme seu comando 0001 qty 0009)
  if (startAddress === 1 && regs.length >= 9) {
    // Ajuste os nomes conforme a tabela do seu XLSX (algumas tabelas usam ordem levemente diferente).
    return {
      block: "GEN_VOLT_FREQ_1_9",
      l1n_v: u16(regs, 0),
      l2n_v: u16(regs, 1),
      l3n_v: u16(regs, 2),
      l12_v: u16(regs, 3), // Adicionado: Tensão Fase-Fase L1-L2
      l23_v: u16(regs, 4), // Adicionado: Tensão Fase-Fase L2-L3
      l31_v: u16(regs, 5), // Adicionado: Tensão Fase-Fase L3-L1
      freq_r_hz: scale01(u16(regs, 6) * 0.1),
      freq_y_hz: scale01(u16(regs, 7) * 0.1),
      freq_b_hz: scale01(u16(regs, 8) * 0.1),
      ...result
    };
  }

  // Bloco 51–59 (9 regs): Motor / bateria etc (seu comando 0x0033 qty 9)
  if (startAddress === 51 && regs.length >= 9) {
    return {
      block: "ENGINE_51_59",
      oilPressure_bar: scale01(u16(regs, 0) * 0.1),
      coolantTemp_c: scale01(s16(regs, 1) * 0.1), // signed
      fuelLevel_pct: u16(regs, 2),
      fuelLiters_l: scale01(u16(regs, 3) * 0.1),
      chargeAltVoltage_v: scale01(u16(regs, 4) * 0.1),
      batteryVoltage_v: scale01(u16(regs, 5) * 0.1),
      rpm: u16(regs, 6),
      starts: u16(regs, 7),
      trips: u16(regs, 8),
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

    const decoded = decodeSgc120ByBlock(req.startAddress, resp.registers);

    out.push({
      request: req,
      response: resp,
      decoded,
      ok: true,
    });
  }

  return out;
}
