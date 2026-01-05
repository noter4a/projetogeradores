
import mqtt from 'mqtt';

const BROKER_URL = 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: 'ciklogeradores',
    password: 'CikloG3radores@2025',
    rejectUnauthorized: false
};

console.log(' Diagnosing MQTT Data Flow...');
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log(' Connected to Broker.');
    client.subscribe('devices/data/#');
});

client.on('message', (topic, message) => {
    console.log(`\n Msg on ${topic}`);
    try {
        const payload = JSON.parse(message.toString());

        // Filter: Show only if it looks like our manual packet OR has valid data
        const interest = JSON.stringify(payload).includes('0407') ||
            (payload.modbusResponse && payload.modbusResponse.some(r => r && r.length > 0));

        if (interest) {
            console.log(`\n [INTERESTING PACKET] Msg on ${topic}`);
            if (payload.modbusResponse) {
                payload.modbusResponse.forEach((resp, idx) => {
                    console.log(` Response [${idx}]: ${resp || "EMPTY"}`);
                });
            }
            if (payload.modbusRequest) {
                console.log(` Request: ${payload.modbusRequest}`);
            }
            // Exit if we found a good response
            if (payload.modbusResponse && payload.modbusResponse.some(r => r && r.length > 0)) {
                console.log('>>> SUCCESS: Valid Response Detected!');
                process.exit(0);
            }
        } else {
            // process.stdout.write('.'); // heartbeat for spam
        }

    } catch (e) {
        console.log(' JSON Parse Error');
    }
});
