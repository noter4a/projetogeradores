// agc150-parser.js
// DEIF AGC 150 — Input registers (fn 04) + discrete inputs (fn 02)
// Based on agc-150-modbus-server-tables-4189341212-uk.xlsx (Rev V, SW 1.35.0)
//
// IMPORTANT: registers 501-519 share the same addresses for Mains / Generator / Bus A
// depending on controller application (GEN, MAINS, BTB). Default profile is "gen".

import { parseRtuRequestHex, parseRtuResponseHex, hexToBuf, verifyCrcRtu } from './sgc120-parser.js';

/** Poll sequence — fn 04 = input registers, fn 02 = discrete inputs */
export const AGC150_POLL_SEQUENCE = [
  { startAddress: 0, quantity: 32, fn: 2 },   // GB/MB, modes, running, mains failure (0-31)
  { startAddress: 501, quantity: 38, fn: 4 }, // Bus A AC block (501-538)
  { startAddress: 539, quantity: 13, fn: 4 }, // Bus B AC block (539-551)
  { startAddress: 554, quantity: 14, fn: 4 }, // Hours, alarms, starts, DC supply (554-567)
  { startAddress: 576, quantity: 45, fn: 4 }, // Engine measurements (576-620)
];

/** How Bus A / Bus B map to generator vs mains in the UI */
export const AGC150_BUS_PROFILES = {
  gen: { busA: 'generator', busB: 'mains' },
  btb: { busA: 'mains', busB: 'generator' },
  mains: { busA: 'mains', busB: 'generator' },
};

export function isAgc150Controller(controller) {
  const c = (controller || '').toLowerCase();
  return c === 'agc150' || c === 'agc-150' || c === 'deif150' || c === 'deif_agc150';
}

/** Discrete output coils (Modbus fn 05/15) — DEIF AGC 150 command flags */
export const AGC150_COILS = {
  REMOTE_START: 0,
  REMOTE_GB_ON: 1,
  REMOTE_GB_OFF: 2,
  REMOTE_STOP: 3,
  ALARM_ACK: 9,
  START_SYNC_MANUAL: 14,
  DELOAD_STOP_MANUAL: 15,
  MB_ON: 24,
  MB_OFF: 25,
  MANUAL_MODE: 28,
  AUTO_MODE: 29,
  TEST_MODE: 30,
};

export function resolveAgc150Profile(rawProfile) {
  const p = (rawProfile || 'gen').toLowerCase();
  if (p === 'auto') return 'gen';
  return AGC150_BUS_PROFILES[p] ? p : 'gen';
}

const u16 = (regs, i) => (regs[i] ?? 0);
const s16 = (regs, i) => {
  const v = u16(regs, i);
  return v & 0x8000 ? v - 0x10000 : v;
};
const s32 = (regs, i) => {
  const hi = u16(regs, i);
  const lo = u16(regs, i + 1);
  let v = (hi << 16) | lo;
  if (v & 0x80000000) v -= 0x100000000;
  return v;
};
const scale01 = (x) => Math.round(x * 10) / 10;
const scalePow10 = (raw, exp) => {
  const n = typeof raw === 'number' ? raw : s16Val(raw);
  if (exp > 0) return scale01(n / Math.pow(10, exp));
  return n;
};

/** Excel INT16s fields — signed; treat DEIF invalid/sentinel raw values as zero. */
function s16Val(raw) {
  const v = s16([raw], 0);
  const u = u16([raw], 0);
  if (u === 65535 || u >= 65000) return 0;
  return v;
}

function sanitizeAmps(raw) {
  const u = u16([raw], 0);
  // DEIF sends 0xFxxx when CT input is invalid / not wired
  if (u === 65535 || u >= 60000) return 0;
  const v = s16Val(raw);
  if (!Number.isFinite(v) || Math.abs(v) > 8000) return 0;
  return Math.abs(v);
}

