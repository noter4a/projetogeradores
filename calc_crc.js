
function crc16(buffer) {
    let crc = 0xFFFF;
    for (let pos = 0; pos < buffer.length; pos++) {
        crc ^= buffer[pos];
        for (let i = 8; i !== 0; i--) {
            if ((crc & 0x0001) !== 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

const buf1 = Buffer.from('0103004D0001', 'hex'); // Reg 77, Len 1
const crc1 = crc16(buf1);
const final1 = Buffer.concat([buf1, Buffer.alloc(2)]);
final1.writeUInt16LE(crc1, 6);

const buf2 = Buffer.from('0103004D0002', 'hex'); // Reg 77, Len 2
const crc2 = crc16(buf2);
const final2 = Buffer.concat([buf2, Buffer.alloc(2)]);
final2.writeUInt16LE(crc2, 6);

console.log("Req (Len 1):", final1.toString('hex').toUpperCase());
console.log("Req (Len 2):", final2.toString('hex').toUpperCase());
