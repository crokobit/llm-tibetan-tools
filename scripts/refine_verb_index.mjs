
import fs from 'fs';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'utils/tibetan_verb_index.json');

// Guidelines for honorifics
const HONORIFIC_KEYWORDS = ['敬语', 'honorific', '尊', '雅语']; // Add more if needed

async function refineIndex() {
    console.log(`Reading index from ${INDEX_PATH}...`);
    const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
    const data = JSON.parse(raw);
    let updatedCount = 0;

    for (const key in data) {
        const entries = data[key];
        entries.forEach(entry => {
            let isHon = entry.hon;

            // Check definition for keywords
            if (entry.definition) {
                const def = entry.definition;
                const hasHonKeyword = HONORIFIC_KEYWORDS.some(kw => def.includes(kw));

                if (hasHonKeyword && !isHon) {
                    entry.hon = true;
                    console.log(`[UPDATE] ${entry.original_word} (${entry.tense}): Marked as HON based on definition.`);
                    updatedCount++;
                }
            }
        });
    }

    if (updatedCount > 0) {
        fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2));
        console.log(`Updated ${updatedCount} entries.`);
    } else {
        console.log("No new honorific entries found based on current keywords.");
    }
}

refineIndex();