function sanitizeKw(raw) {
  const u = u16([raw], 0);
  if (u === 65535 || u >= 65000) return 0;
  const v = s16Val(raw);
  if (!Number.isFinite(v) || Math.abs(v) > 50000) return 0;
  return v;
}

function regAt(startAddress, regs, addr) {
  const idx = addr - startAddress;
  if (idx < 0 || idx >= regs.length) return 0;
  return u16(regs, idx);
}

function regS16At(startAddress, regs, addr) {
  return s16Val(regAt(startAddress, regs, addr));
}

function busHasVoltage(m) {
  return Math.max(m.l1n_v, m.l2n_v, m.l3n_v, m.l1l2_v, m.l2l3_v, m.l3l1_v) > 50;
}

export function parseDiscreteInputResponseHex(respHex) {
  const b = hexToBuf(respHex);
  if (!b || b.length < 5) throw new Error(`Discrete response RTU curta: ${respHex}`);

  const slaveId = b[0];
  const fn = b[1];

  if ((fn & 0x80) === 0x80) {
    return { slaveId, fn, isException: true, exceptionCode: b[2], raw: respHex, crcOk: verifyCrcRtu(b) };
  }

  const byteCount = b[2];
  const data = b.subarray(3, 3 + byteCount);
  const bits = [];
  for (let i = 0; i < data.length; i++) {
    for (let bit = 0; bit < 8; bit++) {
      bits.push((data[i] >> bit) & 1);
    }
  }

  return { slaveId, fn, byteCount, bits, raw: respHex, crcOk: verifyCrcRtu(b) };
}

function decodeDiscreteStatus(startAddress, bits) {
  const bit = (addr) => (bits[addr - startAddress] ? 1 : 0);

  let opMode = null;
  if (bit(9)) opMode = 'AUTO';
  else if (bit(8)) opMode = 'MANUAL';
  else if (bit(10)) opMode = 'TEST';

  const gbOn = bit(0) === 1;
  const gbOff = bit(11) === 1;
  const mbOn = bit(1) === 1;
  const mbOff = bit(12) === 1;

  const statusWord = (
    (bit(9) << 9) | (bit(8) << 8) | (bit(10) << 10) | (bit(3) << 3) | (bit(0) << 0)
  );

  return {
    block: 'STATUS_COMBINED_77_78',
    reg77_hex: statusWord.toString(16).toUpperCase().padStart(4, '0'),
    reg78_hex: statusWord.toString(16).toUpperCase().padStart(4, '0'),
    opMode,
    running: bit(3) === 1,
    genVoltOk: bit(4) === 1,
    mainsFailure: bit(5) === 1,
    genBreakerClosed: gbOn && !gbOff ? true : (gbOff ? false : null),
    mainsBreakerClosed: mbOn && !mbOff ? true : (mbOff ? false : null),
    startAddress,
  };
}

/** Read AC measurements for Bus A (501) or Bus B (539). */
function readAcMeasurements(startAddress, regs, baseAddr) {
  const raw = (addr) => regAt(startAddress, regs, addr);
  const l1l2 = raw(baseAddr);
  const l2l3 = raw(baseAddr + 1);
  const l3l1 = raw(baseAddr + 2);
  const l1n = raw(baseAddr + 3);
  const l2n = raw(baseAddr + 4);
  const l3n = raw(baseAddr + 5);

  return {
    l1l2_v: l1l2,
    l2l3_v: l2l3,
    l3l1_v: l3l1,
    // When L-N is zero but L-L has value, derive approximate L-N (400V system)
    l1n_v: l1n > 50 ? l1n : (l1l2 > 50 ? Math.round(l1l2 / 1.732) : 0),
    l2n_v: l2n > 50 ? l2n : (l2l3 > 50 ? Math.round(l2l3 / 1.732) : 0),
    l3n_v: l3n > 50 ? l3n : (l3l1 > 50 ? Math.round(l3l1 / 1.732) : 0),
    freq_r_hz: scalePow10(raw(baseAddr + 6), 2),
    curr_l1: sanitizeAmps(raw(baseAddr + 12)),
    curr_l2: sanitizeAmps(raw(baseAddr + 13)),
    curr_l3: sanitizeAmps(raw(baseAddr + 14)),
    power_l1: sanitizeKw(raw(baseAddr + 15)),
    power_l2: sanitizeKw(raw(baseAddr + 16)),
    power_l3: sanitizeKw(raw(baseAddr + 17)),
    power_total: sanitizeKw(raw(baseAddr + 18)),
    reactive_total: sanitizeKw(raw(baseAddr + 22)),
    apparent_total: sanitizeKw(raw(baseAddr + 26)),
    power_factor: baseAddr === 501 ? scalePow10(raw(538), 2) : null,
    startAddress,
    baseAddr,
  };
}

