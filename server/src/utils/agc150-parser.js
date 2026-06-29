// agc150-parser.js
// DEIF AGC 150 — Input registers (fn 04) + discrete inputs (fn 02)
// Based on agc-150-modbus-server-tables-4189341212-uk.xlsx (Rev V, SW 1.35.0)

import { parseRtuRequestHex, parseRtuResponseHex, hexToBuf, verifyCrcRtu } from './sgc120-parser.js';

/** Poll sequence — fn 04 = input registers, fn 02 = discrete inputs */
export const AGC150_POLL_SEQUENCE = [
  { startAddress: 0, quantity: 16, fn: 2 },   // Mode / running / breaker feedback
  { startAddress: 501, quantity: 51, fn: 4 }, // Bus A (501-538) + Bus B (539-551)
  { startAddress: 554, quantity: 7, fn: 4 },  // Run hours + alarm counters (554-560)
  { startAddress: 576, quantity: 45, fn: 4 }, // RPM + engine measurements (576-620)
];

export function isAgc150Controller(controller) {
  const c = (controller || '').toLowerCase();
  return c === 'agc150' || c === 'agc-150' || c === 'deif150' || c === 'deif_agc150';
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
const scalePow10 = (raw, exp) => (exp > 0 ? scale01(raw / Math.pow(10, exp)) : raw);

function regAt(startAddress, regs, addr) {
  const idx = addr - startAddress;
  if (idx < 0 || idx >= regs.length) return 0;
  return u16(regs, idx);
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

  const running = bit(3) === 1;
  const gbOn = bit(0) === 1;
  const gbOff = bit(11) === 1;

  const statusWord = (
    (bit(9) << 9) | (bit(8) << 8) | (bit(10) << 10) | (bit(3) << 3) | (bit(0) << 0)
  );

  return {
    block: 'STATUS_COMBINED_77_78',
    reg77_hex: statusWord.toString(16).toUpperCase().padStart(4, '0'),
    reg78_hex: statusWord.toString(16).toUpperCase().padStart(4, '0'),
    opMode,
    running,
    genBreakerClosed: gbOn && !gbOff,
    mainsBreakerClosed: null,
    startAddress,
  };
}

function decodeAcBlock501(startAddress, regs) {
  const r = (addr) => regAt(startAddress, regs, addr);

  const mains = {
    block: 'MAINS_14',
    l1n_v: r(504),
    l2n_v: r(505),
    l3n_v: r(506),
    l1l2_v: r(501),
    l2l3_v: r(502),
    l3l1_v: r(503),
    freq_r_hz: scalePow10(r(507), 2),
    startAddress,
  };

  const gen = {
    block: 'GEN_VOLT_FREQ_1_9',
    l1n_v: r(542) || r(504),
    l2n_v: r(543) || r(505),
    l3n_v: r(544) || r(506),
    l12_v: r(539) || r(501),
    l23_v: r(540) || r(502),
    l31_v: r(541) || r(503),
    freq_r_hz: scalePow10(r(545) || r(507), 2),
    startAddress,
  };

  const current = {
    block: 'LOAD_CURRENT_23',
    loadCurr_l1: r(513),
    loadCurr_l2: r(514),
    loadCurr_l3: r(515),
    startAddress,
  };

  const power = {
    block: 'ACTIVE_POWER_29_31',
    activePowerL1: r(516),
    activePowerL2: r(517),
    activePowerL3: r(518),
    activePowerTotal: r(519),
    engineLoad: null,
    startAddress,
  };

  return [mains, gen, current, power];
}

function decodeHoursAlarms(startAddress, regs) {
  const idx = (addr) => addr - startAddress;
  const hours = idx(554) >= 0 && idx(555) < regs.length ? s32(regs, idx(554)) : 0;
  const alarmCount = idx(558) >= 0 ? u16(regs, idx(558)) : 0;

  return [
    {
      block: 'RUNHOURS_60',
      runHours: hours,
      runMinutes: idx(561) >= 0 ? u16(regs, idx(561)) : 0,
      runHoursTotal: hours,
      totalHours: parseFloat(hours.toFixed(2)),
      startAddress,
    },
    {
      block: 'ALARM_65_76',
      alarmCode: alarmCount > 0 ? 15000 + alarmCount : 0,
      alarmMessage: alarmCount > 0 ? `${alarmCount} alarme(s) ativo(s) no AGC 150` : 'Normal (Sem Alarme)',
      startFailure: false,
      startAddress,
    },
  ];
}

function decodeEngineBlock(startAddress, regs) {
  const r = (addr) => regAt(startAddress, regs, addr);

  return {
    block: 'ENGINE_51_59',
    oilPressure_bar: scalePow10(r(595), 2),
    coolantTemp_c: scalePow10(r(594), 1),
    fuelLevel_pct: scalePow10(r(615), 1),
    batteryVoltage_v: scalePow10(r(613), 1),
    rpm: r(576) || r(593),
    engineLoad: r(608),
    starts: null,
    startAddress,
  };
}

export function decodeAgc150ByBlock(slaveId, fn, startAddress, data) {
  if (fn === 2 && Array.isArray(data)) {
    return decodeDiscreteStatus(startAddress, data);
  }

  const regs = data;
  if (fn === 4 && startAddress === 501 && regs.length >= 38) {
    return decodeAcBlock501(startAddress, regs);
  }
  if (fn === 4 && startAddress === 554 && regs.length >= 5) {
    return decodeHoursAlarms(startAddress, regs);
  }
  if (fn === 4 && startAddress === 576 && regs.length >= 20) {
    return decodeEngineBlock(startAddress, regs);
  }

  return { block: 'UNKNOWN', startAddress, fn, slaveId, registers: regs };
}

export function decodeAgc150Payload(payload) {
  const reqs = payload?.modbusRequest ?? [];
  const resps = payload?.modbusResponse ?? [];
  const out = [];

  for (let i = 0; i < Math.max(reqs.length, resps.length); i++) {
    const reqHex = reqs[i];
    const respHex = resps[i];
    if (!reqHex) continue;

    const req = parseRtuRequestHex(reqHex);
    const fn = req.fn ?? 3;

    if (!respHex) {
      out.push({ request: req, ok: false, error: 'NO_RESPONSE' });
      continue;
    }

    let resp;
    let payloadData;

    if (fn === 2) {
      resp = parseDiscreteInputResponseHex(respHex);
      if (resp.isException) {
        out.push({ request: req, response: resp, ok: false, error: `MODBUS_EXCEPTION_${resp.exceptionCode}` });
        continue;
      }
      payloadData = resp.bits;
    } else {
      resp = parseRtuResponseHex(respHex);
      if (resp.isException) {
        out.push({ request: req, response: resp, ok: false, error: `MODBUS_EXCEPTION_${resp.exceptionCode}` });
        continue;
      }
      payloadData = resp.registers;
    }

    const decoded = decodeAgc150ByBlock(req.slaveId, fn, req.startAddress, payloadData);
    const blocks = Array.isArray(decoded) ? decoded : [decoded];

    for (const block of blocks) {
      out.push({ request: req, response: resp, decoded: block, ok: true });
    }
  }

  return out;
}

/** Derive QTA breaker state from voltages (same approach as SGC 420). */
export function reconcileAgc150BreakerState(data) {
  const mainsV = Math.max(data.mainsVoltageL1 || 0, data.mainsVoltageL2 || 0, data.mainsVoltageL3 || 0);
  const genV = Math.max(data.voltageL1 || 0, data.voltageL2 || 0, data.voltageL3 || 0);
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
