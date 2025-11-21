import React, { useState, useRef, useEffect } from 'react';
import { useEdit } from '../contexts/index.jsx';
import PosSelect from './PosSelect.jsx';

const EditPopover = () => {
    const { editingTarget, anchorRect, handleSaveEdit, handleDeleteAnalysis, handleCloseEdit } = useEdit();

    const isOpen = !!editingTarget;
    const data = editingTarget ? editingTarget.unit : null;
    const isCreating = editingTarget ? editingTarget.isCreating : false;
    const possibleParents = editingTarget ? editingTarget.possibleParents : [];

    const [formData, setFormData] = useState({
        volls: '', root: '', pos: '', tense: [], definition: ''
    });
    const [parentMode, setParentMode] = useState('main'); // 'main' or 'sub'
    const popoverRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, opacity: 0 });
    const [placement, setPlacement] = useState('bottom');

    useEffect(() => {
        if (isCreating) {
            setFormData({ volls: '', root: '', pos: 'other', tense: [], definition: '' });
            // Default to 'sub' if available as it's likely the intent when selecting inside a word
            if (possibleParents && possibleParents.length > 0) {
                const subOption = possibleParents.find(p => p.id === 'sub');
                if (subOption) setParentMode('sub');
                else setParentMode('main');
            } else {
                setParentMode('main');
            }
        } else if (data && data.analysis) {
            setFormData({
                volls: data.analysis.volls || '',
                root: data.analysis.root || '',
                pos: data.analysis.pos || '',
                tense: data.analysis.tense ? data.analysis.tense.split('|') : [],
                definition: data.analysis.definition || ''
            });
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
    }, [isOpen, anchorRect, formData.pos, formData.tense.length, parentMode]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            // Don't close if clicking inside the popover
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                handleCloseEdit();
            }
        };

        if (isOpen) {
            // Use a slight delay to ensure the popover is fully rendered before adding listener
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

    const handleSave = () => {
        handleSaveEdit({
            ...formData,
            tense: formData.tense.join('|')
        }, parentMode);
    };

    const toggleTense = (val) => {
        setFormData(prev => ({
            ...prev,
            tense: prev.tense.includes(val)
                ? prev.tense.filter(t => t !== val)
                : [...prev.tense, val]
        }));
    }

    const isVerb = ['v', 'vd', 'vn'].some(t => formData.pos.includes(t));

    return (
        <div
            ref={popoverRef}
            className="popover-container"
            style={{ top: coords.top, left: coords.left, opacity: coords.opacity }}
        >
            {/* Arrow */}
            <div
                className={`popover-arrow ${placement === 'bottom' ? 'bottom' : 'top'}`}
            ></div>

            <div className="popover-content">
                {/* Parent Selection Dropdown - Hidden for now */}
                {false && isCreating && possibleParents && possibleParents.length > 1 && (
                    <div className="mb-2">
                        <label className="block text-xs text-gray-500 mb-1">Add Analysis To:</label>
                        <select
                            value={parentMode}
                            onChange={(e) => setParentMode(e.target.value)}
                            className="w-full border rounded px-2 py-1 text-xs bg-blue-50 border-blue-200 text-blue-800 font-medium focus:outline-none focus:border-blue-400"
                        >
                            {possibleParents.map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Row 1: Root & POS */}
                <div className="flex gap-2">
                    <div className="flex-1">
                        <input
                            className="form-input"
                            value={formData.root}
                            onChange={e => setFormData({ ...formData, root: e.target.value })}
                            placeholder="Root"
                        />
                    </div>
                    <div className="w-24">
                        <PosSelect value={formData.pos} onChange={(val) => setFormData({ ...formData, pos: val })} />
                    </div>
                </div>

                {/* Row 2: Volls (Optional) */}
                <div>
                    <input
                        className="form-input text-xs"
                        value={formData.volls}
                        onChange={e => setFormData({ ...formData, volls: e.target.value })}
                        placeholder="Full form (optional)"
                    />
                </div>

                {/* Row 3: Tense (Conditional) */}
                {isVerb && (
                    <div className="flex flex-wrap gap-1">
                        {['past', 'future', 'imperative'].map(t => (
                            <button
                                key={t}
                                onClick={() => toggleTense(t)}
                                className={`tense-button ${formData.tense.includes(t) ? 'active' : 'inactive'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                )}

                {/* Row 4: Definition */}
                <div>
                    <textarea
                        className="form-input text-xs"
                        rows={2}
                        value={formData.definition}
                        onChange={e => setFormData({ ...formData, definition: e.target.value })}
                        placeholder="Definition..."
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="popover-footer">
                {!isCreating ? (
                    <button onClick={handleDeleteAnalysis} className="btn-delete">Delete</button>
                ) : <span></span>}
                <button onClick={handleSave} className="btn-save">Save</button>
            </div>
        </div>
    );
};

export default EditPopover;
