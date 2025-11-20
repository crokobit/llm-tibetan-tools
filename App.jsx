import React, { useState, useEffect, useRef, useCallback } from 'react';
import DocumentParser from './logic/DocumentParser.js';
import AnalysisParser from './logic/AnalysisParser.js';
import LineRenderer from './components/LineRenderer.jsx';
import EditPopover from './components/EditPopover.jsx';

export default function TibetanReader() {
    const [documentData, setDocumentData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingTarget, setEditingTarget] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);
    const [isMammothLoaded, setIsMammothLoaded] = useState(false);
    const contentRef = useRef(null);
    const ignoreClickRef = useRef(false);

    useEffect(() => {
        if (window.mammoth) {
            setIsMammothLoaded(true);
            return;
        }
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
        script.onload = () => setIsMammothLoaded(true);
        script.onerror = () => console.error("Failed to load mammoth.js");
        document.body.appendChild(script);
    }, []);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!isMammothLoaded) {
            alert("File reader library is still loading, please wait a moment and try again.");
            return;
        }

        setLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await window.mammoth.extractRawText({ arrayBuffer });
            const rawText = result.value;
            const parsedData = DocumentParser.parse(rawText);
            setDocumentData(parsedData);
        } catch (err) {
            console.error(err);
            alert("Error parsing file: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUnitClick = (event, blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType) => {
        // If we are already editing this exact thing, do nothing (or maybe toggle off?)
        // For now, let's allow re-clicking to just ensure it's active.

        // Calculate anchor rect from the event target
        const rect = event.currentTarget.getBoundingClientRect();
        setAnchorRect(rect);

        // Set editing target
        // If subUnit is passed, we are editing a sub-analysis (or creating one if it's a placeholder)
        // If subUnit is null, we are editing the main unit

        // Check if we are clicking a sub-unit that already has analysis -> Edit Mode
        // Check if we are clicking a sub-unit that has NO analysis -> Create Mode (but we need to know which part of text)
        // Actually, for sub-units in the grid, they are already "units".

        // The logic from previous code:
        // If we click a main word (WordCard container or main analysis box), we edit main.
        // If we click a sub-analysis cell, we edit sub.

        const isSub = subIndex !== null && subIndex !== undefined;

        // Construct target object
        const target = {
            indices: { blockIdx, lineIdx, unitIdx, subIndex },
            isCreating: false, // Default to editing existing
            unit: subUnit, // The specific unit being edited (main or sub)
            parentUnit: null // Will be filled if needed
        };

        // If it's a sub-unit, we need to find the parent unit to update it later
        if (isSub) {
            // We don't have easy access to parent unit here directly without traversing documentData
            // But we can pass it or find it.
            // Actually, 'subUnit' is the nested object.
            // We need to know if it has analysis.
            if (!subUnit.analysis) {
                // This case shouldn't happen for "editing" unless we allow clicking empty slots?
                // In the current UI, we only render sub-units if they exist or if we are in a mode.
                // Wait, the grid renders all nestedData.
                // If nestedData has an item with no analysis, it's just text.
                // If we click it, we are creating analysis for it.
                target.isCreating = true;
            }
        } else {
            // Main unit
            // 'subUnit' here is actually the main 'unit' passed from LineRenderer -> UnitRenderer -> WordCard
            if (!subUnit.analysis) {
                target.isCreating = true;
            }
        }

        // However, the previous logic had a complex "Selection" based creation.
        // If we just click, we are editing existing.
        // If we select text, we are creating new.

        // Let's stick to the "Click to Edit" logic for existing analysis.
        // And "Select to Create" logic for new analysis.

        // If we clicked, we assume it's an existing unit/sub-unit we want to edit.
        // EXCEPT if it's a text node (handled in UnitRenderer text path).
        // But WordCard only renders "word" type units.

        // So, if we are in WordCard:
        // 1. Click Main -> Edit Main Analysis
        // 2. Click Sub -> Edit Sub Analysis

        setEditingTarget(target);
        ignoreClickRef.current = true; // Prevent clearing immediately
    };

    // Handle text selection for creating new analysis
    const handleSelection = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const text = selection.toString();

        // We need to map this selection to our data structure.
        // This is the tricky part. We need to know which unit/line/block we are in.
        // We can use data attributes on the rendered elements.

        // Find the closest unit container
        const startNode = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
        const endNode = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;

        // Check if we are inside a tibetan text area
        const startUnit = startNode.closest('[data-indices]');
        const endUnit = endNode.closest('[data-indices]');

        if (!startUnit || !endUnit) return;

        // Parse indices
        const startIndices = JSON.parse(startUnit.dataset.indices);
        const endIndices = JSON.parse(endUnit.dataset.indices);

        // We only support selection within a single unit for now (or single text block)
        if (startIndices.blockIdx !== endIndices.blockIdx ||
            startIndices.lineIdx !== endIndices.lineIdx ||
            startIndices.unitIdx !== endIndices.unitIdx) {
            // Selection spans multiple units - simplified: just ignore or handle first
            return;
        }

        const { blockIdx, lineIdx, unitIdx } = startIndices;
        const unit = documentData[blockIdx].lines[lineIdx].units[unitIdx];

        // Calculate offsets within the unit's original text
        // This requires knowing the global offset of the startNode within the unit.
        // Since we render text spans, we might need more precise tracking.
        // Simplified: We assume the selection is within the 'original' text of the unit.

        // We need to know if we are selecting inside a "WordCard" (adding sub-analysis)
        // or inside a "Text" unit (adding main analysis).

        const isWordCard = startUnit.classList.contains('word-card-grid') || startUnit.closest('.word-card-grid');

        // Get the rect for the popover
        const rect = range.getBoundingClientRect();
        setAnchorRect(rect);

        if (isWordCard) {
            // Adding sub-analysis to an existing word
            // We need to know WHICH sub-part or if it's a new sub-part.
            // Actually, if it's a WordCard, we are likely selecting text in the "Tibetan Sub-Words" row.

            // If the unit has nestedData, we are selecting within one of the nested items?
            // Or are we selecting a range of text that corresponds to a sub-unit?

            // Let's look at how WordCard renders.
            // It renders `tibetan-word-box` for each sub-unit.
            // If we select text inside one of these boxes, we are selecting within that sub-unit.

            // If the user selects across multiple sub-unit boxes, that's complex.
            // Let's assume selection is contained within one sub-unit box for now,
            // OR we handle the case where we want to group them?
            // The requirement says: "Enable Nested Sub-Analyses".

            // Current Logic:
            // If we select text inside a WordCard, we are creating a SUB-analysis.
            // The parent is the Unit (Word).
            // We need to identify the text range relative to the Unit's original text.

            // Let's try to get the text offset relative to the Unit's container.
            // This is hard with standard Selection API.

            // Alternative: We rely on the fact that we render the text.
            // If we select text, we want to "Create Analysis" for that text.

            // Let's define the target:
            const target = {
                indices: { blockIdx, lineIdx, unitIdx },
                isCreating: true,
                creationDetails: {
                    selectedText: text,
                    startOffset: 0, // We need to calculate this
                    fullOriginal: unit.original
                },
                possibleParents: [{ id: 'sub', label: 'Sub Analysis' }] // Default for inside word
            };

            // Calculate Offset
            // We can try to find the offset of the selected text within the unit's text.
            // Warning: If the same text appears multiple times, this is ambiguous.
            // Ideally we use the range offsets.

            // Helper to get offset relative to a container
            const getOffsetInContainer = (container, node, offset) => {
                let total = 0;
                const walk = (curr) => {
                    if (curr === node) {
                        return total + offset;
                    }
                    if (curr.nodeType === 3) {
                        // If we passed this text node, add its length
                        // But we only add if we haven't found 'node' yet.
                        // This is a pre-order traversal.
                        // If we are here, it means 'node' is not this one (checked above)
                        // nor a descendant (checked in recursion).
                        // Wait, if 'node' is a text node, we match it above.
                        // If 'node' is an element, offset is child index.
                    }
                    // ... this is getting complicated.
                    return null;
                };
                // ...
                return 0; // Placeholder
            };

            // Simplified approach:
            // If we are in a text unit, it's easy.
            // If we are in a WordCard, we are adding a sub-analysis.
            // We need to know if the selected text matches an existing sub-unit?
            // Task: "if selecting sub-analysis has exact the same sub-analysis existed, entering the edit mode of that"

            // Let's implement that check.
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

            // If not exact match, we are creating new.
            // We need the start offset to highlight correctly.
            // For now, let's use `indexOf` as a fallback, but warn it might be wrong for duplicates.
            // A better way is to use the `anchorNode` and `focusNode` to find the specific child of WordCard.

            // Let's assume we can find the start offset.
            const startOffset = unit.original.indexOf(text); // Naive
            target.creationDetails.startOffset = startOffset;
            target.highlightColor = 'highlight-creating'; // Use green for creating

            // Task: "Highlight Sub-Analysis Target" -> Light Green.
            // We set highlightColor to 'highlight-creating' which should be styled green.

            setEditingTarget(target);

        } else {
            // Selecting in a plain text unit -> Creating Main Analysis
            const target = {
                indices: { blockIdx, lineIdx, unitIdx },
                isCreating: true,
                creationDetails: {
                    selectedText: text,
                    startOffset: unit.original.indexOf(text), // Naive
                    fullOriginal: unit.original
                },
                possibleParents: [{ id: 'main', label: 'Main Analysis' }],
                highlightColor: 'highlight-creating'
            };
            setEditingTarget(target);
        }

        ignoreClickRef.current = true;

    }, [documentData]);

    useEffect(() => {
        document.addEventListener('selectionchange', () => {
            // We could debounce this to handle selection end
            // But 'selectionchange' fires a lot.
            // Better to handle 'mouseup' or 'keyup' for finishing selection.
        });

        const handleMouseUp = () => {
            // Check if we have a selection
            handleSelection();
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [handleSelection]);

    const handleSaveEdit = (data, parentMode) => {
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
                definition: data.definition
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
                // We need to insert it into nestedData
                // We also need to handle the text splitting within nestedData if it partially overlaps?
                // For now, assume we are just appending or replacing?
                // No, we need to split the 'original' of the parent unit into nested units.

                // If parent has no nestedData, we initialize it with the full text as one unit?
                // Or we just add this new unit and the rest as text?

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
                    // We need to find which nested unit contains the selection.
                    // This is complex without precise offsets.
                    // For now, let's append if it matches?
                    // Or simpler: We re-parse the whole original text with the new analysis added?
                    // No, that loses other structure.

                    // Let's assume we are splitting one of the existing nested text units.
                    // We need to find the nested unit that covers the startOffset.
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
                subUnit.analysis = {
                    ...subUnit.analysis,
                    volls: data.volls,
                    pos: data.pos,
                    root: data.root,
                    tense: data.tense,
                    definition: data.definition
                };
                // Update original if root changed? No, original text usually stays.
                // But if we want to update the text, we can.
                // For now keep original text.
            } else {
                // Editing main unit
                unit.analysis = {
                    ...unit.analysis,
                    volls: data.volls,
                    pos: data.pos,
                    root: data.root,
                    tense: data.tense,
                    definition: data.definition
                };
            }
        }

        setDocumentData(newData);
        setEditingTarget(null);
    };

    const handleDeleteAnalysis = () => {
        if (!editingTarget || editingTarget.isCreating) return;

        const { blockIdx, lineIdx, unitIdx, subIndex } = editingTarget.indices;
        const newData = [...documentData];
        const line = newData[blockIdx].lines[lineIdx];
        const unit = line.units[unitIdx];

        if (subIndex !== null && subIndex !== undefined) {
            // Deleting sub-analysis
            // We convert the sub-unit back to a text unit (remove analysis)
            // And then merge adjacent text units.
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
            // Convert unit to text
            delete unit.analysis;
            unit.type = 'text';
            unit.nestedData = []; // Remove all nested structure too? Or keep?
            // Usually if main analysis is gone, it's just text.
            // But maybe we want to keep nested?
            // Let's assume we revert to plain text.

            // Merge with adjacent text units in the line
            // This is tricky because we are in the middle of the array.
            // We can do a pass over the line units to merge.
            // Or just leave it as a text unit and let next render handle it?
            // Better to merge.
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

    // Generate Output
    const generateRawOutput = () => {
        let output = '';
        documentData.forEach(block => {
            output += '>>>\n';
            // Reconstruct raw text
            let rawText = '';
            block.lines.forEach(line => {
                line.units.forEach(unit => {
                    rawText += unit.original;
                });
                rawText += '\n';
            });
            output += rawText.trim() + '\n';
            output += '>>>>\n';

            // Reconstruct analysis
            const serializeUnit = (unit, depth = 0) => {
                let str = '';
                if (unit.analysis) {
                    const tabs = '\t'.repeat(depth);
                    const analysisStr = AnalysisParser.serialize(unit.analysis, unit.original);
                    str += `${tabs}<${unit.original}>[${analysisStr}]\n`;
                }
                if (unit.nestedData) {
                    unit.nestedData.forEach(sub => {
                        str += serializeUnit(sub, depth + 1);
                    });
                }
                return str;
            };

            block.lines.forEach(line => {
                line.units.forEach(unit => {
                    output += serializeUnit(unit, 0);
                });
            });

            output += '>>>>>\n\n';
        });
        return output;
    };

    const downloadOutput = () => {
        const text = generateRawOutput();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'analyzed_text.txt';
        a.click();
    };

    return (
        <div className="app-background" onClick={() => {
            if (!ignoreClickRef.current) {
                setEditingTarget(null);
            }
            ignoreClickRef.current = false;
        }}>
            <div className="main-card">
                {/* Header */}
                <div className="app-header">
                    <h1 className="app-header-title">Tibetan Text Analyzer</h1>
                    <p className="app-header-subtitle">Upload a .docx file or paste text to begin analysis</p>
                </div>

                {/* Toolbar */}
                <div className="toolbar-container">
                    <input
                        type="file"
                        accept=".docx"
                        onChange={handleFileUpload}
                        className="file-input-custom"
                    />
                    <button
                        onClick={downloadOutput}
                        className="btn-export"
                    >
                        Export Text
                    </button>
                </div>

                {/* Content Area */}
                <div className="content-area" ref={contentRef}>
                    {loading ? (
                        <div className="loading-container">
                            <div className="loading-spinner"></div>
                        </div>
                    ) : (
                        documentData.map((block, blockIdx) => (
                            <div key={blockIdx} className="block-layout">
                                {block.lines.map((line, lineIdx) => (
                                    <LineRenderer
                                        key={lineIdx}
                                        line={line}
                                        blockIdx={blockIdx}
                                        lineIdx={lineIdx}
                                        onUnitClick={handleUnitClick}
                                        editingTarget={editingTarget}
                                        isAnyEditActive={!!editingTarget}
                                    />
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit Popover */}
            <EditPopover
                isOpen={!!editingTarget}
                onClose={handleCloseEdit}
                onSave={handleSaveEdit}
                onDelete={handleDeleteAnalysis}
                data={editingTarget ? editingTarget.unit : null}
                isCreating={editingTarget ? editingTarget.isCreating : false}
                anchorRect={anchorRect}
                possibleParents={editingTarget ? editingTarget.possibleParents : []}
            />
        </div>
    );
}
