import RegexGrammar from './RegexGrammar.js';
import AnalysisParser from './AnalysisParser.js';

export default class DocumentParser {
    static parse(fullText) {
        const blocks = [];
        const matches = [...fullText.matchAll(RegexGrammar.BLOCK)];

        if (matches.length === 0) {
            // Fallback: Treat entire text as raw text with no analysis if no blocks found
            if (fullText.trim().length > 0) {
                return [{ type: 'tibetan', lines: [{ units: [{ type: 'text', original: fullText }] }] }];
            }
            return [];
        }

        matches.forEach(match => {
            const rawText = match[1];
            const analysisText = match[2];
            const tibetanBlock = this._processBlock(rawText, analysisText);
            blocks.push({ type: 'tibetan', ...tibetanBlock });
        });

        return blocks;
    }

    static _processBlock(rawText, analysisText) {
        // 1. Parse Analysis Lines into a Hierarchy
        const analysisNodes = this._parseAnalysisHierarchy(analysisText);

        // 2. Merge Analysis with Raw Text
        const units = this._mergeAnalysisWithRaw(rawText, analysisNodes);

        // 3. Group into lines (preserving raw text newlines)
        const lines = [];
        let currentLineUnits = [];

        units.forEach(unit => {
            if (unit.type === 'text') {
                // Split text unit by newlines
                const parts = unit.original.split('\n');
                parts.forEach((part, idx) => {
                    if (idx > 0) {
                        // New line detected
                        lines.push({ units: currentLineUnits });
                        currentLineUnits = [];
                    }
                    if (part) {
                        currentLineUnits.push({ type: 'text', original: part });
                    }
                });
            } else {
                currentLineUnits.push(unit);
            }
        });

        if (currentLineUnits.length > 0) {
            lines.push({ units: currentLineUnits });
        }

        return { lines };
    }

    static _parseAnalysisHierarchy(analysisText) {
        const lines = analysisText.split('\n').filter(l => l.trim() !== '');
        const roots = [];
        const stack = []; // Stores { depth, node }

        lines.forEach(line => {
            const match = line.match(RegexGrammar.ANALYSIS_LINE);
            if (!match) return;

            const depth = match[1].length; // Number of tabs
            const original = match[2];
            const rawAnnotation = match[3];

            const node = {
                type: 'word',
                original,
                rawAnnotation,
                analysis: AnalysisParser.parse(rawAnnotation),
                nestedData: [],
                supplementaryData: []
            };

            // Find parent
            while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                stack.pop();
            }

            if (stack.length === 0) {
                roots.push(node);
            } else {
                const parent = stack[stack.length - 1].node;
                parent.nestedData.push(node);
            }

            stack.push({ depth, node });
        });

        // Post-process to fill gaps in nested data (e.g. tshegs)
        this._fillNestedGaps(roots);

        return roots;
    }

    static _fillNestedGaps(nodes) {
        nodes.forEach(node => {
            if (node.nestedData && node.nestedData.length > 0) {
                // Recursively fill gaps for children first
                this._fillNestedGaps(node.nestedData);

                // Now merge current node's original text with its children
                // This will insert 'text' units (like tshegs) between the analysis nodes
                node.nestedData = this._mergeAnalysisWithRaw(node.original, node.nestedData);
            }
        });
    }

    static _mergeAnalysisWithRaw(rawText, analysisNodes) {
        const units = [];
        let currentIndex = 0;

        analysisNodes.forEach(node => {
            // Find the node's original text in rawText starting from currentIndex
            const searchSpace = rawText.substring(currentIndex);
            const foundIndex = searchSpace.indexOf(node.original);

            if (foundIndex !== -1) {
                // Text before the match
                if (foundIndex > 0) {
                    const textBefore = searchSpace.substring(0, foundIndex);
                    units.push({ type: 'text', original: textBefore });
                }

                // The matched word
                units.push(node);

                // Advance index
                currentIndex += foundIndex + node.original.length;
            } else {
                console.warn(`Analysis node '${node.original}' not found in remaining text.`);
            }
        });

        // Remaining text
        if (currentIndex < rawText.length) {
            units.push({ type: 'text', original: rawText.substring(currentIndex) });
        }

        return units;
    }
}
