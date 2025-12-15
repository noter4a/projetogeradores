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
            // Heuristic based on inspection:
            // Col 1: Register Address (Number)
            // Col 4: Name (String)
            // We ensure row has enough length and Col 1 is a valid number
            if (row.length >= 5 && typeof row[1] === 'number' && typeof row[4] === 'string') {
                processedData[fileKey].push({
                    sheet: sheetName,
                    register: row[1],
                    name: row[4],
                    category: typeof row[0] === 'string' ? row[0] : null,
                    function: row[3] || null,
                    unit: row[5] || null // Sometimes units are in col 5 or 6? Just explicitly capturing for safety, though inspection showed null often
                });
            }
        });
    });

    console.log(`  > Extracted ${processedData[fileKey].length} registers.`);
}

filesToProcess.forEach(processFile);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedData, null, 2));
console.log(`\nConversion complete. Saved to: ${OUTPUT_FILE}`);
