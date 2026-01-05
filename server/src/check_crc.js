
import { createModbusReadRequest } from './utils/sgc120-parser.js';

// Test Request: Slave 1, Addr 60 (0x3C), Qty 2
// Frame: 01 03 00 3C 00 02
// Expected CRC (Modbus): 0x0407 -> Low: 07, High: 04 -> "07 04" on wire?
// Or 0x85C0? Let's check authoritative calc.
// Using standard Modbus (Poly 0xA001).

const buf = createModbusReadRequest(1, 60, 2);
console.log('Generated Buffer (Hex):', buf.toString('hex').toUpperCase());

const crcBytes = buf.subarray(6, 8);
console.log('CRC Bytes on Wire:', crcBytes.toString('hex').toUpperCase());
