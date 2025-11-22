import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useDocument } from './DocumentContext.jsx';
import { useEdit } from './EditContext.jsx'; // Need this to trigger analysis creation

const SelectionContext = createContext();

export function SelectionProvider({ children }) {
    const { documentData } = useDocument();
    const { setEditingTarget, setAnchorRect } = useEdit(); // Need this to trigger analysis creation
    const [selectionRange, setSelectionRange] = useState(null);
    const [copyMode, setCopyMode] = useState(false);

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

        console.log('Selection Change:', { start, end });
        setSelectionRange({ start, end });
    }, []);

    useEffect(() => {
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [handleSelectionChange]);

    // Handle MouseUp to trigger Analysis Creation
    useEffect(() => {
        const handleMouseUp = () => {
            if (copyMode) return; // Do nothing in Copy Mode
            if (!selectionRange) return;

            const { start, end } = selectionRange;

            console.log('Mouse Up Selection:', selectionRange);

            // Only trigger if selection is within the same unit (or sub-unit)
            // and actually selects something
            if (start.blockIdx === end.blockIdx &&
                start.lineIdx === end.lineIdx &&
                start.unitIdx === end.unitIdx &&
                start.subIndex === end.subIndex) {

                // If selection is in analysis part, we should select the whole unit for editing
                // instead of creating a new analysis on the analysis text
                if (start.part === 'sub-analysis' || start.part === 'main-analysis') {
                    console.log('Selection in analysis part, triggering edit for unit');

                    // Find the unit data
                    const block = documentData[start.blockIdx];
                    const line = block.lines[start.lineIdx];
                    const unit = line.units[start.unitIdx];

                    let subUnits = null;
                    // Check for sub-analysis structure
                    const hasSubAnalysis = (unit.nestedData && unit.nestedData.length > 0) || (unit.supplementaryData && unit.supplementaryData.length > 0);

                    if (start.subIndex !== undefined && start.subIndex !== null) {
                        subUnits = (unit.nestedData && unit.nestedData.length > 0) ? unit.nestedData : (unit.supplementaryData && unit.supplementaryData.length > 0 ? unit.supplementaryData : null);
                    }

                    // If we are in a sub-analysis box, we want to edit that sub-unit
                    // If we are in main analysis box, we want to edit the main unit

                    let targetUnit = unit;
                    if (subUnits && start.subIndex !== undefined && start.subIndex !== null) {
                        targetUnit = subUnits[start.subIndex];
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
                            subIndex: start.subIndex
                        },
                        isCreating: false, // Always editing if selecting analysis
                        unit: targetUnit,
                        creationDetails: null, // No creation details needed for editing
                        highlightColor: 'highlight-editing'
                    });

                    return;
                }
                const length = end.offset - start.offset;
                if (length > 0) {
                    // Trigger creation!
                    // We need the text content to pass to creationDetails
                    // But wait, setEditingTarget expects us to set isCreating: true
                    // and provide creationDetails.

                    // We can't easily get the text here without traversing data.
                    // But we have indices.

                    // Actually, we should just set the target and let the UI handle the rest?
                    // No, we need to pass the selected text range.

                    // Let's find the text from documentData? 
                    // Accessing documentData inside useEffect might be stale if not in dependency array.
                    // But documentData is from context.

                    const block = documentData[start.blockIdx];
                    const line = block.lines[start.lineIdx];
                    const unit = line.units[start.unitIdx];

                    let originalText = unit.original;
                    let subUnits = null;

                    // Check for sub-analysis structure
                    const hasSubAnalysis = (unit.nestedData && unit.nestedData.length > 0) || (unit.supplementaryData && unit.supplementaryData.length > 0);

                    if (start.subIndex !== undefined && start.subIndex !== null) {
                        // It's a sub-unit. We need to find it.
                        subUnits = (unit.nestedData && unit.nestedData.length > 0) ? unit.nestedData : (unit.supplementaryData && unit.supplementaryData.length > 0 ? unit.supplementaryData : null);
                        if (!subUnits) subUnits = [{ original: unit.original, analysis: null }];
                        originalText = subUnits[start.subIndex].original;
                    }

                    const selectedText = originalText.substring(start.offset, end.offset);

                    console.log('Selected Text for Creation:', selectedText);

                    // Determine if we are Creating new or Editing existing
                    let isCreating = true;
                    let targetUnit = unit;

                    if (hasSubAnalysis && subUnits && start.subIndex !== undefined && start.subIndex !== null) {
                        // Real sub-unit
                        targetUnit = subUnits[start.subIndex];
                        if (targetUnit.analysis) {
                            isCreating = false;
                        }
                    } else {
                        // Main unit (no sub-analysis structure, so subIndex 0 refers to main unit)
                        targetUnit = unit;
                        if (unit.analysis) {
                            isCreating = false;
                        }
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
                            subIndex: start.subIndex
                        },
                        isCreating: isCreating,
                        unit: targetUnit,
                        creationDetails: {
                            startOffset: start.offset,
                            selectedText: selectedText
                        },
                        highlightColor: isCreating ? 'highlight-creating' : 'highlight-editing'
                    });

                    // Clear native selection to avoid visual clutter?
                    // window.getSelection().removeAllRanges();
                    // setSelectionRange(null);
                }
            }
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [selectionRange, copyMode, documentData, setEditingTarget, setAnchorRect]);

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
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;

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
            const cleanedText = text.replace(/[\r\n]+/g, '');

            if (cleanedText) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', cleanedText);
            }
        };

        document.addEventListener('copy', handleCopy);
        return () => document.removeEventListener('copy', handleCopy);
    }, []);

    const value = {
        selectionRange,
        getHighlightRange,
        copyMode,
        setCopyMode
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
