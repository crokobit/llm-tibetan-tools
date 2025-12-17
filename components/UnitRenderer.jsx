import React from 'react';
import WordCard from './WordCard.jsx';
import renderHighlightedText from '../utils/renderHighlightedText.jsx';
import { FONT_SIZES } from '../utils/constants.js';

import { useSelection } from '../contexts/SelectionContext.jsx';

const UnitRenderer = ({ unit, indices, onClick, isNested, editingTarget, isAnyEditActive, onResize, zIndex }) => {
    const { getHighlightRange } = useSelection();

    if (unit.type === 'text') {
        // Check if this text unit should have highlighting for new analysis creation
        const isEditingTarget = editingTarget &&
            editingTarget.indices.blockIdx === indices.blockIdx &&
            editingTarget.indices.lineIdx === indices.lineIdx &&
            editingTarget.indices.unitIdx === indices.unitIdx;

        const shouldHighlight = isEditingTarget && editingTarget.isCreating && editingTarget.creationDetails;
        const highlightColor = editingTarget && editingTarget.highlightColor ? editingTarget.highlightColor : 'highlight-creating';

        // Check for partial selection
        const selectionRange = getHighlightRange(indices, null, unit.original.length);
        const isSelected = !!selectionRange;

        // Determine what to render
        // Priority: Editing Highlight > Selection Highlight

        let content = unit.original;

        if (shouldHighlight) {
            content = renderHighlightedText(
                unit.original,
                editingTarget.creationDetails.startOffset,
                editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
                0,
                highlightColor
            );
        }

        return (
            <span
                id={`unit-${indices.blockIdx}-${indices.lineIdx}-${indices.unitIdx}-text`}
                className={`tibetan-unit-container tibetan-word-box tibetan-unit-wrapper`}
                data-indices={indices ? JSON.stringify(indices) : undefined}
                onClick={(e) => e.stopPropagation()}
                style={{ zIndex }}
            ><span className={`tibetan-font ${isNested ? 'tibetan-base' : FONT_SIZES.tibetan}`}>
                    {content}
                </span></span>
        );
    }
    return <WordCard unit={unit} onClick={onClick} isNested={isNested} indices={indices} editingTarget={editingTarget} isAnyEditActive={isAnyEditActive} onResize={onResize} zIndex={zIndex} />;
};

export default UnitRenderer;
