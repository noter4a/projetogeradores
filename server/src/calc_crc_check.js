
import { crc16Modbus } from './utils/sgc120-parser.js';

function toHex(buf) { return buf.toString('hex').toUpperCase(); }

function check(slave, fn, addr, qty) {
    const buf = Buffer.alloc(6);
    buf.writeUInt8(slave, 0);
    buf.writeUInt8(fn, 1);
    buf.writeUInt16BE(addr, 2);
    buf.writeUInt16BE(qty, 4);

    const crc = crc16Modbus(buf);
    console.log(`Req: ${toHex(buf)} -> CRC: 0x${crc.toString(16).toUpperCase()} (LE: ${toHex(Buffer.from([crc & 0xFF, crc >> 8]))})`);
}

console.log('--- Checking CRC for common Requests ---');
// 01 03 00 3C 00 02 (Addr 60, Qty 2)
check(1, 3, 60, 2);

// 01 04 ... (Input Regs)
check(1, 4, 60, 2);

// 01 03 00 0E 00 09 (Addr 14, Qty 9)
check(1, 3, 14, 9);
