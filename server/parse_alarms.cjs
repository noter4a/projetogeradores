const fs = require('fs');
const data = JSON.parse(fs.readFileSync('modbus_all.json', 'utf8'));
const sheet = data['Holding register (03;16)'];

const alarms = [];

for (const row of sheet) {
    if (!row || row.length < 5) continue;
    const group = row[0];
    const addr = row[1];
    const param = row[3];
    const bits = row[4];

    if (group && typeof group === 'string' && group.startsWith('Alarm Status')) {
        alarms.push({ address: addr, name: param, bits: bits });
    }
}

fs.writeFileSync('alarms_parsed.json', JSON.stringify(alarms, null, 2));
console.log('Parsed alarms to alarms_parsed.json');