function toGenBlock(m) {
  return {
    block: 'GEN_VOLT_FREQ_1_9',
    l1n_v: m.l1n_v,
    l2n_v: m.l2n_v,
    l3n_v: m.l3n_v,
    l12_v: m.l1l2_v,
    l23_v: m.l2l3_v,
    l31_v: m.l3l1_v,
    freq_r_hz: m.freq_r_hz,
    startAddress: m.startAddress,
  };
}

function toMainsBlock(m) {
  return {
    block: 'MAINS_14',
    l1n_v: m.l1n_v,
    l2n_v: m.l2n_v,
    l3n_v: m.l3n_v,
    l1l2_v: m.l1l2_v,
    l2l3_v: m.l2l3_v,
    l3l1_v: m.l3l1_v,
    freq_r_hz: m.freq_r_hz,
    startAddress: m.startAddress,
  };
}

function toCurrentBlock(m, busRole) {
  return {
    block: 'LOAD_CURRENT_23',
    busRole,
    loadCurr_l1: m.curr_l1,
    loadCurr_l2: m.curr_l2,
    loadCurr_l3: m.curr_l3,
    startAddress: m.startAddress,
  };
}

function toPowerBlock(m, busRole) {
  return {
    block: 'ACTIVE_POWER_29_31',
    busRole,
    activePowerL1: m.power_l1,
    activePowerL2: m.power_l2,
    activePowerL3: m.power_l3,
    activePowerTotal: m.power_total,
    reactivePowerTotal: m.reactive_total,
    apparentPowerTotal: m.apparent_total,
    powerFactor: m.power_factor,
    startAddress: m.startAddress,
  };
}

function decodeAcBlocks(profile, busAStart, busARegs, busBStart, busBRegs) {
  const roles = AGC150_BUS_PROFILES[profile] || AGC150_BUS_PROFILES.gen;
  const busA = busARegs?.length ? readAcMeasurements(busAStart, busARegs, 501) : null;
  const busB = busBRegs?.length ? readAcMeasurements(busBStart, busBRegs, 539) : null;

  const out = [];
  const assignBus = (measurements, role) => {
    if (!measurements || !busHasVoltage(measurements)) return;
    const busRole = role === 'generator' ? 'generator' : 'mains';
    if (role === 'generator') {
      out.push(toGenBlock(measurements));
    } else {
      out.push(toMainsBlock(measurements));
    }
    out.push(toCurrentBlock(measurements, busRole));
    out.push(toPowerBlock(measurements, busRole));
  };

  if (busA) assignBus(busA, roles.busA);
  if (busB) assignBus(busB, roles.busB);

  const hasGen = out.some(b => b.block === 'GEN_VOLT_FREQ_1_9');
  if (!hasGen && busB && busHasVoltage(busB)) {
    out.push(toGenBlock(busB));
    out.push(toCurrentBlock(busB, 'generator'));
    out.push(toPowerBlock(busB, 'generator'));
  }

  return out;
}

