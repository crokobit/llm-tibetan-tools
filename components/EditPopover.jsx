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

    // POS Builder state
    const [startNode, setStartNode] = useState(null);
    const [startAttrs, setStartAttrs] = useState({ hon: false, tense: null });
    const [operator, setOperator] = useState('single');
    const [endNode, setEndNode] = useState(null);
    const [endAttrs, setEndAttrs] = useState({ hon: false, tense: null });

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
        if (!posStr) return { start: null, startAttrs: { hon: false, tense: null }, op: 'single', end: null, endAttrs: { hon: false, tense: null } };

        // Check for operators
        if (posStr.includes('->') || posStr.includes('→')) {
            const parts = posStr.split(/->|→/).map(p => p.trim());
            return {
                start: parseNode(parts[0]).id,
                startAttrs: parseNode(parts[0]).attrs,
                op: 'transform',
                end: parseNode(parts[1]).id,
                endAttrs: parseNode(parts[1]).attrs
            };
        } else if (posStr.includes('|')) {
            const parts = posStr.split('|').map(p => p.trim());
            return {
                start: parseNode(parts[0]).id,
                startAttrs: parseNode(parts[0]).attrs,
                op: 'union',
                end: parseNode(parts[1]).id,
                endAttrs: parseNode(parts[1]).attrs
            };
        } else {
            const node = parseNode(posStr);
            return {
                start: node.id,
                startAttrs: node.attrs,
                op: 'single',
                end: null,
                endAttrs: { hon: false, tense: null }
            };
        }
    };

    const parseNode = (nodeStr) => {
        const match = nodeStr.match(/^([a-z]+)(?:\((.*?)\))?$/);
        if (!match) return { id: nodeStr, attrs: { hon: false, tense: null } };

        const id = match[1];
        const attrsStr = match[2];
        const attrs = { hon: false, tense: null };

        if (attrsStr) {
            const parts = attrsStr.split(',').map(p => p.trim());
            parts.forEach(part => {
                if (part === 'hon') attrs.hon = true;
                else if (['past', 'imp', 'future', 'fut'].includes(part)) {
                    attrs.tense = part === 'fut' ? 'future' : part;
                }
            });
        }

        return { id, attrs };
    };

    useEffect(() => {
        if (isCreating) {
            setFormData({ text: '', volls: '', root: '', definition: '' });
            setStartNode(null);
            setStartAttrs({ hon: false, tense: null });
            setOperator('single');
            setEndNode(null);
            setEndAttrs({ hon: false, tense: null });

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
    const formatNodeText = (nodeId, attrs) => {
        if (!nodeId) return '?';
        let parts = [];
        if (attrs.tense) parts.push(attrs.tense === 'future' ? 'fut' : attrs.tense);
        if (attrs.hon) parts.push('hon');

        if (parts.length === 0) return nodeId;
        return `${nodeId}(${parts.join(', ')})`;
    };

    // Get preview text
    const getPreviewText = () => {
        if (!startNode) return '...';
        const startText = formatNodeText(startNode, startAttrs);

        if (operator === 'single') return startText;

        const opSymbol = operator === 'transform' ? ' → ' : ' | ';
        const endText = endNode ? formatNodeText(endNode, endAttrs) : '?';

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
        setStartNode(posId);
        setStartAttrs({ hon: false, tense: null });
    };

    const handleEndNodeChange = (posId) => {
        setEndNode(posId);
        setEndAttrs({ hon: false, tense: null });
    };

    // Attribute Selector Component
    const AttributeSelector = ({ posId, attrs, setAttrs }) => {
        const posConfig = POS_TYPES.find(p => p.id === posId);
        if (!posConfig || (!posConfig.features.includes('hon') && !posConfig.features.includes('tense'))) {
            return null;
        }

        const toggleHon = () => setAttrs({ ...attrs, hon: !attrs.hon });
        const setTense = (tenseId) => setAttrs({ ...attrs, tense: attrs.tense === tenseId ? null : tenseId });

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
                        onClick={() => setTense(opt.id)}
                        className={`pos-option ${attrs.tense === opt.id ? 'active' : ''}`}
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
                            selected={startNode === t.id}
                            onClick={handleStartNodeChange}
                        />
                    ))}
                </div>
                {startNode && (
                    <AttributeSelector
                        posId={startNode}
                        attrs={startAttrs}
                        setAttrs={setStartAttrs}
                    />
                )}

                {/* Operator Selection */}
                <div className={`operator-section ${!startNode ? 'section-disabled' : ''}`}>
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
                {operator !== 'single' && startNode && (
                    <>
                        <div className="pos-button-grid">
                            {POS_TYPES.map(t => (
                                <PosButton
                                    key={t.id}
                                    type={t}
                                    selected={endNode === t.id}
                                    onClick={handleEndNodeChange}
                                    disabled={t.id === startNode && operator === 'transform'}
                                />
                            ))}
                        </div>
                        {endNode && (
                            <AttributeSelector
                                posId={endNode}
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
                    disabled={!startNode || (operator !== 'single' && !endNode)}
                >
                    Save
                </button>
            </div>
        </div>
    );
};

export default EditPopover;
