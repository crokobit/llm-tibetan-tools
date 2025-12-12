import RegexGrammar from './RegexGrammar.js';

import AnalysisParser from './AnalysisParser.js';
import DocumentParser from './DocumentParser.js';

export default class ResponseProcessor {
    static process(responseText) {
        const blocks = [];
        let match;

        // Reset regex state
        RegexGrammar.BLOCK.lastIndex = 0;

        while ((match = RegexGrammar.BLOCK.exec(responseText)) !== null) {
            const rawText = match[1].trim();
            const analysisText = match[2].trim();

            // Delegate to DocumentParser which handles merging Raw Text (with punctuation) and Analysis
            const { lines } = DocumentParser._processBlock(rawText, analysisText);

            blocks.push({
                type: 'tibetan',
                lines: lines,
                _showDebug: true // Show debug by default for new analysis
            });

            blocks.push({
                type: 'tibetan',
                lines: lines,
                _showDebug: true // Show debug by default for new analysis
            });
        }

        return blocks;
    }
}
