import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../../');
const OUTPUT_FILE = path.join(__dirname, 'modbus_maps.json');

const filesToProcess = [
    'agc-150-modbus-server-tables-4189341212-uk.xlsx',
    'sgc-120-mk-ii-modbus-tables-4189341403-uk (10).xlsx',
    'sgc-420-mk-ii-modbus-tables-4189341402-uk.xlsx'
];

const processedData = {};

function processFile(fileName) {
    const fullPath = path.join(rootDir, fileName);
    if (!fs.existsSync(fullPath)) {
        console.warn(`Skipping missing file: ${fileName}`);
        return;
    }

    console.log(`Processing: ${fileName}`);
    const workbook = xlsx.readFile(fullPath);
    const fileKey = fileName.replace('.xlsx', '');
    processedData[fileKey] = [];

    // Skip the first "Descriptions" sheet usually
    const sheets = workbook.SheetNames.filter(name => !name.toLowerCase().includes('description'));

    sheets.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        // Header: 1 returns array of arrays
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        rows.forEach((row) => {
            // Column mapping varies by sheet type
            let nameIndex = 4; // Default for Coils usually
            let unitIndex = 5;

            if (sheetName.toLowerCase().includes('input register')) {
                nameIndex = 6;
                unitIndex = 7; // Assuming unit is after name
            }

            // Additional check for "Holding register" if needed, but let's stick to observed

            if (row.length >= 5 && typeof row[1] === 'number') {
                const extractedName = row[nameIndex];
                if (typeof extractedName === 'string') {
                    processedData[fileKey].push({
                        sheet: sheetName,
                        register: row[1],
                        name: extractedName,
                        category: typeof row[0] === 'string' ? row[0] : null,
                        function: row[3] || null,
                        unit: row[unitIndex] || null
                    });
                }
            }
        });
    });

    console.log(`  > Extracted ${processedData[fileKey].length} registers.`);
}

filesToProcess.forEach(processFile);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedData, null, 2));
console.log(`\nConversion complete. Saved to: ${OUTPUT_FILE}`);
