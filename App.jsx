import React, { useEffect, useRef, useMemo } from 'react';
import { AppProviders, useDocument, useEdit } from './contexts/index.jsx';
import AnalysisParser from './logic/AnalysisParser.js';
import LineRenderer from './components/LineRenderer.jsx';
import EditPopover from './components/EditPopover.jsx';

// Internal component that uses contexts
function TibetanReaderContent() {
    const { documentData, loading, isMammothLoaded, setIsMammothLoaded, handleFileUpload, showDebug, setShowDebug, rawText } = useDocument();
    const { editingTarget, setEditingTarget } = useEdit();
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
            output += '>>>\n';
            // Reconstruct raw text
            let rawText = '';
            block.lines.forEach(line => {
                line.units.forEach(u => rawText += u.original);
            });
            output += rawText + '\n';
            // Analysis
            output += AnalysisParser.format(block.lines) + '\n';
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
                    <label className="debug-mode-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                        <input
                            type="checkbox"
                            checked={showDebug}
                            onChange={(e) => setShowDebug(e.target.checked)}
                        />
                        Debug Mode
                    </label>
                </div>

                {/* Content Area */}
                {/* Content Area with Debug Sidebar */}
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div className="content-area" ref={contentRef} style={{ flex: 1, minWidth: 0 }}>
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
                                            editingTarget={editingTarget}
                                            isAnyEditActive={!!editingTarget}
                                        />
                                    ))}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Debug Panel */}
                    {showDebug && (
                        <div style={{ width: '350px', flexShrink: 0, padding: '1rem', borderLeft: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                            <div className="debug-container" style={{ marginTop: 0 }}>
                                <div className="debug-header">
                                    <span>Current Text</span>
                                    <button
                                        className="btn-copy"
                                        onClick={() => navigator.clipboard.writeText(debugText)}
                                        title="Copy to clipboard"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <textarea
                                    className="debug-textarea"
                                    value={debugText}
                                    readOnly
                                />
                            </div>
                        </div>
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
