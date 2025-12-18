import React, { createContext, useState, useContext } from 'react';
import { useDocument } from './DocumentContext.jsx';

const EditContext = createContext();

/**
 * Provider for editing operations (save, delete, close).
 * Manages the editing state and all edit-related logic.
 */
export function EditProvider({ children }) {
    const { documentData, setDocumentData } = useDocument();
    const [editingTarget, setEditingTarget] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);


    const handleUnitClick = (event, blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType) => {
        // Calculate anchor rect from the event target
        const rect = event.currentTarget.getBoundingClientRect();
        setAnchorRect(rect);

        const isSub = subIndex !== null && subIndex !== undefined;

        // Construct target object
        const target = {
            indices: { blockIdx, lineIdx, unitIdx, subIndex },
            isCreating: false, // Default to editing existing
            unit: subUnit, // The specific unit being edited (main or sub)
            parentUnit: null // Will be filled if needed
        };

        // Check if we're editing a unit that has no analysis
        if (isSub) {
            if (!subUnit.analysis) {
                target.isCreating = true;
            }
        } else {
            if (!subUnit.analysis) {
                target.isCreating = true;
            }
        }

        setEditingTarget(target);
    };

    const handleSaveEdit = (data, parentMode, shouldClose = true) => {
        if (!editingTarget) return;

        const { blockIdx, lineIdx, unitIdx, subIndex } = editingTarget.indices;
        const newData = [...documentData];
        const line = newData[blockIdx].lines[lineIdx];
        const unit = line.units[unitIdx];

        if (editingTarget.isCreating) {
            // Creating new analysis
            const { selectedText, startOffset } = editingTarget.creationDetails;
            const analysis = {
                volls: data.volls,
                pos: data.pos,
                root: data.root,
                tense: data.tense,
                definition: data.definition,
                verbId: data.verbId,
                isPolished: !!data.verbId
            };

            const newUnit = {
                type: 'word',
                original: selectedText,
                analysis: analysis,
                nestedData: [],
                supplementaryData: []
            };

            if (parentMode === 'main') {
                // Split the current text unit into [before, new, after]
                const originalText = unit.original;
                const before = originalText.substring(0, startOffset);
                const after = originalText.substring(startOffset + selectedText.length);

                const newUnits = [];
                if (before) newUnits.push({ type: 'text', original: before });
                newUnits.push(newUnit);
                if (after) newUnits.push({ type: 'text', original: after });

                // Replace the old unit with new units
                line.units.splice(unitIdx, 1, ...newUnits);

            } else if (parentMode === 'sub') {
                // Adding sub-analysis to an existing word
                if (!unit.nestedData || unit.nestedData.length === 0) {
                    // Initial split
                    const originalText = unit.original;
                    const before = originalText.substring(0, startOffset);
                    const after = originalText.substring(startOffset + selectedText.length);

                    unit.nestedData = [];
                    if (before) unit.nestedData.push({ type: 'text', original: before });
                    unit.nestedData.push(newUnit);
                    if (after) unit.nestedData.push({ type: 'text', original: after });
                } else {
                    // Insert into existing nestedData
                    let currentOffset = 0;
                    for (let i = 0; i < unit.nestedData.length; i++) {
                        const sub = unit.nestedData[i];
                        const len = sub.original.length;
                        if (startOffset >= currentOffset && startOffset < currentOffset + len) {
                            // Found the target sub-unit
                            const relStart = startOffset - currentOffset;
                            const before = sub.original.substring(0, relStart);
                            const after = sub.original.substring(relStart + selectedText.length);

                            const replacements = [];
                            if (before) replacements.push({ type: 'text', original: before });
                            replacements.push(newUnit);
                            if (after) replacements.push({ type: 'text', original: after });

                            unit.nestedData.splice(i, 1, ...replacements);
                            break;
                        }
                        currentOffset += len;
                    }
                }
            }

        } else {
            // Editing existing analysis
            if (subIndex !== null && subIndex !== undefined) {
                // Editing sub-unit
                const subUnit = unit.nestedData[subIndex];
                if (data.text !== undefined) {
                    subUnit.original = data.text;
                }
                subUnit.analysis = {
                    ...subUnit.analysis,
                    volls: data.volls,
                    pos: data.pos,
                    root: data.root,
                    tense: data.tense,
                    definition: data.definition,
                    verbId: data.verbId,
                    isPolished: !!data.verbId
                };
            } else {
                // Editing main unit
                if (data.text !== undefined) {
                    unit.original = data.text;
                }
                unit.analysis = {
                    ...unit.analysis,
                    volls: data.volls,
                    pos: data.pos,
                    root: data.root,
                    tense: data.tense,
                    definition: data.definition,
                    verbId: data.verbId,
                    isPolished: !!data.verbId
                };
            }
        }

        setDocumentData(newData);
        if (shouldClose) {
            setEditingTarget(null);
        }
    };

    const handleDeleteAnalysis = () => {
        if (!editingTarget || editingTarget.isCreating) return;

        const { blockIdx, lineIdx, unitIdx, subIndex } = editingTarget.indices;
        const newData = [...documentData];
        const line = newData[blockIdx].lines[lineIdx];
        const unit = line.units[unitIdx];

        if (subIndex !== null && subIndex !== undefined) {
            // Deleting sub-analysis
            const subUnit = unit.nestedData[subIndex];
            delete subUnit.analysis;
            subUnit.type = 'text'; // Revert to text

            // Merge adjacent text units in nestedData
            const newNested = [];
            unit.nestedData.forEach(u => {
                if (newNested.length > 0 && newNested[newNested.length - 1].type === 'text' && u.type === 'text') {
                    newNested[newNested.length - 1].original += u.original;
                } else {
                    newNested.push(u);
                }
            });
            unit.nestedData = newNested;

        } else {
            // Deleting main analysis
            delete unit.analysis;
            unit.type = 'text';
            unit.nestedData = [];
        }

        // Global merge pass for the line
        const mergedUnits = [];
        line.units.forEach(u => {
            if (mergedUnits.length > 0 && mergedUnits[mergedUnits.length - 1].type === 'text' && u.type === 'text') {
                mergedUnits[mergedUnits.length - 1].original += u.original;
            } else {
                mergedUnits.push(u);
            }
        });
        line.units = mergedUnits;

        setDocumentData(newData);
        setEditingTarget(null);
    };

    const handleCloseEdit = () => {
        setEditingTarget(null);
    };

    const value = {
        editingTarget,
        setEditingTarget,
        anchorRect,
        setAnchorRect,
        handleUnitClick,
        handleSaveEdit,
        handleDeleteAnalysis,
        handleCloseEdit
    };

    return (
        <EditContext.Provider value={value}>
            {children}
        </EditContext.Provider>
    );
}

/**
 * Custom hook to access edit context.
 * @returns {Object} Edit context value
 */
export function useEdit() {
    const context = useContext(EditContext);
    if (!context) {
        throw new Error('useEdit must be used within EditProvider');
    }
    return context;
}