function decodeHoursAlarms(startAddress, regs) {
  const idx = (addr) => addr - startAddress;
  const hours = idx(554) >= 0 && idx(555) < regs.length ? s32(regs, idx(554)) : 0;
  const alarmCount = idx(558) >= 0 ? u16(regs, idx(558)) : 0;
  const unacked = idx(559) >= 0 ? u16(regs, idx(559)) : 0;
  const startAttempts = idx(566) >= 0 ? u16(regs, idx(566)) : 0;
  const dcSupply = idx(567) >= 0 ? scalePow10(u16(regs, idx(567)), 1) : 0;

  let alarmMessage = 'Normal (Sem Alarme)';
  if (alarmCount > 0) {
    alarmMessage = `${alarmCount} alarme(s) ativo(s) no AGC 150`;
    if (unacked > 0) alarmMessage += ` (${unacked} não reconhecido(s))`;
  }

  const blocks = [
    {
      block: 'RUNHOURS_60',
      runHours: hours,
      runMinutes: idx(561) >= 0 ? u16(regs, idx(561)) : 0,
      runHoursTotal: hours,
      totalHours: parseFloat(Math.max(0, hours).toFixed(2)),
      startAddress,
    },
    {
      block: 'ALARM_65_76',
      alarmCode: alarmCount > 0 ? 15000 + alarmCount : 0,
      alarmMessage,
      startFailure: alarmCount > 0 && startAttempts > 5,
      startAddress,
    },
  ];

  if (dcSupply > 0) {
    blocks.push({
      block: 'ENGINE_51_59',
      batteryVoltage_v: dcSupply,
      startAddress,
    });
  }

  return blocks;
}

function decodeEngineBlock(startAddress, regs) {
  const r = (addr) => regAt(startAddress, regs, addr);
  const rs = (addr) => regS16At(startAddress, regs, addr);

  const multi20 = rs(583);
  const multi21 = rs(584);
  const multi22 = rs(585);
  const multi23 = rs(587);

  const oilBar = scalePow10(r(595), 2);
  const coolantC = scalePow10(r(594), 1);
  const battery = scalePow10(r(613), 1);
  const rpm = r(576) || r(593);
  const engineLoad = r(608);
  const fuelRate = scalePow10(r(602), 1);
  const faultCount = r(596);

  // Multi-inputs (583-587) are site-configured analog channels — often fuel level
  const fuelCandidates = [multi20, multi21, multi22, multi23]
    .filter(v => v > 0 && v <= 100);

  return {
    block: 'ENGINE_51_59',
    oilPressure_bar: oilBar > 0 ? oilBar : undefined,
    coolantTemp_c: coolantC > 0 ? coolantC : undefined,
    oilTemp_c: scalePow10(r(597), 1) || undefined,
    fuelLevel_pct: fuelCandidates.length ? Math.max(...fuelCandidates) : undefined,
    batteryVoltage_v: battery > 0 ? battery : undefined,
    rpm,
    engineLoad: engineLoad > 0 && engineLoad <= 100 ? engineLoad : undefined,
    fuelRate_lph: fuelRate > 0 ? fuelRate : undefined,
    engineFaultCount: faultCount > 0 ? faultCount : undefined,
    startAddress,
  };
}

export function decodeAgc150ByBlock(slaveId, fn, startAddress, data, options = {}) {
  const profile = resolveAgc150Profile(options.profile);

  if (fn === 2 && Array.isArray(data)) {
    return decodeDiscreteStatus(startAddress, data);
  }

  const regs = data;
  if (fn === 4 && startAddress === 501 && regs.length >= 51) {
    return decodeAcBlocks(profile, 501, regs.slice(0, 38), 539, regs.slice(38));
  }
  if (fn === 4 && startAddress === 501 && regs.length >= 19) {
    return decodeAcBlocks(profile, 501, regs, null, null);
  }
  if (fn === 4 && startAddress === 539 && regs.length >= 7) {
    return decodeAcBlocks(profile, 501, [], 539, regs);
  }
  if (fn === 4 && startAddress === 554 && regs.length >= 5) {
    return decodeHoursAlarms(startAddress, regs);
  }
  if (fn === 4 && startAddress === 576 && regs.length >= 20) {
    return decodeEngineBlock(startAddress, regs);
  }

  return { block: 'UNKNOWN', startAddress, fn, slaveId, registers: regs };
}

