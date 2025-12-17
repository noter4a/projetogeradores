import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mapPath = path.join(__dirname, 'modbus_maps.json');
const rawData = fs.readFileSync(mapPath);
const maps = JSON.parse(rawData);

const inputRegisters = [];

// iterate over all keys (tables)
for (const key in maps) {
    const sheetData = maps[key];
    if (Array.isArray(sheetData)) {
        sheetData.forEach(entry => {
            if (entry.sheet === 'Input register (04)') {
                inputRegisters.push(entry);
            }
        });
    }
}

// Sort by register address
inputRegisters.sort((a, b) => a.register - b.register);

// Print specific electrical parameters we care about
const keywords = ['Active power', 'Frequency', 'RPM', 'Oil pressure', 'Fuel level', 'Engine temp', 'Coolant temp'];

console.log(`Found ${inputRegisters.length} input registers.`);

keywords.forEach(kw => {
    console.log(`\n--- Searching for "${kw}" ---`);
    inputRegisters.forEach(reg => {
        if (reg.name && reg.name.toLowerCase().includes(kw.toLowerCase())) {
            // Only print registers < 1000 to keep it relevant (usually electricals are first)
            if (reg.register < 1000) {
                console.log(`Reg ${reg.register}: ${reg.name} (${reg.unit})`);
            }
        }
    });
});

console.log('\n--- Registers 510 to 540 ---');
inputRegisters.forEach(reg => {
    if (reg.register >= 510 && reg.register <= 540) {
        console.log(`Reg ${reg.register}: ${reg.name} (${reg.unit})`);
    }
});
