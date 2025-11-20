import React, { useState, useEffect } from 'react';
import { POS_COLORS, FONT_SIZES } from '../utils/constants.js';
import { truncateDefinition } from '../utils/helpers.js';
import renderHighlightedText from '../utils/renderHighlightedText.jsx';
import AnalysisLabel from './AnalysisLabel.jsx';

const WordCard = ({ unit, onClick, isNested = false, indices, editingTarget, isAnyEditActive }) => {
    const { analysis, original, nestedData, supplementaryData } = unit;
    const [hoveredSubIndex, setHoveredSubIndex] = useState(null);

    const mainPosKey = analysis.pos?.toLowerCase().split(/[\->|]/)[0] || 'other';
    const mainBorderColor = POS_COLORS[mainPosKey] || POS_COLORS.other;
    const displayDef = truncateDefinition(analysis.definition);

    // Check if this unit is the target of the current creation action
    const isEditingTarget = editingTarget &&
        editingTarget.indices.blockIdx === indices.blockIdx &&
        editingTarget.indices.lineIdx === indices.lineIdx &&
        editingTarget.indices.unitIdx === indices.unitIdx;

    const isCreatingSub = isEditingTarget && editingTarget.isCreating;
    const isEditingExisting = isEditingTarget && !editingTarget.isCreating;
    const isEditingMainAnalysis = isEditingExisting && (editingTarget.indices.subIndex === null || editingTarget.indices.subIndex === undefined);

    // Reset hoveredSubIndex when edit mode closes
    useEffect(() => {
        if (!isAnyEditActive) {
            setHoveredSubIndex(null);
        }
    }, [isAnyEditActive]);

    // Determine highlight color based on action type
    const highlightColor = editingTarget && editingTarget.highlightColor ? editingTarget.highlightColor : 'highlight-creating';

    // --- Unified Grid Layout ---
    let subUnits = (nestedData && nestedData.length > 0) ? nestedData : (supplementaryData && supplementaryData.length > 0 ? supplementaryData : null);
    const subType = nestedData && nestedData.length > 0 ? 'nested' : 'supplementary';
    const hasSubAnalysis = !!subUnits;

    // If no sub-units, create a synthetic one for the main word
    if (!subUnits) {
        subUnits = [{ original: unit.original, analysis: null }];
    }

    let currentGlobalOffset = 0; // Track offset for highlighting

    return (
        <div
            data-indices={indices ? JSON.stringify(indices) : undefined}
            className={`word-card-grid ${isEditingMainAnalysis ? 'editing-main' : ''}`}
            style={{ gridTemplateColumns: `repeat(${subUnits.length}, auto)` }}
            // Clicking background selects the main unit
            onClick={(e) => { e.stopPropagation(); onClick(e, unit, null, null); }}
        >
            {/* --- Row 1: Tibetan Sub-Words (The "Main Word") --- */}
            {subUnits.map((u, i) => {
                // Check if this sub-unit is just a tsheg
                const isTsheg = u.original.trim() === '་';
                const myOffset = currentGlobalOffset;
                currentGlobalOffset += u.original.length;

                // Check if this specific sub-word is being edited
                const isThisSubWordEditing = isEditingExisting && editingTarget.indices.subIndex === i;

                return (
                    <div
                        key={`tib-${i}`}
                        className={`tibetan-word-box ${i === hoveredSubIndex && !isAnyEditActive ? 'highlight-editing' : ''} ${isThisSubWordEditing ? 'highlight-editing' : ''}`}
                        onClick={(e) => {
                            // If tsheg, let it bubble to main unit (do nothing here). If word, handle sub-click.
                            if (!isTsheg && hasSubAnalysis) {
                                e.stopPropagation();
                                // User request: Clicking the main word (Tibetan text) should enter the word edit (main), not the compound edit (sub).
                                onClick(e, unit, null, null);
                            } else if (!hasSubAnalysis) {
                                // For simple words, let it bubble to main unit (handled by container onClick)
                                // or explicitly call it here if needed, but container handles it.
                            }
                        }}
                    >
                        <span className={`tibetan-font ${isNested ? 'tibetan-medium' : FONT_SIZES.tibetan}`}>
                            {isCreatingSub && editingTarget && editingTarget.creationDetails
                                ? renderHighlightedText(
                                    u.original,
                                    editingTarget.creationDetails.startOffset,
                                    editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
                                    myOffset,
                                    highlightColor
                                )
                                : u.original}
                        </span>
                    </div>
                );
            })}

            {/* --- Row 2: Main Analysis (Spans all cols) --- */}
            <div
                style={{ gridColumn: `1 / span ${subUnits.length}`, marginTop: 0 }}
                className="main-analysis-box"
                onClick={(e) => { e.stopPropagation(); onClick(e, unit, null, null); }} // Click here edits main
            >
                {/* Main Analysis Underline */}
                <div className={`main-analysis-underline ${mainBorderColor}`}></div>

                {/* Main Analysis Text */}
                <div className="flex flex-col items-center">
                    <AnalysisLabel text={analysis.root} isSub={isNested} />
                    {analysis.tense && <span className="tense-label">({analysis.tense})</span>}
                    <div className={`analysis-def ${isNested ? 'analysis-def-sub' : 'analysis-def-main'}`}>
                        {displayDef}
                    </div>
                </div>
            </div>

            {/* --- Row 3: Sub Analysis (Aligned cols) --- */}
            {hasSubAnalysis && subUnits.map((u, i) => {
                // If tsheg, return empty cell to maintain grid structure but show nothing
                if (u.original.trim() === '་') {
                    return <div key={`sub-${i}`} />;
                }

                const subPosKey = u.analysis?.pos?.toLowerCase().split(/[\->|]/)[0] || 'other';
                const subBorderColor = POS_COLORS[subPosKey] || POS_COLORS.other;
                const subBgColor = subBorderColor.replace('pos-border-', 'pos-bg-');
                const subDef = truncateDefinition(u.analysis?.definition);

                const isAnalyzed = !!u.analysis;

                // Check if this specific sub-analysis is being edited
                const isThisSubEditing = isEditingExisting &&
                    editingTarget.indices.subIndex === i;

                return (
                    <div
                        key={`sub-${i}`}
                        className={`sub-analysis-cell ${isThisSubEditing ? 'editing' : ''} ${isAnalyzed ? 'analyzed' : ''} ${isAnalyzed && !isAnyEditActive ? 'allow-hover' : ''}`}
                        onMouseEnter={isAnalyzed && !isAnyEditActive ? () => setHoveredSubIndex(i) : undefined}
                        onMouseLeave={isAnalyzed && !isAnyEditActive ? () => setHoveredSubIndex(null) : undefined}
                        onClick={(e) => { e.stopPropagation(); onClick(e, u, i, subType); }}
                    >
                        {/* Sub Analysis Underline (Colored Bar) */}
                        {u.analysis && (
                            <div className={`sub-analysis-underline ${subBgColor}`}></div>
                        )}

                        {/* Sub Analysis Text */}
                        <div className="text-center w-full rounded">
                            <div className="analysis-label-sub text-gray-600 font-medium">{u.analysis?.root}</div>
                            <div className="analysis-def-sub text-gray-500 truncate w-full leading-tight">
                                {subDef}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default WordCard;
