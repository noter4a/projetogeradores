
import { Buffer } from 'buffer';

function crc16Modbus(buf) {
    let crc = 0xffff;
    for (let pos = 0; pos < buf.length; pos++) {
        crc ^= buf[pos];
        for (let i = 0; i < 8; i++) {
            const lsb = crc & 0x0001;
            crc >>= 1;
            if (lsb) crc ^= 0xA001;
        }
    }
    return crc;
}

const strings = [
    "01032AF80001865E", // User provided
    "01032AF90001D79E"  // User provided
];

strings.forEach(s => {
    const buf = Buffer.from(s, 'hex');
    // Data part is first length-2 bytes
    const data = buf.subarray(0, buf.length - 2);
    const providedCrc = buf.readUInt16LE(buf.length - 2); // Assuming Little Endian in string
    const calcCrc = crc16Modbus(data);

    console.log(`String: ${s}`);
    console.log(`Data: ${data.toString('hex').toUpperCase()}`);
    console.log(`Provided CRC (LE): ${providedCrc.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`Calculated CRC:    ${calcCrc.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`MATCH? ${providedCrc === calcCrc ? 'YES' : 'NO'}`);
    console.log('---');
});
