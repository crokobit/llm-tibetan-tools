
import DocumentParser from './logic/DocumentParser.js';
import fs from 'fs';

const text = fs.readFileSync('test_plain_text.txt', 'utf8');
const blocks = DocumentParser.parse(text);

const block = blocks[0]; // Assuming first block
const line2 = block.lines[1]; // Line 2 (index 1)

console.log("Line 2 units:");
line2.units.forEach((u, i) => {
    console.log(`Unit ${i}: type=${u.type}, original='${u.original}'`);
    if (u.nestedData) {
        console.log(`  Nested:`, u.nestedData.map(n => n.original));
    }
});
