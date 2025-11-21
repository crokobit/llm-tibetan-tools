import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useDocument } from './DocumentContext.jsx';
import { useEdit } from './EditContext.jsx';

const SelectionContext = createContext();

/**
 * Provider for text selection functionality.
 * Handles text selection for creating new analysis.
 */
export function SelectionProvider({ children }) {
    const { documentData } = useDocument();
    const { setEditingTarget, setAnchorRect } = useEdit();

    // Handle text selection for creating new analysis
    const handleSelection = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const text = selection.toString();

        // Find the closest unit container
        const startNode = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
        const endNode = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;

        // IMPORTANT: Don't process if we're inside the edit popover
        if (startNode.closest('.popover-container') || endNode.closest('.popover-container')) {
            return;
        }

        // Check if we are inside a tibetan text area
        const startUnit = startNode.closest('[data-indices]');
        const endUnit = endNode.closest('[data-indices]');

        if (!startUnit || !endUnit) return;

        // Parse indices
        const startIndices = JSON.parse(startUnit.dataset.indices);
        const endIndices = JSON.parse(endUnit.dataset.indices);

        // We only support selection within a single unit for now
        if (startIndices.blockIdx !== endIndices.blockIdx ||
            startIndices.lineIdx !== endIndices.lineIdx ||
            startIndices.unitIdx !== endIndices.unitIdx) {
            return;
        }

        const { blockIdx, lineIdx, unitIdx } = startIndices;
        const unit = documentData[blockIdx].lines[lineIdx].units[unitIdx];

        // Check if we are selecting inside a WordCard (adding sub-analysis)
        const isWordCard = startUnit.classList.contains('word-card-grid') || startUnit.closest('.word-card-grid');

        // Get the rect for the popover
        const rect = range.getBoundingClientRect();
        setAnchorRect(rect);

        if (isWordCard) {
            // Adding sub-analysis to an existing word
            // Check if exact match exists
            if (unit.nestedData) {
                const existingSubIndex = unit.nestedData.findIndex(sub => sub.original === text.trim());
                if (existingSubIndex !== -1) {
                    // Found exact match! Switch to Edit Mode for that sub-unit.
                    setEditingTarget({
                        indices: { blockIdx, lineIdx, unitIdx, subIndex: existingSubIndex },
                        isCreating: false,
                        unit: unit.nestedData[existingSubIndex],
                        highlightColor: 'highlight-editing' // Use blue for editing
                    });
                    return;
                }
            }

            // Creating new sub-analysis
            const startOffset = unit.original.indexOf(text);
            const target = {
                indices: { blockIdx, lineIdx, unitIdx },
                isCreating: true,
                creationDetails: {
                    selectedText: text,
                    startOffset: startOffset,
                    fullOriginal: unit.original
                },
                possibleParents: [{ id: 'sub', label: 'Sub Analysis' }],
                highlightColor: 'highlight-creating' // Use green for creating
            };

            setEditingTarget(target);

        } else {
            // Selecting in a plain text unit -> Creating Main Analysis
            const target = {
                indices: { blockIdx, lineIdx, unitIdx },
                isCreating: true,
                creationDetails: {
                    selectedText: text,
                    startOffset: unit.original.indexOf(text),
                    fullOriginal: unit.original
                },
                possibleParents: [{ id: 'main', label: 'Main Analysis' }],
                highlightColor: 'highlight-creating'
            };

            setEditingTarget(target);
        }
    }, [documentData, setEditingTarget, setAnchorRect]);

    // Set up event listener for text selection
    useEffect(() => {
        const handleMouseUp = () => {
            handleSelection();
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [handleSelection]);

    const value = {
        handleSelection
    };

    return (
        <SelectionContext.Provider value={value}>
            {children}
        </SelectionContext.Provider>
    );
}

/**
 * Custom hook to access selection context.
 * @returns {Object} Selection context value
 */
export function useSelection() {
    const context = useContext(SelectionContext);
    if (!context) {
        throw new Error('useSelection must be used within SelectionProvider');
    }
    return context;
}
