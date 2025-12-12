import React from 'react';
import LineRenderer from './LineRenderer.jsx';
import DebugBlockEditor from './DebugBlockEditor.jsx';

export default function TibetanBlock({ block, blockIdx, onUpdate, editingTarget, showDebug, onAnalyze, isAnalyzing }) {
    const [inputText, setInputText] = React.useState('');

    if (block._isInputMode) {
        return (
            <div className="tibetan-input-block p-4 border rounded-lg bg-white shadow-sm">
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste Tibetan text here..."
                    className="w-full h-32 p-3 border rounded mb-3 font-tibetan text-lg"
                    disabled={isAnalyzing}
                />
                <div className="flex justify-end">
                    <button
                        onClick={() => onAnalyze(blockIdx, inputText)}
                        disabled={!inputText.trim() || isAnalyzing}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                        {isAnalyzing ? 'Analyzing...' : 'ANALYSIS'}
                    </button>
                </div>
            </div>
        );
    }

    const handleResize = (lineIdx, unitIdx, direction) => {
        // Create a deep copy of the block to modify
        const newBlock = JSON.parse(JSON.stringify(block));
        const line = newBlock.lines[lineIdx];
        const unit = line.units[unitIdx];
        const nextUnit = line.units[unitIdx + 1];

        // Helper to get the last nested unit (or supplementary)
        const getLastNestedUnit = (u) => {
            if (u.nestedData && u.nestedData.length > 0) return u.nestedData[u.nestedData.length - 1];
            // if (u.supplementaryData && u.supplementaryData.length > 0) return u.supplementaryData[u.supplementaryData.length - 1]; // Supp not usually editable text-wise
            return null;
        };

        const getFirstNestedUnit = (u) => {
            if (u.nestedData && u.nestedData.length > 0) return u.nestedData[0];
            return null;
        }

        // Direction +1: Expand (take from right)
        if (direction > 0) {
            // Check if there is a next unit to take from
            if (!nextUnit) return;

            // Determine chars to move
            let charsToMove = '';

            if (nextUnit.type === 'text') {
                // Check if next char is tsheg
                if (nextUnit.original.charAt(0) === '་') {
                    // If it's a tsheg, try to take it AND the next char
                    if (nextUnit.original.length > 1) {
                        charsToMove = nextUnit.original.substring(0, 2);
                    } else {
                        // Only tsheg available? Take it. 
                        // Logic: if only tsheg is left, we take it. 
                        // But wait, if we take it, we end in tsheg.
                        // Maybe we shouldn't take it if it's ONLY tsheg? 
                        // Or maybe we take it and hope next time we take more?
                        // User says "exclude situation that ་ is the end".
                        // If we take it, it becomes end.
                        // So we should NOT take it unless we can take more?
                        // BUT what if next unit is another word?
                        // Let's assume we take 2 chars if first is tsheg.
                        charsToMove = nextUnit.original.substring(0, 2);
                    }
                } else {
                    charsToMove = nextUnit.original.charAt(0);
                }

                if (!charsToMove) return;

                nextUnit.original = nextUnit.original.slice(charsToMove.length);

                // If next unit is empty and is plain text, remove it
                if (nextUnit.original.length === 0) {
                    line.units.splice(unitIdx + 1, 1);
                }
            } else {
                // Next unit is analyzed word
                // Logic: take first char. If tsheg, take 2?
                // Analyzed words usually start with root letter.
                // But just in case.
                if (nextUnit.original.charAt(0) === '་') {
                    charsToMove = nextUnit.original.substring(0, 2);
                } else {
                    charsToMove = nextUnit.original.charAt(0);
                }

                if (!charsToMove) return;

                // Also remove from its nested structure if applicable
                // This is getting complex with tsheg skipping.
                // Simplified: Remove N chars from start of nested/original
                let charsToRemoveCount = charsToMove.length;

                // Remove from nested
                // We might need to remove from multiple nested units if we take 2 chars?
                // Assuming nested structure follows original roughly.
                // Let's iterate helper
                const consumeFromNested = (count) => {
                    if (!nextUnit.nestedData) return;
                    let remaining = count;
                    while (remaining > 0 && nextUnit.nestedData.length > 0) {
                        const first = nextUnit.nestedData[0];
                        if (first.original.length <= remaining) {
                            remaining -= first.original.length;
                            nextUnit.nestedData.shift();
                        } else {
                            first.original = first.original.slice(remaining);
                            remaining = 0;
                        }
                    }
                }
                consumeFromNested(charsToRemoveCount);

                nextUnit.original = nextUnit.original.slice(charsToRemoveCount);

                if (nextUnit.original.length === 0) {
                    // Start undo/restore logic if needed, but for now allow empty->delete if implemented
                    // or just return to prevent total deletion if unsafe
                    // unit.original = unit.original.slice(0, -charsToRemoveCount); // Undo
                    // return;
                }
            }

            // Move to current unit
            unit.original += charsToMove;

            // Also add to current unit's last nested child
            const lastNested = getLastNestedUnit(unit);
            if (lastNested) {
                lastNested.original += charsToMove;
            }

        }
        // Direction -1: Shorten (give to right)
        else if (direction < 0) {
            if (unit.original.length <= 1) return; // Don't make it empty

            // Determine chars to move (remove from end)
            let charsToMove = '';
            let charsToKeep = unit.original;

            // Last char
            let char1 = unit.original.slice(-1);
            charsToMove = char1;
            charsToKeep = unit.original.slice(0, -1);

            // Checks if NEW end is tsheg
            if (charsToKeep.endsWith('་') && charsToKeep.length > 0) {
                // Remove one more!
                let char2 = charsToKeep.slice(-1);
                charsToMove = char2 + charsToMove;
                charsToKeep = charsToKeep.slice(0, -1);
            }

            // Verify we aren't emptying it completely if forbidden
            if (charsToKeep.length === 0) return;

            unit.original = charsToKeep;

            // Adjust nested data (remove from end)
            const removeFromEndNested = (count) => {
                if (!unit.nestedData) return;
                let remaining = count;
                while (remaining > 0 && unit.nestedData.length > 0) {
                    const last = unit.nestedData[unit.nestedData.length - 1];
                    if (last.original.length <= remaining) {
                        remaining -= last.original.length;
                        unit.nestedData.pop();
                    } else {
                        last.original = last.original.slice(0, -remaining);
                        remaining = 0;
                    }
                }
            }
            removeFromEndNested(charsToMove.length);


            // Check next unit
            if (nextUnit && nextUnit.type === 'text') {
                // Prepend to next text unit
                nextUnit.original = charsToMove + nextUnit.original;
            } else if (nextUnit && nextUnit.type !== 'text') {
                // Prepend to next analyzed unit
                nextUnit.original = charsToMove + nextUnit.original;

                // Prepend to first nested of next unit
                // We need to add to the first nested unit. If it doesn't exist?
                let firstNested = getFirstNestedUnit(nextUnit);
                if (!firstNested) {
                    // Create one? Or if missing just ignore?
                    // If nextUnit is analyzed, it should have nested/supplementary or we treat original.
                } else {
                    firstNested.original = charsToMove + firstNested.original;
                }
            } else {
                // Create new text unit
                const newTextUnit = {
                    type: 'text',
                    original: charsToMove
                };
                line.units.splice(unitIdx + 1, 0, newTextUnit);
            }
        }

        onUpdate(blockIdx, newBlock);
    };

    return (
        <div className="block-layout">

            {block.lines.map((line, lineIdx) => (
                <LineRenderer
                    key={lineIdx}
                    line={line}
                    blockIdx={blockIdx}
                    lineIdx={lineIdx}
                    editingTarget={editingTarget}
                    isAnyEditActive={!!editingTarget}
                    onResize={handleResize}
                />
            ))}
            {showDebug && (
                <DebugBlockEditor
                    block={block}
                    onUpdate={(newBlock) => onUpdate(blockIdx, newBlock)}
                />
            )}
        </div>
    );
}
