import React from 'react';
import WordCard from './WordCard.jsx';
import renderHighlightedText from '../utils/renderHighlightedText.jsx';
import { FONT_SIZES } from '../utils/constants.js';

const UnitRenderer = ({ unit, indices, onClick, isNested, editingTarget, isAnyEditActive }) => {
    if (unit.type === 'text') {
        // Check if this text unit should have highlighting for new analysis creation
        const isEditingTarget = editingTarget &&
            editingTarget.indices.blockIdx === indices.blockIdx &&
            editingTarget.indices.lineIdx === indices.lineIdx &&
            editingTarget.indices.unitIdx === indices.unitIdx;

        const shouldHighlight = isEditingTarget && editingTarget.isCreating && editingTarget.creationDetails;
        const highlightColor = editingTarget && editingTarget.highlightColor ? editingTarget.highlightColor : 'highlight-creating';

        return (
            <span
                className={`inline-block mx-0.5 tibetan-font ${isNested ? 'tibetan-base' : FONT_SIZES.tibetan} cursor-text`}
                data-indices={indices ? JSON.stringify(indices) : undefined}
                onClick={(e) => e.stopPropagation()}
            >
                {shouldHighlight
                    ? renderHighlightedText(
                        unit.original,
                        editingTarget.creationDetails.startOffset,
                        editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
                        0,
                        highlightColor
                    )
                    : unit.original}
            </span>
        );
    }
    return <WordCard unit={unit} onClick={onClick} isNested={isNested} indices={indices} editingTarget={editingTarget} isAnyEditActive={isAnyEditActive} />;
};

export default UnitRenderer;
