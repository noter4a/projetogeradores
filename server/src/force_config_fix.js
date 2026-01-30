
import mqtt from 'mqtt';
import { Buffer } from 'buffer';

// CRC Function
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

// Function 03 Read Helper
function createModbusReadRequest(slaveId, startAddress, quantity) {
    const buf = Buffer.alloc(8);
    buf.writeUInt8(slaveId, 0);
    buf.writeUInt8(3, 1);
    buf.writeUInt16BE(startAddress, 2);
    buf.writeUInt16BE(quantity, 4);
    const crc = crc16Modbus(buf.subarray(0, 6));
    buf.writeUInt16LE(crc, 6); // Little Endian CRC
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

console.log(`Connecting to ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('>>> CONNECTED! Sending CLEAN Configuration (Reads Only)...');

    const slaveId = 1;

    // THE CLEAN LIST (No WRITE commands)
    const requests = [
        createModbusReadRequest(slaveId, 60, 5).toString('hex').toUpperCase(), // 1. Run Hours (Reg 60-64)
        createModbusReadRequest(slaveId, 1, 9).toString('hex').toUpperCase(),  // 2. Gen Voltage (Reg 1-9)
        createModbusReadRequest(slaveId, 51, 9).toString('hex').toUpperCase(), // 3. Engine (Reg 51-59)
        createModbusReadRequest(slaveId, 14, 9).toString('hex').toUpperCase(), // 4. Mains Voltage (Reg 14-22)
        createModbusReadRequest(slaveId, 23, 3).toString('hex').toUpperCase(), // 5. Current/Breaker (Reg 23-25)
        createModbusReadRequest(slaveId, 29, 3).toString('hex').toUpperCase(), // 6. Active Power (Reg 29-31)
        createModbusReadRequest(slaveId, 66, 1).toString('hex').toUpperCase(), // 7. Alarm (Reg 66)
        createModbusReadRequest(slaveId, 11000, 1).toString('hex').toUpperCase(), // 8. Mains Status (Reg 11000)
        createModbusReadRequest(slaveId, 11001, 1).toString('hex').toUpperCase(), // 9. Gen Status (Reg 11001)
        createModbusReadRequest(slaveId, 78, 1).toString('hex').toUpperCase(), // 10. Mode (Reg 78)
    ];

    const payload = JSON.stringify({
        modbusRequest: requests,
        modbusPeriodicitySeconds: 10
    });

    console.log('Payload being sent:');
    console.log(JSON.stringify(requests, null, 2));

    client.publish(TOPIC_CMD, payload, { qos: 1 }, (err) => {
        if (err) {
            console.error('Publish Error:', err);
            process.exit(1);
        }
        console.log('>>> PAYLOAD SENT SUCCESSFULLY!');
        setTimeout(() => {
            console.log('Exiting...');
            client.end();
        }, 2000);
    });
});

client.on('error', (err) => {
    console.error('Connection Error:', err);
    process.exit(1);
});
