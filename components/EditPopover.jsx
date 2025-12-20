import React, { useState, useRef, useEffect } from 'react';
import { useEdit, useAuth, useDocument } from '../contexts/index.jsx';
import { disambiguateVerbs } from '../utils/api.js';
import { lookupVerb } from '../utils/verbLookup.js'; // Import lookup logic

// POS types with English abbreviations only
const POS_TYPES = [
    { id: 'n', label: 'n', features: ['hon'] },
    { id: 'v', label: 'v', features: ['hon', 'tense'] },
    { id: 'vd', label: 'vd', features: ['hon', 'tense'] },
    { id: 'vnd', label: 'vnd', features: ['hon', 'tense'] },
    { id: 'adj', label: 'adj', features: [] },
    { id: 'adv', label: 'adv', features: [] },
    { id: 'part', label: 'part', features: [] },
    { id: 'other', label: 'other', features: [] },
];

// Operators with icons
const OPERATORS = [
    { id: 'single', symbol: '•' },
    { id: 'transform', symbol: '→' },
];

// Tense options - English abbreviations only
const TENSE_OPTIONS = [
    { id: 'past', label: 'past' },
    { id: 'imp', label: 'imp' },
    { id: 'future', label: 'fut' },
];

const EditPopover = () => {
    const { editingTarget, anchorRect, handleSaveEdit, handleDeleteAnalysis, handleCloseEdit } = useEdit();
    const { token } = useAuth();
    const { documentData } = useDocument();

    const isOpen = !!editingTarget;
    const data = editingTarget ? editingTarget.unit : null;
    const isCreating = editingTarget ? editingTarget.isCreating : false;
    const possibleParents = editingTarget ? editingTarget.possibleParents : [];

    // POS Builder state - now supports multi-select
    const [startNode, setStartNode] = useState([]);
    const [startAttrs, setStartAttrs] = useState({ hon: false, tense: [] });
    const [operator, setOperator] = useState('single');
    const [endNode, setEndNode] = useState([]);
    const [endAttrs, setEndAttrs] = useState({ hon: false, tense: [] });

    // Form data
    const [formData, setFormData] = useState({
        text: '', volls: '', root: '', definition: '', verbId: null
    });
    const [parentMode, setParentMode] = useState('main');
    const popoverRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, opacity: 0 });
    const [placement, setPlacement] = useState('bottom');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    // Dynamic hydration of verb details for legacy data
    const [dynamicVerbDetails, setDynamicVerbDetails] = useState(null);
    const [showDefinitions, setShowDefinitions] = useState(false); // Toggle for verb list definitions

    // Parse existing POS string into builder state
    const parsePosString = (posStr) => {
        if (!posStr) return { start: [], startAttrs: { hon: false, tense: [] }, op: 'single', end: [], endAttrs: { hon: false, tense: [] } };

        // Check for operators
        if (posStr.includes('->') || posStr.includes('→')) {
            const parts = posStr.split(/->|→/).map(p => p.trim());
            return {
                start: parseNode(parts[0]).ids,
                startAttrs: parseNode(parts[0]).attrs,
                op: 'transform',
                end: parseNode(parts[1]).ids,
                endAttrs: parseNode(parts[1]).attrs
            };
        } else if (posStr.includes('|')) {
            // Check if it's a union operator or multi-select within a node
            // First, try to parse as a single multi-select node
            const node = parseNode(posStr);
            if (node.ids.length > 1) {
                // It's a multi-select node
                return {
                    start: node.ids,
                    startAttrs: node.attrs,
                    op: 'single',
                    end: [],
                    endAttrs: { hon: false, tense: [] }
                };
            } else {
                // Heuristic: Check if the pipe actually separated tenses that were consumed by parseNode
                // e.g. "v,past|imp" -> parseNode("v,past|imp") -> ids=['v'], attrs={tense:['past','imp']}
                // If so, it's NOT a union, it's a single node with multiple tenses
                const parts = posStr.split('|').map(p => p.trim());
                if (node.attrs.tense.length > 0) {
                    // Check if parts after the first one are all tenses found in the node
                    const extraParts = parts.slice(1);
                    const consumedAsTense = extraParts.every(p => {
                        const normalized = p === 'fut' ? 'future' : (p === 'imp' ? 'imp' : (p === 'past' ? 'past' : null));
                        return normalized && node.attrs.tense.includes(normalized);
                    });

                    if (consumedAsTense) {
                        return {
                            start: node.ids,
                            startAttrs: node.attrs,
                            op: 'single',
                            end: [],
                            endAttrs: { hon: false, tense: [] }
                        };
                    }
                }

                // It's a union operator
                const partsUnion = posStr.split('|').map(p => p.trim());
                return {
                    start: parseNode(partsUnion[0]).ids,
                    startAttrs: parseNode(partsUnion[0]).attrs,
                    op: 'union',
                    end: parseNode(partsUnion[1]).ids,
                    endAttrs: parseNode(partsUnion[1]).attrs
                };
            }
        } else {
            const node = parseNode(posStr);
            return {
                start: node.ids,
                startAttrs: node.attrs,
                op: 'single',
                end: [],
                endAttrs: { hon: false, tense: [] }
            };
        }
    };

    const parseNode = (nodeStr) => {
        // Handle multi-select POS (e.g., "imp|past")
        if (nodeStr.includes('|')) {
            const parts = nodeStr.split('|').map(p => p.trim());
            // Check if all parts are simple POS types (no commas for attributes)
            const allSimple = parts.every(p => !p.includes(','));
            if (allSimple) {
                return { ids: parts, attrs: { hon: false, tense: [] } };
            }
        }

        // New format: pos,attr1,attr2 (e.g., v,hon,past or adj,past|future)
        if (nodeStr.includes(',')) {
            const parts = nodeStr.split(',').map(p => p.trim());
            const id = parts[0];
            const attrs = { hon: false, tense: [] };

            parts.slice(1).forEach(part => {
                if (part === 'hon') {
                    attrs.hon = true;
                } else if (['past', 'imp', 'future', 'fut'].includes(part)) {
                    const tenseValue = part === 'fut' ? 'future' : part;
                    if (!attrs.tense.includes(tenseValue)) {
                        attrs.tense.push(tenseValue);
                    }
                } else if (part.includes('|')) {
                    // Handle tense multi-select like "past|future"
                    const tenses = part.split('|').map(t => t.trim());
                    tenses.forEach(t => {
                        if (['past', 'imp', 'future', 'fut'].includes(t)) {
                            const tenseValue = t === 'fut' ? 'future' : t;
                            if (!attrs.tense.includes(tenseValue)) {
                                attrs.tense.push(tenseValue);
                            }
                        }
                    });
                }
            });

            return { ids: [id], attrs };
        }

        // Old format with parentheses: pos(attr1, attr2) - for backward compatibility
        const match = nodeStr.match(/^([a-z]+)(?:\((.*?)\))?$/);
        if (!match) return { ids: [nodeStr], attrs: { hon: false, tense: [] } };

        const id = match[1];
        const attrsStr = match[2];
        const attrs = { hon: false, tense: [] };

        if (attrsStr) {
            const parts = attrsStr.split(',').map(p => p.trim());
            parts.forEach(part => {
                if (part === 'hon') attrs.hon = true;
                else if (['past', 'imp', 'future', 'fut'].includes(part)) {
                    const tenseValue = part === 'fut' ? 'future' : part;
                    if (!attrs.tense.includes(tenseValue)) {
                        attrs.tense.push(tenseValue);
                    }
                }
            });
        }

        return { ids: [id], attrs };
    };

    useEffect(() => {
        if (isCreating) {
            const selectedText = editingTarget?.creationDetails?.selectedText || '';
            setFormData({ text: selectedText, volls: '', root: '', definition: '', verbId: null });
            setStartNode([]);
            setStartAttrs({ hon: false, tense: [] });
            setOperator('single');
            setEndNode([]);
            setEndAttrs({ hon: false, tense: [] });

            if (possibleParents && possibleParents.length > 0) {
                const subOption = possibleParents.find(p => p.id === 'sub');
                if (subOption) setParentMode('sub');
                else setParentMode('main');
            } else {
                setParentMode('main');
            }
        } else if (data && data.analysis) {
            setFormData({
                text: data.original || '',
                volls: data.analysis.volls || '',
                root: data.analysis.root || '',
                definition: data.analysis.definition || '',
                verbId: data.analysis.verbId || null
            });

            // Parse POS into builder state
            const parsed = parsePosString(data.analysis.pos);
            setStartNode(parsed.start);
            setStartAttrs(parsed.startAttrs);
            setOperator(parsed.op);
            setEndNode(parsed.end);
            setEndAttrs(parsed.endAttrs);

            // SYNC FIX: Always override the parsed attributes with metadata for simple cases
            // strictly for simple cases (single start node, no operator)
            if (parsed.op === 'single' && parsed.start.length === 1) {
                const nodeType = parsed.start[0];
                if (['v', 'vd', 'vnd'].includes(nodeType)) {
                    const metadataAttrs = { hon: false, tense: [] };

                    // 1. Hon: Trust metadata if present, otherwise fall back to parsed
                    if (data.analysis.hon) metadataAttrs.hon = true;
                    else metadataAttrs.hon = parsed.startAttrs.hon;

                    // 2. Tense: Merge metadata tense with parsed tense
                    const tSet = new Set(parsed.startAttrs.tense); // Start with existing parsed tenses
                    if (data.analysis.tense) {
                        // System uses: past, imp, future
                        // Split by | or , to handle multiple tenses in metadata
                        const metaTenses = data.analysis.tense.split(/[|,]/).map(t => t.trim());
                        metaTenses.forEach(t => tSet.add(t));
                    }
                    metadataAttrs.tense = Array.from(tSet);

                    setStartAttrs(metadataAttrs);
                }
            }
        }
    }, [data, isCreating, possibleParents, editingTarget]);

    // Smart Positioning with Dynamic ID Lookup
    React.useLayoutEffect(() => {
        if (!isOpen) return;

        const updatePosition = () => {
            if (!editingTarget || !popoverRef.current) return;

            const { blockIdx, lineIdx, unitIdx, subIndex } = editingTarget.indices;
            let targetId = '';

            if (editingTarget.isCreating) {
                // If creating, target depends on parent mode or just text unit
                // For new creation on text unit:
                targetId = `unit-${blockIdx}-${lineIdx}-${unitIdx}-text`;

                // If sub-creation on existing word (parentMode=sub), complex logic might be needed
                // But generally the click comes from the unit itself. 
                // Let's rely on the indices passed.
                if (subIndex !== null && subIndex !== undefined) {
                    targetId = `unit-${blockIdx}-${lineIdx}-${unitIdx}-sub-${subIndex}`;
                }
            } else {
                // Editing existing
                if (subIndex !== null && subIndex !== undefined) {
                    targetId = `unit-${blockIdx}-${lineIdx}-${unitIdx}-sub-${subIndex}`;
                } else {
                    targetId = `unit-${blockIdx}-${lineIdx}-${unitIdx}-main`;
                }
            }

            const targetEl = document.getElementById(targetId);

            // Fallback to anchorRect if ID not found (though it should be)
            let rect = anchorRect;
            if (targetEl) {
                rect = targetEl.getBoundingClientRect();
            }

            if (!rect) return;

            const popRect = popoverRef.current.getBoundingClientRect();
            const viewportH = window.innerHeight;
            const viewportW = window.innerWidth;
            const scrollY = window.scrollY;
            const scrollX = window.scrollX;

            let top = rect.bottom + scrollY + 12;
            let left = rect.left + scrollX;
            let newPlacement = 'bottom';

            // Vertical collision
            if (rect.bottom + popRect.height + 20 > viewportH + scrollY) {
                // Try top
                if (rect.top - popRect.height - 12 > scrollY) {
                    top = rect.top + scrollY - popRect.height - 12;
                    newPlacement = 'top';
                } else {
                    // stick to bottom if nowhere else (or adjust)
                    top = scrollY + viewportH - popRect.height - 10;
                    newPlacement = 'bottom';
                }
            }

            // Horizontal collision
            if (left + popRect.width > viewportW + scrollX) {
                left = scrollX + viewportW - popRect.width - 10;
            }
            if (left < scrollX) {
                left = scrollX + 10;
            }

            setCoords({ top, left, opacity: 1 });
            setPlacement(newPlacement);
        };

        // Initial update
        updatePosition();

        // Listen for resize and scroll
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true); // Capture phase for all scrollable parents

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, anchorRect, editingTarget, startNode, startAttrs, operator, endNode, endAttrs, parentMode]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                handleCloseEdit();
            }
        };

        if (isOpen) {
            const timeoutId = setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 0);

            return () => {
                clearTimeout(timeoutId);
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [isOpen, handleCloseEdit]);



    // Apply Verb Option
    const applyVerbOption = (option) => {
        // 1. Definition - DO NOT Overwrite, but maybe set root
        setFormData(prev => ({ ...prev, root: option.original_word, verbId: option.id }));

        // 2. POS/Tense
        setStartNode(['v']);

        // Map Tense: Correct system values are: past, imp, future
        // Map Tense: Correct system values are: past, imp, future
        const tenses = [];
        // Handle both array (new) and singular (legacy/fallback) formats
        const sourceTenses = Array.isArray(option.tenses) ? option.tenses : (option.tense ? [option.tense] : []);

        if (sourceTenses.includes('Past')) tenses.push('past');
        if (sourceTenses.includes('Future')) tenses.push('future');
        if (sourceTenses.includes('Imperative')) tenses.push('imp');
        // Present corresponds to no tense suffix usually, so empty array is correct.

        const newStartAttrs = {
            hon: option.hon || false,
            tense: tenses
        };
        setStartAttrs(newStartAttrs);

        // Volition
        if (option.volition === 'vd') setStartNode(['vd']);
        else if (option.volition === 'vnd') setStartNode(['vnd']);
        else setStartNode(['v']);

        // AUTO-SAVE with Polished Status
        // We construct the POS string immediately to save
        const posStr = formatNodeText(option.volition === 'vd' ? ['vd'] : (option.volition === 'vnd' ? ['vnd'] : ['v']), newStartAttrs);

        // Map primary tense for metadata (take first one)
        const tenseMeta = tenses.length > 0 ? tenses[0] : '';

        // Preserve existing definition in formData
        handleSaveEdit({
            ...formData,
            root: option.original_word,
            pos: posStr,
            tense: tenseMeta, // FIX: Pass tense to metadata
            verbId: option.id
        }, parentMode, false);
    };

    // Helper to get effective verb details
    const getVerbDetails = () => {
        // 1. Prefer existing details from analysis
        if (data?.analysis?.verbDetails && data.analysis.verbDetails.length > 0) {
            return data.analysis.verbDetails;
        }

        // 2. Try dynamic state
        if (dynamicVerbDetails && dynamicVerbDetails.length > 0) return dynamicVerbDetails;

        // 3. Try on-the-fly lookup
        const lookupText = formData.root || formData.text;
        if (lookupText) {
            const matches = lookupVerb(lookupText);
            if (matches && matches.length > 0) return matches;
        }

        return [];
    };

    // Auto-Detect Handler
    const handleAutoDetect = async () => {
        const details = getVerbDetails();
        if (!details || isAnalyzing) return;

        // Optimization: If only one option, apply it directly without AI
        if (details.length === 1) {
            applyVerbOption(details[0]);
            return;
        }

        setIsAnalyzing(true);
        try {
            // Context Strategy:
            // 1. Get full line/block text if available for better accuracy
            // 2. Fallback to just the word itself
            let contextText = formData.text;
            let indexInText = 0;

            if (editingTarget && editingTarget.indices) {
                const { blockIdx, lineIdx, unitIdx } = editingTarget.indices;
                if (documentData && documentData[blockIdx] && documentData[blockIdx].lines[lineIdx]) {
                    const line = documentData[blockIdx].lines[lineIdx];
                    contextText = "";
                    indexInText = 0;

                    // Reconstruct line text and find our position
                    for (let i = 0; i < line.units.length; i++) {
                        const u = line.units[i];
                        if (i === unitIdx) {
                            indexInText = contextText.length;
                        }
                        contextText += u.original;
                    }
                }
            }

            const payloadItems = [{
                id: 'current',
                indexInText: indexInText,
                original: formData.text,
                verbOptions: details
            }];

            const result = await disambiguateVerbs(token, contextText, payloadItems);

            if (result && result.results && result.results.length > 0) {
                const bestIdx = result.results[0].selectedIndex;
                const bestOption = details[bestIdx];
                if (bestOption) {
                    applyVerbOption(bestOption);
                }
            }
        } catch (err) {
            console.error("Auto detect failed", err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Verb Selector Component
    const VerbSelector = () => {
        const details = getVerbDetails();
        const hasVerb = startNode.some(n => ['v', 'vd', 'vnd'].includes(n)); // Check if verb selected

        // Show if we have details OR if user explicitly selected a verb type (to allow AI attempt)
        if ((!details || details.length === 0) && !hasVerb) return null;

        return (
            <div className="verb-selector-section">
                <div className="verb-selector-header" style={{ justifyContent: 'flex-start', gap: '8px' }}>
                    {hasVerb && (
                        <button
                            className={`btn-ai-detect ${isAnalyzing ? 'loading' : ''}`}
                            onClick={handleAutoDetect}
                            disabled={isAnalyzing || !details || details.length === 0} // Disable if no dictionary match
                            title={(!details || details.length === 0) ? "No dictionary entry found" : "AI Disambiguation"}
                        >
                            {isAnalyzing ? '...' : 'Helper'}
                        </button>
                    )}
                    {data?.analysis?.verbId ? (
                        <span className="badge-polished" title={`Verb ID: ${data.analysis.verbId}`}>
                            Indexed
                        </span>
                    ) : (data?.analysis?.isPolished && (
                        <span className="badge-polished" title="Legacy Polished">
                            Polished
                        </span>
                    ))}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    // Format node text
    const formatNodeText = (nodeIds, attrs) => {
        if (!nodeIds || nodeIds.length === 0) return '?';

        // For multi-select POS, just join with |
        if (nodeIds.length > 1) {
            return nodeIds.join('|');
        }

        // For single POS, add attributes if any
        const nodeId = nodeIds[0];
        let parts = [];
        if (attrs.hon) parts.push('hon');
        if (attrs.tense && attrs.tense.length > 0) {
            // Join multiple tenses with | instead of ,
            parts.push(attrs.tense.join('|'));
        }

        if (parts.length === 0) return nodeId;
        return `${nodeId},${parts.join(',')}`;
    };

    // Get preview text
    const getPreviewText = () => {
        if (!startNode || startNode.length === 0) return '...';
        const startText = formatNodeText(startNode, startAttrs);

        if (operator === 'single') return startText;

        const opSymbol = operator === 'transform' ? '→' : '|';
        const endText = (endNode && endNode.length > 0) ? formatNodeText(endNode, endAttrs) : '?';

        return `${startText}${opSymbol}${endText}`;
    };

    const handleSave = () => {
        const posString = getPreviewText();
        // FIX: Extract tense from startAttrs for saving
        const tenseMeta = startAttrs.tense.length > 0 ? startAttrs.tense[0] : '';

        handleSaveEdit({
            ...formData,
            pos: posString,
            tense: tenseMeta, // Pass current UI tense
        }, parentMode);
    };

    const handleStartNodeChange = (posId, isLongPress) => {
        if (isLongPress) {
            // Toggle selection for multi-select (AND logic)
            if (startNode.includes(posId)) {
                setStartNode(startNode.filter(id => id !== posId));
            } else {
                setStartNode([...startNode, posId]);
            }
        } else {
            // Replace selection (Single select)
            setStartNode([posId]);
        }
        setStartAttrs({ hon: false, tense: [] });
    };

    const handleEndNodeChange = (posId, isLongPress) => {
        if (isLongPress) {
            // Toggle selection for multi-select (AND logic)
            if (endNode.includes(posId)) {
                setEndNode(endNode.filter(id => id !== posId));
            } else {
                setEndNode([...endNode, posId]);
            }
        } else {
            // Replace selection (Single select)
            setEndNode([posId]);
        }
        setEndAttrs({ hon: false, tense: [] });
    };

    // Attribute Selector Component
    const AttributeSelector = ({ posId, attrs, setAttrs }) => {
        const posConfig = POS_TYPES.find(p => p.id === posId);
        if (!posConfig || (!posConfig.features.includes('hon') && !posConfig.features.includes('tense'))) {
            return null;
        }

        const toggleHon = () => setAttrs({ ...attrs, hon: !attrs.hon });
        const toggleTense = (tenseId) => {
            if (attrs.tense.includes(tenseId)) {
                setAttrs({ ...attrs, tense: attrs.tense.filter(t => t !== tenseId) });
            } else {
                setAttrs({ ...attrs, tense: [...attrs.tense, tenseId] });
            }
        };

        return (
            <div className="attr-selector">
                {(posConfig.features.includes('tense') || posConfig.features.includes('hon')) && (
                    <div className="attr-row">
                        {posConfig.features.includes('hon') && (
                            <button
                                onClick={toggleHon}
                                className={`hon-button ${attrs.hon ? 'active' : ''}`}
                            >
                                {'Hon'}
                            </button>
                        )}
                        {(posConfig.features.includes('tense') && (
                            <div className="pos-options">
                                {TENSE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => toggleTense(opt.id)}
                                        className={`pos-option ${attrs.tense.includes(opt.id) ? 'active' : ''}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const PosButton = ({ type, selected, onClick, disabled }) => {
        const timerRef = useRef(null);
        const isLongPress = useRef(false);

        const handleMouseDown = () => {
            if (disabled) return;
            isLongPress.current = false;
            timerRef.current = setTimeout(() => {
                isLongPress.current = true;
                onClick(type.id, true); // Trigger long press action
            }, 500); // 500ms threshold
        };

        const handleMouseUp = () => {
            if (disabled) return;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            if (!isLongPress.current) {
                onClick(type.id, false); // Trigger click action
            }
        };

        const handleMouseLeave = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };

        return (
            <button
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                disabled={disabled}
                className={`pos-button pos-button-${type.id} ${selected ? 'selected' : ''}`}
            >
                {type.label}
            </button>
        );
    };

    return (
        <div
            ref={popoverRef}
            className="popover-container"
            style={{ top: coords.top, left: coords.left, opacity: coords.opacity }}
        >
            <div className={`popover-arrow ${placement === 'bottom' ? 'bottom' : 'top'}`}></div>

            <div className="popover-content">
                {/* Action Buttons - Moved to top */}
                <div className="popover-actions">
                    <button
                        onClick={handleSave}
                        className="btn-save"
                        disabled={startNode.length === 0 || (operator !== 'single' && endNode.length === 0)}
                    >
                        Save
                    </button>
                    {!isCreating && (
                        <button onClick={handleDeleteAnalysis} className="btn-delete">Delete</button>
                    )}
                    <button
                        className="btn-toggle-def"
                        onClick={() => setShowDefinitions(!showDefinitions)}
                        title="Toggle Dictionary Definition"
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2em' }}
                    >
                        {showDefinitions ? '👁️' : '👁️‍🗨️'}
                    </button>
                </div>

                {/* Definition - Moved below save/delete */}
                <textarea
                    className="form-input form-input-sm"
                    rows={2}
                    value={formData.definition}
                    onChange={e => setFormData({ ...formData, definition: e.target.value })}
                    placeholder="Definition"
                />

                {/* Text Display */}
                <VerbSelector />

                {/* POS Selection */}
                <div className="pos-button-grid">
                    {POS_TYPES.map(t => (
                        <PosButton
                            key={t.id}
                            type={t}
                            selected={startNode.includes(t.id)}
                            onClick={handleStartNodeChange}
                        />
                    ))}
                </div>
                {startNode.length === 1 && (
                    <AttributeSelector
                        posId={startNode[0]}
                        attrs={startAttrs}
                        setAttrs={setStartAttrs}
                    />
                )}

                {/* Operator Selection */}
                <div className={`operator-section ${startNode.length === 0 ? 'section-disabled' : ''}`}>
                    <div className="operator-grid">
                        {OPERATORS.map(op => (
                            <button
                                key={op.id}
                                onClick={() => setOperator(op.id)}
                                className={`operator-button ${operator === op.id ? 'selected' : ''}`}
                            >
                                {op.symbol}
                            </button>
                        ))}
                    </div>
                </div>

                {/* End Node Selection */}
                {operator !== 'single' && startNode.length > 0 && (
                    <>
                        <div className="pos-button-grid">
                            {POS_TYPES.map(t => (
                                <PosButton
                                    key={t.id}
                                    type={t}
                                    selected={endNode.includes(t.id)}
                                    onClick={handleEndNodeChange}
                                />
                            ))}
                        </div>
                        {endNode.length === 1 && (
                            <AttributeSelector
                                posId={endNode[0]}
                                attrs={endAttrs}
                                setAttrs={setEndAttrs}
                            />
                        )}
                    </>
                )}

                {/* Preview */}
                <div className="pos-preview">
                    {getPreviewText()}
                </div>

                {/* Volls */}
                <input
                    className="form-input form-input-sm"
                    value={formData.volls}
                    onChange={e => setFormData({ ...formData, volls: e.target.value })}
                    placeholder="Full form"
                />

                {/* Root - Moved to bottom */}
                <input
                    className="form-input"
                    value={formData.root}
                    onChange={e => setFormData({ ...formData, root: e.target.value, verbId: null })}
                    placeholder="Root"
                />

                {/* Dictionary Definition Hint - shown when toggle is active */}
                {showDefinitions && (() => {
                    const details = getVerbDetails();
                    if (details && details.length > 0) {
                        // FIX: Use the currently selected verbId if available
                        const currentVerbId = formData.verbId || data?.analysis?.verbId;
                        const verb = currentVerbId
                            ? details.find(d => d.id === currentVerbId) || details[0]
                            : details[0];

                        return (
                            <div className="verb-def-hint" style={{
                                marginTop: '4px',
                                padding: '8px',
                                background: '#f8f9fa',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                color: '#4b5563',
                                border: '1px solid #e5e7eb'
                            }}>
                                <strong>Dict:</strong> {verb.definition}
                            </div>
                        );
                    }
                    return null;
                })()}

                {/* Verb Tenses Display - shown when definition toggle is active */}
                {showDefinitions && (() => {
                    const details = getVerbDetails();
                    if (details && details.length > 0) {
                        // FIX: Use the currently selected verbId if available
                        const currentVerbId = formData.verbId || data?.analysis?.verbId;
                        const verb = currentVerbId
                            ? details.find(d => d.id === currentVerbId) || details[0]
                            : details[0];

                        return (
                            <div className="verb-tenses-display">
                                {verb.past && <span className="tense-item">Past: {verb.past}</span>}
                                {verb.future && <span className="tense-item">Fut: {verb.future}</span>}
                                {verb.imperative && <span className="tense-item">Imp: {verb.imperative}</span>}
                            </div>
                        );
                    }
                    return null;
                })()}
            </div>
        </div>
    );
};

export default EditPopover;
