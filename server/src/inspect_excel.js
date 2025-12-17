import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../../');
const fileName = 'agc-150-modbus-server-tables-4189341212-uk.xlsx';

const workbook = xlsx.readFile(path.join(rootDir, fileName));
const firstSheetName = workbook.SheetNames[0];
console.log('Sheets:', workbook.SheetNames);

// Try the second sheet usually containing data
const dataSheetName = workbook.SheetNames[1];
const sheet = workbook.Sheets[dataSheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log(`Sheet: ${dataSheetName}`);
console.log(JSON.stringify(data.slice(0, 15), null, 2));
