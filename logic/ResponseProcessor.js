import RegexGrammar from './RegexGrammar.js';

import AnalysisParser from './AnalysisParser.js';
import DocumentParser from './DocumentParser.js';

export default class ResponseProcessor {
    // Regex to match rich text blocks: <RICHTEXT>...</RICHTEXT>
    static RICHTEXT_BLOCK = /<RICHTEXT>\s*([\s\S]*?)\s*<\/RICHTEXT>/g;

    static process(responseText) {
        const blocks = [];

        // Find all block matches with their positions
        const allMatches = [];

        // Find Tibetan blocks
        RegexGrammar.BLOCK.lastIndex = 0;
        let match;
        while ((match = RegexGrammar.BLOCK.exec(responseText)) !== null) {
            allMatches.push({
                type: 'tibetan',
                index: match.index,
                rawText: match[1].trim(),
                analysisText: match[2].trim()
            });
        }

        // Find Rich Text blocks
        ResponseProcessor.RICHTEXT_BLOCK.lastIndex = 0;
        while ((match = ResponseProcessor.RICHTEXT_BLOCK.exec(responseText)) !== null) {
            allMatches.push({
                type: 'richtext',
                index: match.index,
                content: match[1].trim()
            });
        }

        // Sort by position in source text to maintain order
        allMatches.sort((a, b) => a.index - b.index);

        // Process each match in order
        for (const m of allMatches) {
            if (m.type === 'tibetan') {
                const { lines } = DocumentParser._processBlock(m.rawText, m.analysisText);
                blocks.push({
                    type: 'tibetan',
                    lines: lines,
                    _showDebug: false
                });
            } else if (m.type === 'richtext') {
                blocks.push({
                    type: 'richtext',
                    content: m.content
                });
            }
        }

        return blocks;
    }
}
