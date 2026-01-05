
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust path to point to the file in the parent directory
const filePath = path.join(__dirname, '../../agc-150-modbus-server-tables-4189341212-uk.xlsx');

try {
    console.log(`Reading file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Assume data is in first sheet
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays

    console.log(`Searching for "Breaker" or "Mains" or "Generator"...`);

    data.forEach((row, index) => {
        const rowStr = JSON.stringify(row).toLowerCase();
        if (rowStr.includes('breaker') || rowStr.includes('mains') || rowStr.includes('generator')) {
            // Filter for relevant status keywords
            if (rowStr.includes('status') || rowStr.includes('feedback') || rowStr.includes('open') || rowStr.includes('closed')) {
                console.log(`Row ${index + 1}:`, row);
            }
        }
    });

} catch (err) {
    console.error("Error reading file:", err.message);
}
