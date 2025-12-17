import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mapPath = path.join(__dirname, 'modbus_maps.json');
const rawData = fs.readFileSync(mapPath);
const maps = JSON.parse(rawData);

for (const key in maps) {
    const sheetData = maps[key];
    if (Array.isArray(sheetData)) {
        const inputSheet = sheetData.find(entry => entry.sheet === 'Input register (04)');
        // This find is wrong because sheetData IS the sheet content or array of rows?
        // inspect_excel output showed maps is object of keys -> array of rows.

        // Let's filter the rows where sheet property is 'Input register (04)'
        const inputRows = sheetData.filter(entry => entry.sheet === 'Input register (04)');

        if (inputRows.length > 0) {
            console.log(`Found ${inputRows.length} rows in ${key}`);
            console.log(JSON.stringify(inputRows.slice(0, 3), null, 2));
            break;
        }
    }
}
