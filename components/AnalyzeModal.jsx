import React, { useState } from 'react';

export default function AnalyzeModal({ isOpen, onClose, onAnalyze, isAnalyzing }) {
    const [text, setText] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (text.trim()) {
            onAnalyze(text);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ width: '600px', maxWidth: '90%' }}>
                <h3>Analyze Tibetan Text</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Paste your Tibetan text below. The AI will analyze it and generate a structured breakdown.
                </p>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste Tibetan text here..."
                    className="modal-input"
                    style={{ height: '200px', fontFamily: 'Monlam, Microsoft Himalaya, sans-serif', fontSize: '1.2rem' }}
                />
                <div className="modal-actions">
                    <button onClick={onClose} className="btn-cancel" disabled={isAnalyzing}>Cancel</button>
                    <button
                        onClick={handleSubmit}
                        className="btn-confirm"
                        disabled={isAnalyzing || !text.trim()}
                    >
                        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                    </button>
                </div>
            </div>
        </div>
    );
}
