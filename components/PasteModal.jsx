import React, { useState } from 'react';

export default function PasteModal({ isOpen, onClose, onImport }) {
    const [text, setText] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (text.trim()) {
            onImport(text);
            setText(''); // Clear on success
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ width: '600px', maxWidth: '90%' }}>
                <h3>Import Analyzed Text</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Paste your analyzed Tibetan text string below (format: {`>>> Raw >>>> Analysis >>>>>`}).
                </p>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder=">>> ..."
                    className="modal-input"
                    style={{ height: '200px', fontFamily: 'Monlam, Microsoft Himalaya, sans-serif', fontSize: '1.2rem' }}
                />
                <div className="modal-actions">
                    <button onClick={onClose} className="btn-cancel">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        className="btn-confirm"
                        disabled={!text.trim()}
                    >
                        Import
                    </button>
                </div>
            </div>
        </div>
    );
}
