import React, { useEffect, useRef, useMemo } from 'react';
import { AppProviders, useDocument, useEdit, useSelection } from './contexts/index.jsx';
import AnalysisParser from './logic/AnalysisParser.js';
import EditPopover from './components/EditPopover.jsx';
import RichTextBlock from './components/RichTextBlock.jsx';
import TibetanBlock from './components/TibetanBlock.jsx';

// Internal component that uses contexts
function TibetanReaderContent() {
    const { documentData, setDocumentData, loading, isMammothLoaded, setIsMammothLoaded, handleFileUpload, showDebug, setShowDebug, rawText, insertRichTextBlock, insertTibetanBlock, deleteBlock, updateRichTextBlock } = useDocument();
    const { editingTarget, setEditingTarget } = useEdit();
    const { selectMode, setSelectMode } = useSelection();
    const contentRef = useRef(null);
    const ignoreClickRef = useRef(false);

    // Load mammoth.js library
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
    }, [setIsMammothLoaded]);


    // Generate Output
    const debugText = useMemo(() => {
        let output = '';
        documentData.forEach(block => {
            if (block.type === 'richtext') {
                // Export rich text as HTML comment for now
                output += '<!-- RICHTEXT:\n' + block.content + '\n-->\n\n';
            } else if (block.type === 'tibetan') {
                output += '>>>\n';
                // Reconstruct raw text
                let rawText = '';
                block.lines.forEach((line, idx) => {
                    if (idx > 0) rawText += '\n';
                    line.units.forEach(u => rawText += u.original);
                });
                output += rawText + '\n';
                // Analysis
                output += '>>>>\n' + AnalysisParser.format(block.lines) + '\n>>>>>';
            }
        });
        return output;
    }, [documentData]);

    const downloadOutput = () => {
        const blob = new Blob([debugText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'analyzed_text.txt';
        a.click();
    };

    const handleBlockUpdate = (blockIdx, newBlock) => {
        setDocumentData(prev => {
            const newData = [...prev];
            newData[blockIdx] = newBlock;
            return newData;
        });
    };

    const toggleBlockDebug = (blockIdx) => {
        setDocumentData(prev => {
            const newData = [...prev];
            const block = newData[blockIdx];
            newData[blockIdx] = { ...block, _showDebug: !block._showDebug };
            return newData;
        });
    };

    return (
        <div className="app-background" onClick={(e) => {
            // Don't close popup if clicking inside the popover
            if (e.target.closest('.popover-container')) {
                return;
            }

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
                        accept=".docx,.txt"
                        onChange={handleFileUpload}
                        className="file-input-custom"
                    />
                    <button
                        onClick={downloadOutput}
                        className="btn-export"
                    >
                        Export Text
                    </button>
                    <div className="toolbar-controls-container">
                        <label className="debug-mode-label">
                            <input
                                type="checkbox"
                                checked={selectMode}
                                onChange={(e) => setSelectMode(e.target.checked)}
                            />
                            Select Mode
                        </label>
                        <label className="debug-mode-label">
                            <input
                                type="checkbox"
                                checked={showDebug}
                                onChange={(e) => setShowDebug(e.target.checked)}
                            />
                            Debug Mode
                        </label>
                    </div>
                </div>

                {/* Content Area */}
                <div className="content-area tibetan-content" ref={contentRef}>
                    {loading ? (
                        <div className="loading-container">
                            <div className="loading-spinner"></div>
                        </div>
                    ) : (
                        <>
                            {documentData.length === 0 && (
                                <div className="empty-state">
                                    <p>No content yet. Add a block to get started!</p>
                                    <button onClick={() => insertRichTextBlock(-1)} className="btn-insert">+ Rich Text</button>
                                    <button onClick={() => insertTibetanBlock(-1)} className="btn-insert">+ Tibetan</button>
                                </div>
                            )}
                            {documentData.map((block, blockIdx) => (
                                <div key={blockIdx} className="block-wrapper">
                                    {/* Render block based on type */}
                                    {block.type === 'richtext' ? (
                                        <RichTextBlock
                                            content={block.content}
                                            onChange={(newContent) => updateRichTextBlock(blockIdx, newContent)}
                                            onDelete={() => deleteBlock(blockIdx)}
                                            blockIdx={blockIdx}
                                        />
                                    ) : (
                                        <TibetanBlock
                                            block={block}
                                            blockIdx={blockIdx}
                                            onUpdate={handleBlockUpdate}
                                            editingTarget={editingTarget}
                                            showDebug={showDebug || block._showDebug}
                                        />
                                    )}

                                    {/* Insert buttons after each block */}
                                    <div className="block-insert-controls">
                                        <button onClick={() => insertRichTextBlock(blockIdx)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                        <button onClick={() => insertTibetanBlock(blockIdx)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
                                        {block.type === 'tibetan' && (
                                            <button
                                                onClick={() => toggleBlockDebug(blockIdx)}
                                                className={`btn-insert-small ${block._showDebug ? 'bg-blue-50 text-blue-600 border-blue-200' : ''}`}
                                                title="Toggle Debug View"
                                            >
                                                {block._showDebug ? 'Hide Debug' : 'Debug'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Edit Popover */}
            <EditPopover />
        </div>
    );
}

// Main component wrapped with providers
export default function TibetanReader() {
    return (
        <AppProviders>
            <TibetanReaderContent />
        </AppProviders>
    );
}
