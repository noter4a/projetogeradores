import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const MAP_FILE = path.join(__dirname, 'modbus_maps.json');
const LOG_FILE = path.join(__dirname, '../../logs/mqtt_data.json');

// Default params (can be overriden by args)
// Usage: node src/analyze_hex.js [HEX_STRING] [START_REGISTER]
const args = process.argv.slice(2);
let targetHex = args[0];
const startRegister = parseInt(args[1]) || 0; // Default start register (offset)

// Load Map
if (!fs.existsSync(MAP_FILE)) {
    console.error('Error: modbus_maps.json not found. Run convert_excel.js first.');
    process.exit(1);
}
const maps = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

// If no HEX provided, try to read from last log
if (!targetHex) {
    if (fs.existsSync(LOG_FILE)) {
        const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
        if (lines.length > 0) {
            try {
                const lastEntry = JSON.parse(lines[lines.length - 1]);
                if (lastEntry.rawHex) {
                    targetHex = lastEntry.rawHex;
                    console.log(`Loaded HEX from last log entry (${lastEntry.timestamp})`);
                } else {
                    console.error('Error: Last log entry does not contain "rawHex". Update mqtt.js and wait for new data.');
                    process.exit(1);
                }
            } catch (e) {
                console.error('Error parsing last log line:', e.message);
                process.exit(1);
            }
        } else {
            console.error('Error: Log file is empty.');
            process.exit(1);
        }
    } else {
        console.error('Error: No HEX provided and log file not found.');
        console.log('Usage: node src/analyze_hex.js <HEX_STRING> [START_REGISTER]');
        process.exit(1);
    }
}

console.log(`\nAnalyzing HEX (Length: ${targetHex.length} chars)`);
console.log(`Start Register: ${startRegister}`);

// Parse HEX
// Modbus TCP response format (approx for data payload):
// [Byte Count] [Data High] [Data Low] ...
const buffer = Buffer.from(targetHex, 'hex');

// Assuming the HEX is just the data payload or similar.
// Often standard Modbus response: Byte Count (1 byte) + Data
// Let's verify buffer length
console.log(`Buffer Length: ${buffer.length} bytes`);

// If first byte is byte count, and it matches remaining length
let dataBuffer = buffer;
if (buffer[0] === buffer.length - 1) {
    console.log(`Detected Byte Count Header: ${buffer[0]}`);
    dataBuffer = buffer.slice(1);
}

// Iterate 2 bytes at a time (16-bit registers)
const numRegisters = Math.floor(dataBuffer.length / 2);
console.log(`Found ${numRegisters} registers.`);

console.log('\n--- DECODING REPORT ---');

// Flatten maps for search (or search all sheets)
// We'll search in the AGC 150 map primarily (first key) or check all
const mapKeys = Object.keys(maps);
const primaryMapKey = mapKeys.find(k => k.includes('agc')) || mapKeys[0];
const registerMap = maps[primaryMapKey];

console.log(`Using Map: ${primaryMapKey}`);

for (let i = 0; i < numRegisters; i++) {
    const currentReg = startRegister + i;
    const val = dataBuffer.readUInt16BE(i * 2);

    // Find in map
    const info = registerMap.find(r => r.register === currentReg);

    if (info) {
        // Highlighting interesting values
        const isNonZero = val !== 0;
        const prefix = isNonZero ? '>> ' : '   ';
        console.log(`${prefix}Reg ${currentReg}: ${val} \t [${info.name}] (${info.unit || '-'})`);
    } else {
        // console.log(`   Reg ${currentReg}: ${val} \t [Unknown]`);
    }
}
console.log('-----------------------');
