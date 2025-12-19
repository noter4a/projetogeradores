import mqtt from 'mqtt';

// Uses the same credentials as the server
const BROKER_URL = 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: 'ciklogeradores',
    password: 'CikloG3radores@2025',
    rejectUnauthorized: false
};

// MATCH THE DEFAULT GENERATOR ID (GEN-REAL-01 -> connection: Ciklo0)
const TOPIC = 'devices/data/Ciklo0';

console.log(`Connecting to ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('>>> CONNECTED! Sending test data to', TOPIC);

    // Simulated SGC-120 Response (Registers 51-59: Engine Stats)
    // 01: Slave ID
    // 04: Function Code
    // 12: Byte Count (18 bytes)
    // 00 2D: Oil Pressure (4.5 bar)
    // 00 55: Coolant Temp (85 C)
    // 00 4B: Fuel Level (75%)
    // 00 F5: Battery (24.5 V)
    // 07 08: RPM (1800)
    // 00 0A: Starts (10)
    // 00 00: Trips
    // 00 00: Reserved
    // 00 00: Reserved
    // CRC: F4 9C (Calculated offline for this specific packet)
    const engineHex = "010412002D0055004B00F50708000A000000000000F49C";

    const payload = {
        deviceId: 'Ciklo0', // Updated to match
        block: 'ENGINE_51_59',
        modbusResponse: [engineHex],
        timestamp: new Date().toISOString()
    };

    client.publish(TOPIC, JSON.stringify(payload), (err) => {
        if (err) {
            console.error('Publish Error:', err);
        } else {
            console.log('>>> DATA SENT SUCCESSFULLY to Ciklo0!');
            console.log('Payload:', JSON.stringify(payload, null, 2));
            console.log('\nNow check the Dashboard (Generator Real)!');
        }
        client.end();
    });
});

client.on('error', (err) => {
    console.error('Connection Error:', err);
    client.end();
});
