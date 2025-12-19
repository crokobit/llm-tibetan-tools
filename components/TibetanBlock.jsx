import React, { useState } from 'react';
import LineRenderer from './LineRenderer.jsx';
import DebugBlockEditor from './DebugBlockEditor.jsx';
import { useAuth } from '../contexts/index.jsx';
import { disambiguateVerbs } from '../utils/api.js';
import { enrichAnalysis, lookupVerb } from '../utils/verbLookup.js'; // Added imports

export default function TibetanBlock({ block, blockIdx, onUpdate, editingTarget, showDebug, onAnalyze, isAnalyzing, onDelete, onSplit }) {
    const [inputText, setInputText] = React.useState('');
    const [isResolving, setIsResolving] = useState(false);
    const [splitMenuLineIdx, setSplitMenuLineIdx] = useState(null);
    const { token } = useAuth();

    if (block._isInputMode) {
        return (
            <div className="tibetan-input-block p-4 border rounded-lg bg-white shadow-sm">
                <div className="tibetan-input-header">
                    <span className="tibetan-input-label">Tibetan Input</span>
                    <button
                        className="btn-delete-block"
                        onClick={onDelete}
                        title="Delete this block"
                    >
                        ✕
                    </button>
                </div>
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

    // --- Resolve Verbs Logic ---
    const getVerbsToPolish = () => {
        const verbs = [];

        const traverse = (unit, lineIdx, unitIdx, path = []) => {
            // Check current unit
            let details = unit.analysis?.verbDetails;

            // Legacy Data Support: If details are missing, try dynamic lookup
            if (!details || details.length === 0) {
                if (unit.analysis && (unit.analysis.root || unit.original)) {
                    const matches = lookupVerb(unit.analysis.root || unit.original);
                    if (matches && matches.length > 0) {
                        details = matches; // Found it!
                    }
                }
            }

            if (details && details.length > 0) {
                // Check if already polished AND is a verb (v, vd, vnd)
                const posStr = unit.analysis.pos || '';
                const posType = posStr.split(',')[0].split('|')[0]; // Extract primary POS type
                const isVerb = ['v', 'vd', 'vnd'].includes(posType);

                if (!unit.analysis.isPolished && isVerb) {
                    verbs.push({
                        lineIdx,
                        unitIdx,
                        unit,
                        dynamicDetails: details,
                        nestedPath: path
                    });
                }
            }

            // Recurse into nestedData
            if (unit.nestedData && unit.nestedData.length > 0) {
                unit.nestedData.forEach((child, childIdx) => {
                    traverse(child, lineIdx, unitIdx, [...path, childIdx]);
                });
            }
        };

        block.lines.forEach((line, lineIdx) => {
            line.units.forEach((unit, unitIdx) => {
                traverse(unit, lineIdx, unitIdx, []);
            });
        });
        return verbs;
    };

    const handleResolveVerbs = async () => {
        const targets = getVerbsToPolish();
        if (targets.length === 0) return;

        setIsResolving(true);
        try {
            // Split into Ambiguous and Unambiguous
            const ambiguous = [];
            const unambiguous = [];
            const newBlock = JSON.parse(JSON.stringify(block));
            let updateCount = 0;

            targets.forEach(t => {
                const details = t.dynamicDetails || t.unit.analysis.verbDetails;
                if (details.length === 1) unambiguous.push({ ...t, details });
                else ambiguous.push({ ...t, details });
            });

            // Helper to get unit by path
            const getUnitByPath = (rootUnit, path) => {
                let current = rootUnit;
                for (const idx of path) {
                    if (current && current.nestedData && current.nestedData[idx]) {
                        current = current.nestedData[idx];
                    } else {
                        return null;
                    }
                }
                return current;
            };

            // Helper to calculate offset of a nested unit relative to its root
            const getNestedOffset = (rootUnit, path) => {
                let offset = 0;
                let current = rootUnit;
                for (const idx of path) {
                    if (current.nestedData) {
                        for (let i = 0; i < idx; i++) {
                            offset += current.nestedData[i].original.length;
                        }
                        current = current.nestedData[idx];
                    }
                }
                return offset;
            };

            // 1. Handle Unambiguous (Auto-Apply)
            unambiguous.forEach(t => {
                const { lineIdx, unitIdx, details, nestedPath } = t;
                const rootUnit = newBlock.lines[lineIdx].units[unitIdx];
                const unit = nestedPath.length > 0 ? getUnitByPath(rootUnit, nestedPath) : rootUnit;

                if (!unit) return;

                // Ensure details are saved to unit if they were dynamic
                unit.analysis.verbDetails = details;

                const option = details[0];

                // Update and Mark Polished
                // unit.analysis.definition = option.definition; // Stop overwriting definition
                unit.analysis.root = option.original_word;

                // Map Tense: Present (default, usually empty), Past->past, Future->future, Imperative->imp
                // System uses: past, imp, future
                let tenseVal = '';
                if (option.tense === 'Past') tenseVal = 'past';
                else if (option.tense === 'Future') tenseVal = 'future';
                else if (option.tense === 'Imperative') tenseVal = 'imp';

                unit.analysis.tense = tenseVal;
                unit.analysis.hon = option.hon;
                unit.analysis.verbId = option.id;
                unit.analysis.isPolished = true;
                updateCount++;
            });

            // 2. Handle Ambiguous (LLM)
            if (ambiguous.length > 0) {
                // Construct Full Text Context
                let fullText = '';
                const itemMap = [];

                block.lines.forEach((line, lIdx) => {
                    line.units.forEach((unit, uIdx) => {
                        const currentText = unit.original;

                        // Find all targets in this root unit
                        const rootTargets = ambiguous.filter(t => t.lineIdx === lIdx && t.unitIdx === uIdx);

                        rootTargets.forEach(target => {
                            const offsetInRoot = target.nestedPath.length > 0 ? getNestedOffset(unit, target.nestedPath) : 0;
                            const globalOffset = fullText.length + offsetInRoot;
                            const targetUnit = target.nestedPath.length > 0 ? getUnitByPath(unit, target.nestedPath) : unit;

                            if (targetUnit) {
                                itemMap.push({
                                    id: `target-${lIdx}-${uIdx}-${target.nestedPath.join('-')}`,
                                    indexInText: globalOffset,
                                    original: targetUnit.original,
                                    verbOptions: target.details,
                                    lineIdx: lIdx,
                                    unitIdx: uIdx,
                                    nestedPath: target.nestedPath
                                });
                            }
                        });

                        fullText += currentText;
                    });
                    fullText += '\\n';
                });

                const result = await disambiguateVerbs(token, fullText, itemMap);

                if (result && result.results) {
                    result.results.forEach(res => {
                        const item = itemMap.find(i => i.id === res.id);
                        if (item) {
                            const { lineIdx, unitIdx, verbOptions, nestedPath } = item;
                            const rootUnit = newBlock.lines[lineIdx].units[unitIdx];
                            const unit = nestedPath.length > 0 ? getUnitByPath(rootUnit, nestedPath) : rootUnit;

                            if (!unit) return;

                            // Save details to stored unit
                            unit.analysis.verbDetails = verbOptions;

                            const selectedOption = verbOptions[res.selectedIndex];

                            if (selectedOption) {
                                // unit.analysis.definition = selectedOption.definition; // Stop overwriting definition
                                unit.analysis.root = selectedOption.original_word;

                                // Map Tense
                                let tenseVal = '';
                                if (selectedOption.tense === 'Past') tenseVal = 'past';
                                else if (selectedOption.tense === 'Future') tenseVal = 'future';
                                else if (selectedOption.tense === 'Imperative') tenseVal = 'imp';

                                unit.analysis.tense = tenseVal;
                                unit.analysis.hon = selectedOption.hon;
                                unit.analysis.verbId = selectedOption.id;
                                unit.analysis.isPolished = true;
                                updateCount++;
                            }
                        }
                    });
                }
            }

            if (updateCount > 0) {
                onUpdate(blockIdx, newBlock);
            }

        } catch (error) {
            console.error("Failed to resolve verbs:", error);
            alert(`Polsihing Failed: ${error.message}. Please check if the backend is deployed and API keys are set.`);
        } finally {
            setIsResolving(false);
        }
    };

    const verbsToPolishCount = getVerbsToPolish().length;

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

            // Prevent overlapping with other ANALYSIS units
            if (nextUnit.type !== 'text') return;

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

            // Loop to remove trailing tshegs or spaces
            while ((charsToKeep.endsWith('་') || /^\s$/.test(charsToKeep.slice(-1))) && charsToKeep.length > 0) {
                // Remove one more!
                let charToRemove = charsToKeep.slice(-1);
                charsToMove = charToRemove + charsToMove;
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
                // USER REQUEST: Forbid overlapping/merging with analysis units.
                // Fall through to create new text unit instead.

                // Create new text unit (Duplicate logic as below, or just break/modify condition)
                const newTextUnit = {
                    type: 'text',
                    original: charsToMove
                };
                line.units.splice(unitIdx + 1, 0, newTextUnit);

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
            {/* Block Toolbar */}
            {!block._isInputMode && verbsToPolishCount > 0 && (
                <div className="flex justify-end mb-2 px-2">
                    <button
                        onClick={handleResolveVerbs}
                        disabled={isResolving}
                        className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded hover:bg-indigo-200 transition-colors flex items-center gap-2"
                        title={`Found ${verbsToPolishCount} verbs to polish`}
                    >
                        {isResolving ? (
                            <>
                                <span className="animate-spin text-lg">⟳</span> Polishing...
                            </>
                        ) : (
                            <>
                                <span>✨</span> Polish Verbs (AI) ({verbsToPolishCount})
                            </>
                        )}
                    </button>
                </div>
            )}

            {block.lines.map((line, lineIdx) => (
                <div key={lineIdx} className="line-wrapper">
                    <LineRenderer
                        line={line}
                        blockIdx={blockIdx}
                        lineIdx={lineIdx}
                        editingTarget={editingTarget}
                        isAnyEditActive={!!editingTarget}
                        onResize={handleResize}
                    />
                    {/* Subtle split divider - only between lines, not after last */}
                    {block.lines.length > 1 && lineIdx < block.lines.length - 1 && onSplit && (
                        <div className="line-split-divider-container">
                            <div
                                className="line-split-divider"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSplitMenuLineIdx(splitMenuLineIdx === lineIdx ? null : lineIdx);
                                }}
                                title="Click to split block here"
                            />
                            {/* Context menu for split */}
                            {splitMenuLineIdx === lineIdx && (
                                <div className="split-context-menu">
                                    <button
                                        className="split-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSplit(lineIdx);
                                            setSplitMenuLineIdx(null);
                                        }}
                                    >
                                        ✂ Split block here
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
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
