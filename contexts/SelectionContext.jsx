import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useDocument } from './DocumentContext.jsx';

const SelectionContext = createContext();

export function SelectionProvider({ children }) {
    const { documentData } = useDocument();
    const [selectionRange, setSelectionRange] = useState(null);

    // Helper to parse a DOM node to find indices
    const getIndicesFromNode = (node) => {
        if (!node) return null;

        // Find the unit container
        const unitNode = node.nodeType === 3 ? node.parentElement.closest('[data-indices]') : node.closest('[data-indices]');
        if (!unitNode) return null;

        const indices = JSON.parse(unitNode.dataset.indices);

        // Check for sub-index
        const subNode = node.nodeType === 3 ? node.parentElement.closest('[data-subindex]') : node.closest('[data-subindex]');
        if (subNode) {
            indices.subIndex = parseInt(subNode.dataset.subindex, 10);
        }

        return indices;
    };

    // Handle selection change
    const handleSelectionChange = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setSelectionRange(null);
            return;
        }

        const range = selection.getRangeAt(0);
        const startIndices = getIndicesFromNode(range.startContainer);
        const endIndices = getIndicesFromNode(range.endContainer);

        if (!startIndices || !endIndices) {
            setSelectionRange(null);
            return;
        }

        // Normalize start and end
        let start = { ...startIndices, offset: range.startOffset };
        let end = { ...endIndices, offset: range.endOffset };

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

    const value = {
        selectionRange,
        getHighlightRange
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