export function decodeAgc150Payload(payload, options = {}) {
  const reqs = payload?.modbusRequest ?? [];
  const resps = payload?.modbusResponse ?? [];
  const out = [];
  const profile = resolveAgc150Profile(options.profile);

  let pendingBusA = null;
  let pendingBusB = null;

  const flushAcBlocks = () => {
    if (!pendingBusA && !pendingBusB) return;
    const blocks = decodeAcBlocks(profile, 501, pendingBusA || [], 539, pendingBusB || []);
    for (const block of blocks) {
      out.push({ ok: true, decoded: block });
    }
    pendingBusA = null;
    pendingBusB = null;
  };

  for (let i = 0; i < Math.max(reqs.length, resps.length); i++) {
    const reqHex = reqs[i];
    const respHex = resps[i];
    if (!reqHex) continue;

    const req = parseRtuRequestHex(reqHex);
    const fn = req.fn ?? 3;

    if (!respHex) {
      flushAcBlocks();
      out.push({ request: req, ok: false, error: 'NO_RESPONSE' });
      continue;
    }

    let resp;
    let payloadData;

    if (fn === 2) {
      resp = parseDiscreteInputResponseHex(respHex);
      if (resp.isException) {
        flushAcBlocks();
        out.push({ request: req, response: resp, ok: false, error: `MODBUS_EXCEPTION_${resp.exceptionCode}` });
        continue;
      }
      payloadData = resp.bits;
    } else {
      resp = parseRtuResponseHex(respHex);
      if (resp.isException) {
        flushAcBlocks();
        out.push({ request: req, response: resp, ok: false, error: `MODBUS_EXCEPTION_${resp.exceptionCode}` });
        continue;
      }
      payloadData = resp.registers;
    }

    if (fn === 4 && req.startAddress === 501 && payloadData.length < 51) {
      pendingBusA = payloadData;
      continue;
    }
    if (fn === 4 && req.startAddress === 539) {
      pendingBusB = payloadData;
      flushAcBlocks();
      continue;
    }

    const decoded = decodeAgc150ByBlock(req.slaveId, fn, req.startAddress, payloadData, { profile });
    const blocks = Array.isArray(decoded) ? decoded : [decoded];

    for (const block of blocks) {
      out.push({ request: req, response: resp, decoded: block, ok: true });
    }
  }

  flushAcBlocks();
  return out;
}

/** Prefer discrete GB/MB feedback; fall back to voltage/RPM heuristic. */
export function reconcileAgc150BreakerState(data) {
  const mainsV = Math.max(
    data.mainsVoltageL1 || 0, data.mainsVoltageL2 || 0, data.mainsVoltageL3 || 0,
    data.mainsVoltageL12 || 0, data.mainsVoltageL23 || 0, data.mainsVoltageL31 || 0
  );
  const genV = Math.max(
    data.voltageL1 || 0, data.voltageL2 || 0, data.voltageL3 || 0,
    data.voltageL12 || 0, data.voltageL23 || 0, data.voltageL31 || 0
  );
  const rpm = data.rpm ?? 0;

  const genEnergized = rpm > 100 || genV > 80;
  const mainsEnergized = mainsV > 100;

  if (data.genBreakerClosed == null && data.mainsBreakerClosed == null) {
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
  } else {
    if (data.mainsBreakerClosed == null) data.mainsBreakerClosed = mainsEnergized;
    if (data.genBreakerClosed == null) data.genBreakerClosed = genEnergized;
  }

  return data;
}
