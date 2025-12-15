
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root dir relative to server/src
const rootDir = path.join(__dirname, '../../');

// Files to scan
const filesToScan = [
    'agc-150-modbus-server-tables-4189341212-uk.xlsx',
    'sgc-120-mk-ii-modbus-tables-4189341403-uk (10).xlsx',
    'sgc-420-mk-ii-modbus-tables-4189341402-uk.xlsx'
];

const targetParams = [
    'Voltage',
    'Fuel',
    'Power',
    'Battery',
    'Oil pressure',
    'Speed',
    'RPM',
    'State',
    'Status'
];

async function scanFiles() {
    for (const fileName of filesToScan) {
        const fullPath = path.join(rootDir, fileName);

        console.log(`\n==================================================`);
        console.log(`FILE: ${fileName}`);
        console.log(`==================================================`);

        if (!fs.existsSync(fullPath)) {
            console.log(`File not found: ${fullPath}`);
            continue;
        }

        try {
            const workbook = xlsx.readFile(fullPath);

            workbook.SheetNames.forEach(sheetName => {
                // Skip generic description sheets
                if (sheetName.toLowerCase().includes('descriptions') || sheetName.toLowerCase().includes('revision')) return;

                console.log(`\n  >>> Sheet: ${sheetName}`);
                const sheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

                data.forEach((row, rowIndex) => {
                    if (!row || row.length < 2) return;
                    const rowStr = JSON.stringify(row).toLowerCase();

                    // Check for headers
                    if (rowStr.includes('register') && (rowStr.includes('name'))) {
                        console.log(`      [HEADER Row ${rowIndex}] ${JSON.stringify(row)}`);
                    }

                    // Check for targets
                    const foundKeyword = targetParams.find(k => rowStr.includes(k.toLowerCase()));
                    if (foundKeyword) {
                        console.log(`      [${foundKeyword.toUpperCase()}] Row ${rowIndex}: ${JSON.stringify(row)}`);
                    }
                });
            });

        } catch (err) {
            console.error(`Error reading ${fileName}:`, err.message);
        }
    }
}

scanFiles();
