
import mqtt from 'mqtt';

const BROKER_URL = 'mqtts://painel.ciklogeradores.com.br:8883';
const OPTIONS = {
    username: 'ciklogeradores',
    password: 'CikloG3radores@2025',
    rejectUnauthorized: false
};

const DEVICE_ID = 'Ciklo1'; // Derived from logs
const TOPIC_CMD = `devices/command/${DEVICE_ID}`;
// const TOPIC_DATA = `devices/data/${DEVICE_ID}`; // Not subscribing, just sending

// The exact HEX the user asked for:
const HEX_TO_SEND = '0103003C00020407';

console.log(`Connecting to ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('>>> CONNECTED! Sending Command...');
    console.log(`Topic: ${TOPIC_CMD}`);
    console.log(`Payld: ${HEX_TO_SEND}`);

    client.publish(TOPIC_CMD, HEX_TO_SEND, { qos: 1 }, (err) => {
        if (err) {
            console.error('Publish Error:', err);
        } else {
            console.log('>>> PUBLISHED SUCCESSFULLY!');
        }

        // Wait a bit then exit
        setTimeout(() => {
            console.log('Exiting...');
            client.end();
            process.exit(0);
        }, 2000);
    });
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
    process.exit(1);
});
