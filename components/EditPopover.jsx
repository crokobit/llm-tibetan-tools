import React, { useState, useRef, useEffect } from 'react';
import { useEdit } from '../contexts/index.jsx';

// POS types with English abbreviations only
const POS_TYPES = [
    { id: 'n', label: 'n', features: ['hon'] },
    { id: 'v', label: 'v', features: ['hon', 'tense'] },
    { id: 'adj', label: 'adj', features: [] },
    { id: 'adv', label: 'adv', features: [] },
    { id: 'part', label: 'part', features: [] },
    { id: 'other', label: 'other', features: [] },
];

// Operators with icons
const OPERATORS = [
    { id: 'single', symbol: '•' },
    { id: 'transform', symbol: '→' },
    { id: 'union', symbol: '|' },
];

// Tense options - English abbreviations only
const TENSE_OPTIONS = [
    { id: 'past', label: 'past' },
    { id: 'imp', label: 'imp' },
    { id: 'future', label: 'fut' },
];

const EditPopover = () => {
    const { editingTarget, anchorRect, handleSaveEdit, handleDeleteAnalysis, handleCloseEdit } = useEdit();

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
        text: '', volls: '', root: '', definition: ''
    });
    const [parentMode, setParentMode] = useState('main');
    const popoverRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, opacity: 0 });
    const [placement, setPlacement] = useState('bottom');

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
                // It's a union operator
                const parts = posStr.split('|').map(p => p.trim());
                return {
                    start: parseNode(parts[0]).ids,
                    startAttrs: parseNode(parts[0]).attrs,
                    op: 'union',
                    end: parseNode(parts[1]).ids,
                    endAttrs: parseNode(parts[1]).attrs
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
            // Check if all parts are simple POS types (no parentheses)
            const allSimple = parts.every(p => !p.includes('('));
            if (allSimple) {
                return { ids: parts, attrs: { hon: false, tense: [] } };
            }
        }

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
            setFormData({ text: '', volls: '', root: '', definition: '' });
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
                definition: data.analysis.definition || ''
            });

            // Parse POS into builder state
            const parsed = parsePosString(data.analysis.pos);
            setStartNode(parsed.start);
            setStartAttrs(parsed.startAttrs);
            setOperator(parsed.op);
            setEndNode(parsed.end);
            setEndAttrs(parsed.endAttrs);
        }
    }, [data, isCreating, possibleParents]);

    // Smart Positioning
    React.useLayoutEffect(() => {
        if (!isOpen || !anchorRect || !popoverRef.current) return;

        const popRect = popoverRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const viewportW = window.innerWidth;
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        let top = anchorRect.bottom + scrollY + 12;
        let left = anchorRect.left + scrollX;
        let newPlacement = 'bottom';

        if (anchorRect.bottom + popRect.height + 20 > viewportH + scrollY) {
            if (anchorRect.top - popRect.height - 12 > scrollY) {
                top = anchorRect.top + scrollY - popRect.height - 12;
                newPlacement = 'top';
            } else {
                top = scrollY + viewportH - popRect.height - 10;
                newPlacement = 'bottom';
            }
        }

        if (left + popRect.width > viewportW + scrollX) {
            left = scrollX + viewportW - popRect.width - 10;
        }
        if (left < scrollX) {
            left = scrollX + 10;
        }

        setCoords({ top, left, opacity: 1 });
        setPlacement(newPlacement);
    }, [isOpen, anchorRect, startNode, startAttrs, operator, endNode, endAttrs, parentMode]);

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
        if (attrs.tense && attrs.tense.length > 0) {
            parts.push(...attrs.tense.map(t => t === 'future' ? 'fut' : t));
        }
        if (attrs.hon) parts.push('hon');

        if (parts.length === 0) return nodeId;
        return `${nodeId}(${parts.join(', ')})`;
    };

    // Get preview text
    const getPreviewText = () => {
        if (!startNode || startNode.length === 0) return '...';
        const startText = formatNodeText(startNode, startAttrs);

        if (operator === 'single') return startText;

        const opSymbol = operator === 'transform' ? ' → ' : ' | ';
        const endText = (endNode && endNode.length > 0) ? formatNodeText(endNode, endAttrs) : '?';

        return `${startText}${opSymbol}${endText}`;
    };

    const handleSave = () => {
        const posString = getPreviewText();
        handleSaveEdit({
            ...formData,
            pos: posString,
            tense: ''
        }, parentMode);
    };

    const handleStartNodeChange = (posId) => {
        // Toggle selection for multi-select
        if (startNode.includes(posId)) {
            setStartNode(startNode.filter(id => id !== posId));
        } else {
            setStartNode([...startNode, posId]);
        }
        setStartAttrs({ hon: false, tense: [] });
    };

    const handleEndNodeChange = (posId) => {
        // Toggle selection for multi-select
        if (endNode.includes(posId)) {
            setEndNode(endNode.filter(id => id !== posId));
        } else {
            setEndNode([...endNode, posId]);
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

    const PosButton = ({ type, selected, onClick, disabled }) => (
        <button
            onClick={() => !disabled && onClick(type.id)}
            disabled={disabled}
            className={`pos-button ${selected ? 'selected' : ''}`}
        >
            {type.label}
        </button>
    );

    return (
        <div
            ref={popoverRef}
            className="popover-container"
            style={{ top: coords.top, left: coords.left, opacity: coords.opacity }}
        >
            <div className={`popover-arrow ${placement === 'bottom' ? 'bottom' : 'top'}`}></div>

            <div className="popover-content">
                {/* Text Display */}
                <div className="text-display">
                    {formData.text || '(no text)'}
                </div>

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
                                    disabled={startNode.includes(t.id) && operator === 'transform'}
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

                {/* Root */}
                <input
                    className="form-input"
                    value={formData.root}
                    onChange={e => setFormData({ ...formData, root: e.target.value })}
                    placeholder="Root"
                />

                {/* Volls */}
                <input
                    className="form-input form-input-sm"
                    value={formData.volls}
                    onChange={e => setFormData({ ...formData, volls: e.target.value })}
                    placeholder="Full form"
                />

                {/* Definition */}
                <textarea
                    className="form-input form-input-sm"
                    rows={2}
                    value={formData.definition}
                    onChange={e => setFormData({ ...formData, definition: e.target.value })}
                    placeholder="Definition"
                />
            </div>

            {/* Footer */}
            <div className="popover-footer">
                {!isCreating ? (
                    <button onClick={handleDeleteAnalysis} className="btn-delete">Delete</button>
                ) : <span></span>}
                <button
                    onClick={handleSave}
                    className="btn-save"
                    disabled={startNode.length === 0 || (operator !== 'single' && endNode.length === 0)}
                >
                    Save
                </button>
            </div>
        </div>
    );
};

export default EditPopover;
