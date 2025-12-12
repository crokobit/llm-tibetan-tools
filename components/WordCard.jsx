import React, { useState, useEffect } from 'react';
import { POS_COLORS, FONT_SIZES } from '../utils/constants.js';
import { truncateDefinition } from '../utils/helpers.js';
import renderHighlightedText from '../utils/renderHighlightedText.jsx';
import AnalysisLabel from './AnalysisLabel.jsx';

// import { useSelection } from '../contexts/SelectionContext.jsx';

const WordCard = ({ unit, onClick, isNested = false, indices, editingTarget, isAnyEditActive, onResize }) => {
    const { analysis, original, nestedData, supplementaryData } = unit;
    const [hoveredSubIndex, setHoveredSubIndex] = useState(null);
    // const { getHighlightRange } = useSelection();

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

    // --- Resize Logic ---
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState(null); // 'left' or 'right'
    const dragStartX = React.useRef(null);
    const accumulatedDelta = React.useRef(0);

    const RESIZE_THRESHOLD = 20; // Pixels to drag to trigger a char move

    // Removed handleMouseMove logic in favor of explicit handle

    const handleGlobalMouseMove = React.useCallback((e) => {
        if (!dragStartX.current) return;

        const delta = e.clientX - dragStartX.current;
        const totalDelta = accumulatedDelta.current + delta;

        if (totalDelta > RESIZE_THRESHOLD) {
            // Dragged Right -> Expand (Take from next)
            onResize && onResize(1);
            accumulatedDelta.current = 0; // Reset
            dragStartX.current = e.clientX; // Reset start to current
        } else if (totalDelta < -RESIZE_THRESHOLD) {
            // Dragged Left -> Shorten (Give to next)
            onResize && onResize(-1);
            accumulatedDelta.current = 0;
            dragStartX.current = e.clientX;
        }
    }, [onResize]);

    const handleGlobalMouseUp = React.useCallback(() => {
        setIsResizing(false);
        setResizeDirection(null);
        dragStartX.current = null;
        accumulatedDelta.current = 0;

        document.body.classList.remove('resizing-active'); // Remove class
    }, []);

    // Manage global listeners
    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isResizing, handleGlobalMouseMove, handleGlobalMouseUp]);

    const handleResizeStart = (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);
        setResizeDirection('right');
        dragStartX.current = e.clientX;
        accumulatedDelta.current = 0;

        document.body.classList.add('resizing-active'); // Add class
    };

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
        <span
            data-indices={indices ? JSON.stringify(indices) : undefined}
            className={`word-card-grid ${isEditingMainAnalysis ? 'editing-main' : ''} ${isResizing ? 'resizing' : ''}`}
            style={{
                '--col-count': subUnits.length,
            }}
            // Clicking background selects the main unit
            onClick={(e) => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) return;
                e.stopPropagation();
                onClick(e, unit, null, null);
            }}
        >
            {/* Explicit Resize Handle */}
            <span
                className="resize-handle"
                onMouseDown={handleResizeStart}
                onClick={(e) => e.stopPropagation()} // Prevent click propagation
            />

            {/* --- Row 1: Tibetan Sub-Words (The "Main Word") --- */}
            {subUnits.map((u, i) => {
                // Check if this sub-unit is just a tsheg
                const isTsheg = u.original.trim() === '་';
                const myOffset = currentGlobalOffset;
                currentGlobalOffset += u.original.length;

                // Check if this specific sub-word is being edited
                const isThisSubWordEditing = isEditingExisting && editingTarget.indices.subIndex === i;

                // Check for partial selection
                // const selectionRange = getHighlightRange(indices, i, u.original.length);
                // const isSelected = !!selectionRange;

                let content = u.original;
                if (isCreatingSub && editingTarget && editingTarget.creationDetails && editingTarget.indices.subIndex === i) {
                    content = renderHighlightedText(
                        u.original,
                        editingTarget.creationDetails.startOffset,
                        editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
                        0,
                        highlightColor
                    );
                }
                // else if (isSelected) {
                //     content = renderHighlightedText(
                //         u.original,
                //         selectionRange[0],
                //         selectionRange[1],
                //         0,
                //         'custom-selected'
                //     );
                // }

                return (
                    <span
                        key={`tib-${i}`}
                        data-subindex={i}
                        data-part="tibetan"
                        className={`tibetan-word-box ${i === hoveredSubIndex && !isAnyEditActive ? 'highlight-editing' : ''} ${isThisSubWordEditing ? 'highlight-editing' : ''}`}
                        onClick={(e) => {
                            // If text is selected, do not trigger click
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) {
                                e.stopPropagation();
                                return;
                            }

                            // If we are in creation mode for this unit, ignore the click to prevent resetting
                            if (isCreatingSub) {
                                e.stopPropagation();
                                return;
                            }

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
                    ><span className={`tibetan-font ${isNested ? 'tibetan-medium' : FONT_SIZES.tibetan}`}>
                            {content}
                        </span></span>
                );
            })}

            {/* --- Row 2: Main Analysis (Spans all cols) --- */}
            <span
                className="main-analysis-box"
                data-part="main-analysis"
                onClick={(e) => {
                    const selection = window.getSelection();
                    if (selection && !selection.isCollapsed) return;
                    e.stopPropagation();
                    onClick(e, unit, null, null);
                }} // Click here edits main
            >
                {/* Main Analysis Underline */}
                <span className={`main-analysis-underline block ${mainBorderColor}`}></span>

                {/* Main Analysis Text */}
                <span className="flex flex-col items-center">
                    <AnalysisLabel text={analysis.root} isSub={isNested} />
                    {analysis.tense && <span className="tense-label">({analysis.tense})</span>}
                    <span className={`analysis-def ${isNested ? 'analysis-def-sub' : 'analysis-def-main'}`}>
                        {displayDef}
                    </span>
                </span>
            </span>

            {/* --- Row 3: Sub Analysis (Aligned cols) --- */}
            {hasSubAnalysis && subUnits.map((u, i) => {
                // If tsheg, return empty cell to maintain grid structure but show nothing
                if (u.original.trim() === '་') {
                    return <span key={`sub-${i}`} />;
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
                    <span
                        key={`sub-${i}`}
                        data-subindex={i}
                        data-part="sub-analysis"
                        className={`sub-analysis-cell ${isThisSubEditing ? 'editing' : ''} ${isAnalyzed ? 'analyzed' : ''} ${isAnalyzed && !isAnyEditActive ? 'allow-hover' : ''}`}
                        onMouseEnter={isAnalyzed && !isAnyEditActive ? () => setHoveredSubIndex(i) : undefined}
                        onMouseLeave={isAnalyzed && !isAnyEditActive ? () => setHoveredSubIndex(null) : undefined}
                        onClick={(e) => {
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) return;
                            e.stopPropagation();
                            onClick(e, u, i, subType);
                        }}
                    >
                        {/* Sub Analysis Underline (Colored Bar) */}
                        {u.analysis && (
                            <span className={`sub-analysis-underline block ${subBgColor}`}></span>
                        )}

                        {/* Sub Analysis Text */}
                        <span className="sub-analysis-content">
                            <span className="analysis-label-sub">{u.analysis?.root}</span>
                            <span className="analysis-def-sub">
                                {subDef}
                            </span>
                        </span>
                    </span>
                );
            })}
        </span>
    );
};

export default WordCard;
