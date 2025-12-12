import RegexGrammar from './RegexGrammar.js';

export default class AnalysisParser {
    static parse(annotationString) {
        let content = annotationString;

        // Handle potential double bracketing if it exists, though regex should handle it
        if (content.startsWith('[') && content.endsWith(']')) {
            content = content.substring(1, content.length - 1);
        }

        if (content) content = content.split(';')[0].trim();

        let volls = '', pos = 'other', tense = '', root = '', definition = '';

        const match = content.match(RegexGrammar.ANALYSIS_CONTENT);

        if (match) {
            volls = match[1].trim();
            // Manually split content into POS and Tense, respecting parentheses
            // logic: split by first comma that is NOT inside parentheses
            const contentInner = match[2];
            let splitIndex = -1;
            let parenDepth = 0;

            for (let i = 0; i < contentInner.length; i++) {
                if (contentInner[i] === '(') parenDepth++;
                else if (contentInner[i] === ')') parenDepth--;
                else if (contentInner[i] === ',' && parenDepth === 0) {
                    splitIndex = i;
                    break;
                }
            }

            if (splitIndex !== -1) {
                pos = contentInner.substring(0, splitIndex).trim();
                tense = contentInner.substring(splitIndex + 1).trim();
            } else {
                pos = contentInner.trim();
                tense = '';
            }

            let rest = match[3].trim();

            // Attempt to separate Root from Definition
            // Assuming Root is Tibetan characters at the start
            const tibetanWordMatch = rest.match(/^([\u0F00-\u0FFF]+)/);
            if (tibetanWordMatch) {
                root = tibetanWordMatch[1].trim();
                definition = rest.substring(root.length).trim();
            } else {
                definition = rest;
            }
        } else {
            // Fallback if regex doesn't match (e.g. no {})
            definition = content.replace(/{[^}]+}/i, '').trim();
        }

        return { volls, pos, root, tense, definition };
    }

    static serialize(analysisObj, originalWord) {
        const { volls, root, pos, tense, definition } = analysisObj;

        const bString = `${pos || 'other'}${tense ? ',' + tense : ''}`;
        const c_and_d = `${root || ''} ${definition || ''}`.trim();

        let internalString = '';
        if (volls) {
            internalString = `${volls}{${bString}} ${c_and_d}`;
        } else {
            internalString = `{${bString}} ${c_and_d}`;
        }

        return internalString.replace(/\s+/g, ' ').trim();
    }

    static format(lines) {
        let output = '';
        lines.forEach(line => {
            line.units.forEach(unit => {
                if (unit.type === 'word') {
                    output += this._formatNode(unit, 0);
                }
            });
        });
        return output;
    }

    static _formatNode(node, depth) {
        let output = '';
        const indent = '\t'.repeat(depth);
        const analysisString = this.serialize(node.analysis, node.original);

        output += `${indent}<${node.original}>[${analysisString}]\n`;

        if (node.nestedData && node.nestedData.length > 0) {
            node.nestedData.forEach(child => {
                if (child.type === 'word') {
                    output += this._formatNode(child, depth + 1);
                }
            });
        }
        return output;
    }

    static parseDebugText(text) {
        const lines = text.split('\n').filter(l => l.trim());
        const roots = [];
        const stack = []; // Stores { node, depth }

        lines.forEach(line => {
            const match = line.match(RegexGrammar.ANALYSIS_LINE);
            if (!match) return;

            const depth = match[1].length;
            const original = match[2];
            const analysisString = match[3];

            const analysis = this.parse(analysisString);
            const node = {
                type: 'word',
                original: original,
                analysis: analysis,
                nestedData: []
            };

            // 3. Place in tree
            if (depth === 0) {
                roots.push(node);
                stack.length = 0; // Reset stack for new root
                stack.push({ node, depth });
            } else {
                // Find parent
                while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                    stack.pop();
                }

                if (stack.length > 0) {
                    const parent = stack[stack.length - 1].node;
                    parent.nestedData.push(node);
                    stack.push({ node, depth });
                } else {
                    // Fallback: treat as root if no parent found (shouldn't happen with valid indent)
                    roots.push(node);
                    stack.push({ node, depth });
                }
            }
        });

        return roots;
    }

    static rehydrateBlock(originalLines, newWordNodes) {
        const newLines = JSON.parse(JSON.stringify(originalLines)); // Deep clone
        const wordQueue = [...newWordNodes];

        newLines.forEach(line => {
            const newUnits = [];
            line.units.forEach(unit => {
                if (unit.type === 'word') {
                    if (wordQueue.length > 0) {
                        const newWord = wordQueue.shift();
                        newUnits.push(newWord);
                    } else {
                        // No more words in debug text, remove this word
                    }
                } else {
                    // Keep non-word units (punctuation, etc.)
                    newUnits.push(unit);
                }
            });
            line.units = newUnits;
        });

        // If leftovers, append to the last line
        if (wordQueue.length > 0) {
            const lastLine = newLines[newLines.length - 1];
            if (lastLine) {
                lastLine.units.push(...wordQueue);
            } else {
                // If block was empty, create a new line
                newLines.push({ units: wordQueue });
            }
        }

        return newLines;
    }
}
