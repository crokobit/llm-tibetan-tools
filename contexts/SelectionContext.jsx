import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useDocument } from './DocumentContext.jsx';
import { useEdit } from './EditContext.jsx'; // Need this to trigger analysis creation

const SelectionContext = createContext();

export function SelectionProvider({ children }) {
    const { documentData } = useDocument();
    const { setEditingTarget, setAnchorRect, editingTarget } = useEdit(); // Need this to trigger analysis creation
    const [selectionRange, setSelectionRange] = useState(null);
    const [selectMode, setSelectMode] = useState(false);

    // Helper to calculate true offset relative to the unit container
    const getTrueOffset = (container, node, offset) => {
        if (node === container) {
            // If the node is the container itself, the offset is the child index
            // We need to sum lengths of all text in children before this index
            let total = 0;
            for (let i = 0; i < offset; i++) {
                total += container.childNodes[i].textContent.length;
            }
            return total;
        }

        // Walk backwards from the node to find all preceding text within the container
        let total = 0;
        let current = node;

        // 1. Add offset within the current node
        if (current.nodeType === 3) {
            total += offset;
        } else {
            // Element node: offset is child index
            // We need to sum up text of children before this offset
            for (let i = 0; i < offset; i++) {
                total += current.childNodes[i].textContent.length;
            }
        }

        // 2. Walk up and previous siblings
        while (current && current !== container) {
            let sibling = current.previousSibling;
            while (sibling) {
                total += sibling.textContent.length;
                sibling = sibling.previousSibling;
            }
            current = current.parentElement;
        }
        return total;
    };

    // Helper to parse a DOM node to find indices
    const getIndicesFromNode = (node, offset) => {
        if (!node) return null;

        // Find the unit container
        const unitNode = node.nodeType === 3 ? node.parentElement.closest('[data-indices]') : node.closest('[data-indices]');
        if (!unitNode) return null;

        const indices = JSON.parse(unitNode.dataset.indices);

        // Check for sub-index
        const subNode = node.nodeType === 3 ? node.parentElement.closest('[data-subindex]') : node.closest('[data-subindex]');
        let trueOffset = 0;
        let part = 'tibetan'; // Default to tibetan

        if (subNode) {
            indices.subIndex = parseInt(subNode.dataset.subindex, 10);
            part = subNode.dataset.part || 'tibetan';
            trueOffset = getTrueOffset(subNode, node, offset);
        } else {
            // For main unit (no sub-index), calculate offset relative to the unit container
            // But wait, UnitRenderer puts text inside a span inside the container span.
            // The container has data-indices.
            // The text is inside.
            trueOffset = getTrueOffset(unitNode, node, offset);

            // Check if we are in main analysis
            const mainAnalysisNode = node.nodeType === 3 ? node.parentElement.closest('[data-part="main-analysis"]') : node.closest('[data-part="main-analysis"]');
            if (mainAnalysisNode) {
                part = 'main-analysis';
            }
        }

        return { ...indices, offset: trueOffset, part };
    };

    // Handle selection change
    const handleSelectionChange = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setSelectionRange(null);
            return;
        }

        const range = selection.getRangeAt(0);

        const startData = getIndicesFromNode(range.startContainer, range.startOffset);
        const endData = getIndicesFromNode(range.endContainer, range.endOffset);

        if (!startData || !endData) {
            setSelectionRange(null);
            return;
        }

        // Normalize start and end
        let start = startData;
        let end = endData;

        // Compare to ensure start comes before end
        const compare = (a, b) => {
            if (a.blockIdx !== b.blockIdx) return a.blockIdx - b.blockIdx;
            if (a.lineIdx !== b.lineIdx) return a.lineIdx - b.lineIdx;
            if (a.unitIdx !== b.unitIdx) return a.unitIdx - b.unitIdx;
            const subA = a.subIndex ?? -1;
            const subB = b.subIndex ?? -1;
            if (subA !== subB) return subA - subB;
            return a.offset - b.offset;
        };

        if (compare(start, end) > 0) {
            [start, end] = [end, start];
        }

        setSelectionRange({ start, end });
    }, []);

    useEffect(() => {
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [handleSelectionChange]);

    // Handle MouseUp to trigger Analysis Creation
    useEffect(() => {
        const handleMouseUp = (e) => {
            if (selectMode) return; // Do nothing in Select Mode

            // Ignore clicks inside the edit popover
            if (e.target.closest('.popover-container')) return;

            if (!selectionRange) return;

            const { start, end } = selectionRange;

            // Only trigger if selection is within the same unit
            if (start.blockIdx === end.blockIdx &&
                start.lineIdx === end.lineIdx &&
                start.unitIdx === end.unitIdx) {

                // Check if selection spans multiple sub-units (for main analysis edit)
                const spansMultipleSubUnits = start.subIndex !== end.subIndex;

                // If selection is in analysis part, ignore it (user requested no drag-to-edit)
                if (start.part === 'sub-analysis' || start.part === 'main-analysis') {
                    return;
                }

                // Text selection logic
                // We need to handle both single sub-unit and multi-sub-unit selections

                const block = documentData[start.blockIdx];
                const line = block.lines[start.lineIdx];
                const unit = line.units[start.unitIdx];

                let originalText = unit.original;
                let subUnits = null;
                const hasSubAnalysis = (unit.nestedData && unit.nestedData.length > 0) || (unit.supplementaryData && unit.supplementaryData.length > 0);

                if (hasSubAnalysis) {
                    subUnits = (unit.nestedData && unit.nestedData.length > 0) ? unit.nestedData : (unit.supplementaryData && unit.supplementaryData.length > 0 ? unit.supplementaryData : null);
                }

                // Calculate selected text and check for full selection
                let selectedText = '';
                let isFullSelection = false;

                if (spansMultipleSubUnits) {
                    // If spanning multiple, we assume it's an attempt to select the whole word
                    // We verify if it covers the whole word
                    // For simplicity, if it spans multiple, we treat it as main unit selection if it covers enough?
                    // Or strictly check offsets.

                    // Actually, if it spans multiple, it MUST be a main unit operation (or invalid).
                    // Let's construct the text.
                    if (subUnits) {
                        // Start from start.subIndex to end.subIndex
                        // Note: start.offset is into start.subIndex
                        // end.offset is into end.subIndex

                        // This is complicated to reconstruct exactly without iterating.
                        // But we know it's the same unit.
                        // Let's just check if it looks like a full selection of the main unit.

                        // If start is 0 (or close) of first sub and end is len (or close) of last sub.
                        // But we can just use the window selection text?
                        const selection = window.getSelection();
                        selectedText = selection.toString(); // This might include newlines or be messy

                        // Better: use unit.original
                        // If we select the whole thing, selectedText should match unit.original
                        // But offsets are tricky.

                        // Let's assume if it spans multiple sub-units, we target the MAIN unit.
                        isFullSelection = true; // Treat as full selection of main unit
                        originalText = unit.original;
                        selectedText = unit.original; // Approximation for now
                    }
                } else {
                    // Single sub-unit selection
                    if (subUnits && start.subIndex !== undefined && start.subIndex !== null) {
                        originalText = subUnits[start.subIndex].original;
                    }
                    selectedText = originalText.substring(start.offset, end.offset);
                    isFullSelection = selectedText.length === originalText.length;
                }

                if (selectedText.length > 0) {
                    let isCreating = true;
                    let targetUnit = unit;
                    let targetSubIndex = null;
                    let possibleParents = [];

                    if (spansMultipleSubUnits) {
                        // Targeting main unit
                        targetUnit = unit;
                        targetSubIndex = null;
                        if (unit.analysis) {
                            isCreating = false;
                        }
                    } else {
                        // Single sub-unit or main unit (if no subs)
                        if (hasSubAnalysis && subUnits && start.subIndex !== undefined && start.subIndex !== null) {
                            // Real sub-unit
                            targetUnit = subUnits[start.subIndex];
                            targetSubIndex = start.subIndex;
                            if (targetUnit.analysis && isFullSelection) {
                                isCreating = false;
                            }
                        } else {
                            // Main unit (no sub-analysis structure)
                            targetUnit = unit;
                            targetSubIndex = null; // Treat as main
                            if (unit.analysis) {
                                if (isFullSelection) {
                                    isCreating = false;
                                } else {
                                    // Creating sub-analysis on a word that has main analysis
                                    // We should allow this!
                                    // And we should hint that it can be a sub-analysis
                                    possibleParents.push({ id: 'sub', label: 'Sub-analysis' });
                                }
                            }
                        }
                    }

                    // User Request: Only allow adding analysis. Edit mode is only via click.
                    if (!isCreating) {
                        return;
                    }

                    // Set Anchor Rect for Popup
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        setAnchorRect(rect);
                    }

                    setEditingTarget({
                        indices: {
                            blockIdx: start.blockIdx,
                            lineIdx: start.lineIdx,
                            unitIdx: start.unitIdx,
                            subIndex: targetSubIndex
                        },
                        isCreating: isCreating,
                        unit: targetUnit,
                        possibleParents: possibleParents,
                        creationDetails: {
                            startOffset: start.offset,
                            selectedText: selectedText
                        },
                        highlightColor: isCreating ? 'highlight-creating' : 'highlight-editing'
                    });
                }
            }
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [selectionRange, selectMode, documentData, setEditingTarget, setAnchorRect]);

    // Helper to determine if a unit/sub-unit is selected and get the highlight range
    const getHighlightRange = useCallback((indices, subIndex = null, textLength) => {
        if (!selectionRange) return null;

        const { start, end } = selectionRange;

        // Construct current position object for comparison
        // We compare "start of this unit" and "end of this unit" against selection range

        const currentStart = { ...indices, subIndex, offset: 0 };
        const currentEnd = { ...indices, subIndex, offset: textLength };

        // Comparison helper
        const comparePos = (a, b) => {
            if (a.blockIdx !== b.blockIdx) return a.blockIdx - b.blockIdx;
            if (a.lineIdx !== b.lineIdx) return a.lineIdx - b.lineIdx;
            if (a.unitIdx !== b.unitIdx) return a.unitIdx - b.unitIdx;

            // Treat undefined subIndex as -1 (main unit context)
            // But here we are comparing specific positions.
            // If subIndex is null, it means we are in a simple text unit.
            // If subIndex is present, we are in a sub-unit.

            const subA = a.subIndex ?? -1;
            const subB = b.subIndex ?? -1;

            if (subA !== subB) return subA - subB;
            return a.offset - b.offset;
        };

        // Check intersection
        // Selection is [start, end]
        // Unit is [currentStart, currentEnd]

        // If selection ends before unit starts: selectionEnd < unitStart -> No overlap
        if (comparePos(end, currentStart) <= 0) return null;

        // If selection starts after unit ends: selectionStart > unitEnd -> No overlap
        if (comparePos(start, currentEnd) >= 0) return null;

        // Calculate overlap
        let startOffset = 0;
        let endOffset = textLength;

        // If selection starts inside this unit
        if (comparePos(start, currentStart) > 0) {
            startOffset = start.offset;
        }

        // If selection ends inside this unit
        if (comparePos(end, currentEnd) < 0) {
            endOffset = end.offset;
        }

        return [startOffset, endOffset];

    }, [selectionRange]);

    // Clear selection on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                window.getSelection()?.removeAllRanges();
                setSelectionRange(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Handle Copy Event to remove newlines and exclude analysis text
    useEffect(() => {
        const handleCopy = (e) => {
            let textToCopy = '';

            // 1. Try Native Selection
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                // We need to filter out the analysis text which might be included in the selection
                // 1. Clone the selected content
                const range = selection.getRangeAt(0);
                const fragment = range.cloneContents();

                // 2. Create a temporary container
                const div = document.createElement('div');
                div.appendChild(fragment);

                // 3. Remove analysis elements
                // We target the classes used for analysis containers and text
                const analysisSelectors = [
                    '.main-analysis-box',
                    '.sub-analysis-cell',
                    '.analysis-label',
                    '.analysis-def',
                    '.tense-label'
                ];

                div.querySelectorAll(analysisSelectors.join(', ')).forEach(el => el.remove());

                // 4. Get text content
                const text = div.textContent || div.innerText;

                // 5. Remove newlines
                textToCopy = text.replace(/[\r\n]+/g, '');
            }

            // 2. Fallback to Custom Editing Selection (Green Highlight)
            // If native selection failed (likely cleared by UI update), use the stored selection state
            if (!textToCopy && editingTarget && editingTarget.creationDetails && editingTarget.creationDetails.selectedText) {
                textToCopy = editingTarget.creationDetails.selectedText;
            }

            if (textToCopy) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', textToCopy);
            }
        };

        document.addEventListener('copy', handleCopy);
        return () => document.removeEventListener('copy', handleCopy);
    }, [editingTarget]);

    const value = {
        selectionRange,
        getHighlightRange,
        selectMode,
        setSelectMode
    };

    return (
        <SelectionContext.Provider value={value}>
            {children}
        </SelectionContext.Provider>
    );
}

export function useSelection() {
    const context = useContext(SelectionContext);
    if (!context) {
        throw new Error('useSelection must be used within SelectionProvider');
    }
    return context;
}
