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

            // Determine where to take from
            let charToMove = '';

            if (nextUnit.type === 'text') {
                charToMove = nextUnit.original.charAt(0);
                if (!charToMove) return;
                nextUnit.original = nextUnit.original.slice(1);

                // If next unit is empty and is plain text, remove it
                if (nextUnit.original.length === 0) {
                    line.units.splice(unitIdx + 1, 1);
                }
            } else {
                // Next unit is analyzed word
                // Take from it's original
                charToMove = nextUnit.original.charAt(0);
                if (!charToMove) return;

                // Also remove from its nested structure if applicable
                const firstNested = getFirstNestedUnit(nextUnit);
                if (firstNested) {
                    firstNested.original = firstNested.original.slice(1);
                    // If nested unit becomes empty? 
                    // Complex logic, for now simplistic: just modify original
                    // Ideally we should remove it if empty, but let's stick to modifying text
                    if (firstNested.original.length === 0) {
                        // remove first nested?
                        nextUnit.nestedData.shift();
                    }
                }
                nextUnit.original = nextUnit.original.slice(1);

                if (nextUnit.original.length === 0) {
                    // Prevent analyzed units from becoming completely empty for now
                    // Undo everything? Or just let it be empty?
                    // Previous logic: restore
                    // unit.original = unit.original.slice(0, -1); // Wait, we haven't added yet
                    // Just return
                    return;
                }
            }

            // Move to current unit
            unit.original += charToMove;

            // Also add to current unit's last nested child
            const lastNested = getLastNestedUnit(unit);
            if (lastNested) {
                lastNested.original += charToMove;
            }

        }
        // Direction -1: Shorten (give to right)
        else if (direction < 0) {
            if (unit.original.length <= 1) return; // Don't make it empty

            const charToMove = unit.original.slice(-1);
            unit.original = unit.original.slice(0, -1);

            // Allow shortening nested data
            const lastNested = getLastNestedUnit(unit);
            if (lastNested) {
                if (lastNested.original.length > 0) {
                    lastNested.original = lastNested.original.slice(0, -1);
                }
                // If becomes empty, could remove, but let's keep consistent with expand logic
            }

            // Check next unit
            if (nextUnit && nextUnit.type === 'text') {
                // Prepend to next text unit
                nextUnit.original = charToMove + nextUnit.original;
            } else if (nextUnit && nextUnit.type !== 'text') {
                // Prepend to next analyzed unit
                nextUnit.original = charToMove + nextUnit.original;
                const firstNested = getFirstNestedUnit(nextUnit);
                if (firstNested) {
                    firstNested.original = charToMove + firstNested.original;
                }
            } else {
                // Create new text unit
                const newTextUnit = {
                    type: 'text',
                    original: charToMove
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
