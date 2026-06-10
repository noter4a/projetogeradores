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
    buf.writeUInt8(3, 1); // Fn 03
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

const DEVICE_ID = 'Ciklo50';
const TOPIC_CMD = `devices/command/${DEVICE_ID}`;
const TOPIC_DATA = `devices/data/${DEVICE_ID}`;

const tests = [
    // --- TESTES DE ENDEREÇOS DA TABELA KVANET (12000+) ---
    { label: 'T1: Reg 12001 (Base 1 - Horímetro)', addr: 12001, qty: 7 },
    { label: 'T2: Reg 12000 (Base 0 - Horímetro)', addr: 12000, qty: 7 },
    { label: 'T3: Reg 12011 (Base 1 - Rede/GMG)', addr: 12011, qty: 15 },
    { label: 'T4: Reg 12010 (Base 0 - Rede/GMG)', addr: 12010, qty: 15 },
    { label: 'T5: Reg 12027 (Base 1 - Motor)', addr: 12027, qty: 7 },
    { label: 'T6: Reg 12026 (Base 0 - Motor)', addr: 12026, qty: 7 },

    // --- TESTES DE ENDEREÇOS DA TABELA ANTIGA (0 a 100) ---
    { label: 'T7: Reg 6 (Base 1 - Status Reg 1)', addr: 6, qty: 1 },
    { label: 'T8: Reg 5 (Base 0 - Status Reg 1)', addr: 5, qty: 1 },
    { label: 'T9: Reg 12 (Base 1 - Horímetro)', addr: 12, qty: 2 },
    { label: 'T10: Reg 11 (Base 0 - Horímetro)', addr: 11, qty: 2 },
    { label: 'T11: Reg 2 (Base 1 - Modelo)', addr: 2, qty: 1 },
    { label: 'T12: Reg 1 (Base 0 - Modelo)', addr: 1, qty: 1 },
];

console.log(`[TEST] Connecting to broker: ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

let currentTestIdx = 0;
let pendingTest = null;
let testTimeout = null;

function runNextTest() {
    if (currentTestIdx >= tests.length) {
        console.log('\n[TEST] All tests completed! Exiting in 3 seconds...');
        setTimeout(() => {
            client.end();
            process.exit(0);
        }, 3000);
        return;
    }

    const test = tests[currentTestIdx];
    pendingTest = test;
    const reqFrame = createModbusReadRequest(1, test.addr, test.qty);
    const hexReq = reqFrame.toString('hex').toUpperCase();

    console.log(`\n----------------------------------------`);
    console.log(`[TEST] Running ${test.label}`);
    console.log(`[TEST] Sending Request: Hex=${hexReq} (Addr=${test.addr}, Qty=${test.qty})`);

    client.publish(TOPIC_CMD, hexReq);

    // Timeout of 2.5s for each test
    testTimeout = setTimeout(() => {
        console.log(`[TEST] ❌ TIMEOUT: No response from Ciklo50 for ${test.label}`);
        currentTestIdx++;
        runNextTest();
    }, 2500);
}

client.on('connect', () => {
    console.log('[TEST] Connected to broker successfully! Subscribing to data...');
    client.subscribe(TOPIC_DATA, (err) => {
        if (err) {
            console.error('Subscription error:', err);
            process.exit(1);
        }
        console.log(`[TEST] Subscribed to ${TOPIC_DATA}`);
        console.log('Starting test sequence in 2 seconds...');
        setTimeout(runNextTest, 2000);
    });
});

client.on('message', (topic, message) => {
    if (topic !== TOPIC_DATA) return;
    if (!pendingTest) return;

    // Clear timeout since we got a response
    if (testTimeout) {
        clearTimeout(testTimeout);
        testTimeout = null;
    }

    const respHex = message.toString('hex').toLowerCase();
    console.log(`[TEST] Response Received: Hex=${respHex}`);

    // Decode response
    // Modbus RTU Response: Slave(1) + Func(1) + Length/Exception(1) + Data/CRC
    if (respHex.length === 10) {
        // Might be exception response (e.g. 018302c0f1)
        const func = parseInt(respHex.substring(2, 4), 16);
        if (func >= 0x80) {
            const exceptionCode = parseInt(respHex.substring(4, 6), 16);
            console.log(`[TEST] ⚠️ EXCEÇÃO MODBUS: Código=${exceptionCode} (${exceptionCode === 2 ? 'ILLEGAL DATA ADDRESS' : 'UNKNOWN'})`);
        } else {
            console.log(`[TEST] Decode: Raw 5-byte response: ${respHex}`);
        }
    } else if (respHex.length > 10) {
        // Success response
        console.log(`[TEST] ✅ SUCCESS: Generator responded to ${pendingTest.label}! Data length: ${respHex.length / 2} bytes.`);
        const dataHex = respHex.substring(6, respHex.length - 4);
        console.log(`[TEST] Data Payload (Hex): ${dataHex}`);
    } else {
        console.log(`[TEST] Unknown response format: ${respHex}`);
    }

    // Move to next test
    currentTestIdx++;
    pendingTest = null;
    setTimeout(runNextTest, 1000); // 1s gap between tests
});

client.on('error', (err) => {
    console.error('MQTT connection error:', err);
    process.exit(1);
});
