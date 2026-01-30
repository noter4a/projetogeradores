
import mqtt from 'mqtt';

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

function createModbusReadRequest(slaveId, startAddress, quantity) {
    const buf = Buffer.alloc(8);
    buf.writeUInt8(slaveId, 0);
    buf.writeUInt8(3, 1);
    buf.writeUInt16BE(startAddress, 2);
    buf.writeUInt16BE(quantity, 4);
    const crc = crc16Modbus(buf.subarray(0, 6));
    buf.writeUInt16LE(crc, 6);
    return buf;
}

const BROKER_URL = 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: 'ciklogeradores',
    password: 'CikloG3radores@2025',
    rejectUnauthorized: false
};

const DEVICE_ID = 'Ciklo1';
const TOPIC_CMD = `devices/command/${DEVICE_ID}`;
const TOPIC_DATA = `devices/data/${DEVICE_ID}`;

console.log(`Connecting to ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('>>> CONNECTED! Subscribing to data...');
    client.subscribe(TOPIC_DATA);

    // Send Read Request for Reg 78
    const readCmd = createModbusReadRequest(1, 78, 1);
    const hexCmd = readCmd.toString('hex').toUpperCase();

    console.log(`Sending Read Request for Reg 78: ${hexCmd}`);

    client.publish(TOPIC_CMD, hexCmd);
});

client.on('message', (topic, message) => {
    console.log(`\n[DATA RECEIVED] Topic: ${topic}`);
    const payload = JSON.parse(message.toString());

    if (payload.modbusResponse) {
        console.log(`Response Hex: ${payload.modbusResponse[0]}`);

        // Manual decode bits
        const hex = payload.modbusResponse[0];
        // Strip header...
        // Resp: Slave(1) + Func(1) + bytes(1) + Data(2) + CRC(2)
        // e.g. 0103026480CRC
        if (hex.length >= 10) {
            const dataHex = hex.substring(6, 10); // 4 chars (2 bytes)
            const val = parseInt(dataHex, 16);
            const high = val >> 8;
            const low = val & 0xFF;
            console.log(`\n>>> DECODED REG 78 <<<`);
            console.log(`Value: 0x${dataHex} (${val})`);
            console.log(`Mode (High Byte): ${high} (${high === 100 ? 'MANUAL' : high === 4 ? 'AUTO' : 'UNKNOWN'})`);
            console.log(`Flags (Low Byte): 0x${low.toString(16).toUpperCase()}`);
            console.log(`  - Mains Closed (Bit 7 / 0x80): ${(low & 0x80) !== 0}`);
            console.log(`  - Gen Closed   (Bit 6 / 0x40): ${(low & 0x40) !== 0}`);

            process.exit(0);
        }
    }
});

client.on('error', (err) => {
    console.error(err);
    process.exit(1);
});
