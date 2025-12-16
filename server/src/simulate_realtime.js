import mqtt from 'mqtt';

// Simulation Config
const BROKER_URL = 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: 'ciklogeradores',
    password: 'CikloG3radores@2025',
    rejectUnauthorized: false
};

const DEVICE_ID = 'Ciklo0';
const TOPIC = `devices/data/${DEVICE_ID}`;

console.log(`Connecting to ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('Connected! Starting simulation...');

    // Simulate data every 3 seconds
    setInterval(() => {
        const payload = generateMockData();
        const message = JSON.stringify(payload);

        client.publish(TOPIC, message);
        console.log(`[${new Date().toISOString()}] Sent data to ${TOPIC}`);
    }, 3000);
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
});

function generateMockData() {
    // Generate a Hex string mimicking the Modbus structure
    // We need enough bytes to cover our index 22 (Engine Temp)
    // Structure: [ByteCount] [Reg0_Hi] [Reg0_Lo] ... 

    // Helper to write Int16
    const buf = Buffer.alloc(100); // Plenty of space
    buf[0] = 99; // Byte count

    // Voltage L1 (Reg 3 -> Offset 3 + 3*2 = 9? No. 3 + 3*2 = 9. Wait.
    // decodeModbus logic: offset = 3 + (idx * 2)
    // Reg 3 (Voltage L1): 3 + 6 = 9. So bytes 9 and 10.

    const writeVal = (regIndex, value) => {
        const offset = 3 + (regIndex * 2);
        buf.writeUInt16BE(value, offset);
    };

    // Simulated Values
    const voltage = 220 + Math.floor(Math.random() * 5);
    const rpm = 1800 + Math.floor(Math.random() * 10);
    const fuel = 50 + Math.floor(Math.random() * 20);

    // Map:
    // Voltage L1: Reg 3
    writeVal(3, voltage);
    writeVal(4, voltage);
    writeVal(5, voltage);

    // RPM: Reg 1
    writeVal(1, rpm);

    // Fuel: Reg 20
    writeVal(20, fuel);

    // Convert Buffer to Hex String
    const hexString = buf.toString('hex');

    return {
        // The server expects { modbusResponse: [HEX_STRING] }
        modbusResponse: [hexString]
    };
}
