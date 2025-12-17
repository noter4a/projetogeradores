import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../../');

// We know this file is present
const fileName = 'agc-150-modbus-server-tables-4189341212-uk.xlsx';
const fullPath = path.join(rootDir, fileName);

console.log(`Reading ${fileName}...`);
const workbook = xlsx.readFile(fullPath);
const sheetName = 'Input register (04)';
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
    console.error(`Sheet ${sheetName} not found!`);
    process.exit(1);
}

const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log(`Found ${rows.length} rows.`);
// Find a row that looks like data (e.g. column 1 is a number > 0)
const dataRow = rows.find(r => typeof r[1] === 'number' && r[1] > 0);

if (dataRow) {
    console.log('--- Sample Data Row ---');
    console.log(JSON.stringify(dataRow, null, 2));

    // Also print headers (row 0-5 usually)
    console.log('--- Potential Headers ---');
    rows.slice(0, 5).forEach((r, i) => {
        console.log(`Row ${i}:`, JSON.stringify(r));
    });
} else {
    console.log('No data row found.');
}
