import RegexGrammar from './RegexGrammar.js';
import AnalysisParser from './AnalysisParser.js';

export default class ResponseProcessor {
    static process(responseText) {
        const blocks = [];
        let match;

        // Reset regex state
        RegexGrammar.BLOCK.lastIndex = 0;

        while ((match = RegexGrammar.BLOCK.exec(responseText)) !== null) {
            const rawText = match[1].trim();
            const analysisText = match[2].trim();

            // Parse analysis text into word nodes
            const wordNodes = AnalysisParser.parseDebugText(analysisText);

            // Create lines structure for TibetanBlock
            // We need to reconstruct lines from the raw text or analysis
            // For simplicity, we can try to rehydrate based on the word nodes
            // But AnalysisParser.rehydrateBlock expects original lines.

            // Since this is new content, we construct a fresh block structure.
            // We can assume each top-level node in wordNodes corresponds to a word.
            // We need to group them into lines.
            // If the raw text has newlines, we should respect them.

            // However, AnalysisParser.parseDebugText returns a flat list of roots (or nested).
            // Let's assume for now we put everything in one line or split by some logic.
            // But wait, the prompt says "以「偈頌」(Stanza) 為單位".

            // Let's create a simple line structure where all words are in one line for now,
            // or try to split if we detect newlines in the raw text.

            const lines = [];
            let currentLineUnits = [];

            // A simple heuristic: just put all parsed words into one line for the block.
            // Or better, if we can map them back to raw text lines.

            // Let's just put them all in one line for the MVP.
            // The TibetanBlock will render them.
            // If we want to support multiple lines, we'd need to parse the rawText for newlines
            // and try to distribute the wordNodes.

            // For now: Single line per block.
            lines.push({
                units: wordNodes
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
