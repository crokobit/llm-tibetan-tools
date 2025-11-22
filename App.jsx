import React, { useEffect, useRef, useMemo } from 'react';
import { AppProviders, useDocument, useEdit, useSelection } from './contexts/index.jsx';
import AnalysisParser from './logic/AnalysisParser.js';
import LineRenderer from './components/LineRenderer.jsx';
import EditPopover from './components/EditPopover.jsx';
import RichTextBlock from './components/RichTextBlock.jsx';

import DebugBlockEditor from './components/DebugBlockEditor.jsx';

// Internal component that uses contexts
function TibetanReaderContent() {
    const { documentData, setDocumentData, loading, isMammothLoaded, setIsMammothLoaded, handleFileUpload, showDebug, setShowDebug, rawText, insertRichTextBlock, insertTibetanBlock, deleteBlock, updateRichTextBlock } = useDocument();
    const { editingTarget, setEditingTarget } = useEdit();
    const { copyMode, setCopyMode } = useSelection();
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
                block.lines.forEach(line => {
                    line.units.forEach(u => rawText += u.original);
                });
                output += rawText + '\n';
                // Analysis
                output += AnalysisParser.format(block.lines) + '\n';
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
                        <label className="debug-mode-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                checked={copyMode}
                                onChange={(e) => setCopyMode(e.target.checked)}
                            />
                            Copy Mode
                        </label>
                        <label className="debug-mode-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                                <div key={blockIdx}>
                                    {/* Render block based on type */}
                                    {block.type === 'richtext' ? (
                                        <RichTextBlock
                                            content={block.content}
                                            onChange={(newContent) => updateRichTextBlock(blockIdx, newContent)}
                                            onDelete={() => deleteBlock(blockIdx)}
                                            blockIdx={blockIdx}
                                        />
                                    ) : (
                                        <div className="block-layout">
                                            {block.lines.map((line, lineIdx) => (
                                                <LineRenderer
                                                    key={lineIdx}
                                                    line={line}
                                                    blockIdx={blockIdx}
                                                    lineIdx={lineIdx}
                                                    editingTarget={editingTarget}
                                                    isAnyEditActive={!!editingTarget}
                                                />
                                            ))}
                                            {showDebug && (
                                                <DebugBlockEditor
                                                    block={block}
                                                    onUpdate={(newBlock) => handleBlockUpdate(blockIdx, newBlock)}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Insert buttons after each block */}
                                    <div className="block-insert-controls">
                                        <button onClick={() => insertRichTextBlock(blockIdx)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                        <button onClick={() => insertTibetanBlock(blockIdx)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
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
