const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(__dirname, '../sgc-120-mk-ii-modbus-tables-4189341403-uk (10).xlsx');
const workbook = xlsx.readFile(filePath);

const allData = {};
for (const sheetName of workbook.SheetNames) {
    allData[sheetName] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
}

fs.writeFileSync(path.join(__dirname, 'modbus_all.json'), JSON.stringify(allData, null, 2));
console.log('Dumped all sheets to modbus_all.json');
