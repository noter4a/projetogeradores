const fs = require('fs');
const alarms = JSON.parse(fs.readFileSync('alarms_parsed.json', 'utf8'));

const out = {};
for (const a of alarms) {
    if (!out[a.address]) out[a.address] = [];
    let shift = 0;
    if (a.bits === "13/16-16/16") shift = 12;
    else if (a.bits === "9/16-12/16") shift = 8;
    else if (a.bits === "5/16-8/16") shift = 4;
    else if (a.bits === "1/16-4/16") shift = 0;

    out[a.address].push({ name: a.name, shift });
}

let jsCode = "const ALARM_DEFS = {\n";
for (const [addr, list] of Object.entries(out)) {
    jsCode += `  ${addr}: [\n`;
    for (const item of list) {
        jsCode += `    { name: "${item.name}", shift: ${item.shift} },\n`;
    }
    jsCode += `  ],\n`;
}
jsCode += "};\n";

fs.writeFileSync('alarm_table.js', jsCode);
console.log('Saved to alarm_table.js');
