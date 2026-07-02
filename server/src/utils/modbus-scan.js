// Modbus RTU register discovery for K30XL direct RS232 (no KvaNet)
import { verifyCrcRtu, parseRtuResponseHex } from './sgc120-parser.js';

const EXCEPTION_NAMES = {
    1: 'Illegal Function',
    2: 'Illegal Data Address',
    3: 'Illegal Data Value',
    4: 'Slave Device Failure',
};

/**
 * Build a coarse scan plan for K30XL on RS232 (direct, no KvaNet).
 * Probes low legacy addresses, KvaNet PDU offsets (~2000), and command zone (~9107).
 */
export function buildK30XlDirectScanPlan(options = {}) {
    const functions = options.functions ?? [3, 4];
    const quantity = options.quantity ?? 1;
    const addresses = new Set();

    for (let a = 0; a <= 400; a += 20) addresses.add(a);
    for (let a = 400; a <= 2500; a += 40) addresses.add(a);
    for (let a = 1980; a <= 2080; a += 4) addresses.add(a);
    [1, 2, 3, 10, 14, 51, 60, 77, 100, 500, 1000, 1500, 2048, 3000, 4096, 9107, 9108, 12000, 12001].forEach(a => addresses.add(a));

    const sorted = [...addresses].sort((a, b) => a - b);
    const steps = [];
    for (const fn of functions) {
        for (const startAddress of sorted) {
            steps.push({ fn, startAddress, quantity });
        }
    }
    return steps;
}

/** Fine scan ±range around promising addresses (valid data or Modbus exceptions). */
export function buildFineScanAround(hits, options = {}) {
    const fn = options.fn ?? 3;
    const quantity = options.quantity ?? 7;
    const radius = options.radius ?? 12;
    const addresses = new Set();

    for (const hit of hits) {
        const center = hit.startAddress;
        for (let a = Math.max(0, center - radius); a <= center + radius; a += 1) {
            addresses.add(a);
        }
    }

    return [...addresses].sort((a, b) => a - b).map(startAddress => ({ fn, startAddress, quantity }));
}

export function classifyModbusResponse(buffer, expected = {}) {
    const hex = buffer.toString('hex');
    if (!buffer || buffer.length < 3) {
        return { kind: 'short', hex, crcOk: false, expected };
    }

    const slaveId = buffer[0];
    const fn = buffer[1];
    const crcOk = verifyCrcRtu(buffer);

    if ((fn & 0x80) && buffer.length >= 5) {
        const exceptionCode = buffer[2];
        const validException = exceptionCode >= 1 && exceptionCode <= 4;
        return {
            kind: validException ? 'exception' : 'garbage',
            hex,
            crcOk,
            slaveId,
            fn: fn & 0x7f,
            exceptionCode,
            exceptionName: EXCEPTION_NAMES[exceptionCode] ?? null,
            expected,
            note: validException
                ? `Slave ${slaveId} FC${fn & 0x7f} exception ${exceptionCode} (${EXCEPTION_NAMES[exceptionCode]})`
                : `Byte 0x${exceptionCode.toString(16)} is not a valid Modbus exception (serial noise)`,
        };
    }

    if (!crcOk) {
        return {
            kind: 'garbage',
            hex,
            crcOk: false,
            slaveId,
            fn,
            expected,
            note: `CRC invalid (slave=${slaveId}, fn=0x${fn.toString(16)})`,
        };
    }

    try {
        const parsed = parseRtuResponseHex(hex);
        if (parsed.crcOk && parsed.registers?.length) {
            return {
                kind: 'data',
                hex,
                crcOk: true,
                slaveId: parsed.slaveId,
                fn: parsed.fn,
                byteCount: parsed.byteCount,
                registers: parsed.registers,
                registerPreview: parsed.registers.slice(0, Math.min(8, parsed.registers.length)),
                expected,
                note: `OK: ${parsed.registers.length} register(s)`,
            };
        }
    } catch {
        // fall through
    }

    return {
        kind: 'garbage',
        hex,
        crcOk: false,
        slaveId,
        fn,
        expected,
        note: 'Unparseable frame',
    };
}

export function summarizeScanSession(session) {
    const dataHits = session.results.filter(r => r.classification?.kind === 'data');
    const exceptionHits = session.results.filter(r => r.classification?.kind === 'exception');
    const garbage = session.results.filter(r => r.classification?.kind === 'garbage');
    const timeouts = session.results.filter(r => r.classification?.kind === 'timeout');

    return {
        deviceId: session.deviceId,
        slaveId: session.slaveId,
        status: session.status,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        totalSteps: session.totalSteps,
        completedSteps: session.completedSteps,
        summary: {
            data: dataHits.length,
            exceptions: exceptionHits.length,
            garbage: garbage.length,
            timeouts: timeouts.length,
        },
        dataHits: dataHits.map(r => ({
            fn: r.step.fn,
            startAddress: r.step.startAddress,
            quantity: r.step.quantity,
            slaveId: r.classification.slaveId,
            registers: r.classification.registerPreview,
            hex: r.classification.hex,
        })),
        exceptionHits: exceptionHits.map(r => ({
            fn: r.step.fn,
            startAddress: r.step.startAddress,
            quantity: r.step.quantity,
            exceptionCode: r.classification.exceptionCode,
            exceptionName: r.classification.exceptionName,
            slaveId: r.classification.slaveId,
            hex: r.classification.hex,
        })),
        reportFile: session.reportFile ?? null,
    };
}
