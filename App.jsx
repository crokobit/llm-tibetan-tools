import React, { useEffect, useRef, useMemo, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AppProviders, useDocument, useEdit, useSelection, useAuth } from './contexts/index.jsx';
import { saveFile, listFiles, getFile } from './utils/api.js';
import AnalysisParser from './logic/AnalysisParser.js';
import EditPopover from './components/EditPopover.jsx';
import RichTextBlock from './components/RichTextBlock.jsx';
import TibetanBlock from './components/TibetanBlock.jsx';

// Internal component that uses contexts
function TibetanReaderContent() {
    const { documentData, setDocumentData, loading, isMammothLoaded, setIsMammothLoaded, handleFileUpload, showDebug, setShowDebug, rawText, insertRichTextBlock, insertTibetanBlock, deleteBlock, updateRichTextBlock } = useDocument();
    const { editingTarget, setEditingTarget } = useEdit();
    const { selectMode, setSelectMode } = useSelection();
    const { user, token, signIn, logout } = useAuth();
    const [showFileList, setShowFileList] = useState(false);
    const [userFiles, setUserFiles] = useState([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveFilename, setSaveFilename] = useState('');
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

    const handleSaveCloud = async () => {
        if (!saveFilename) return;
        try {
            const content = JSON.stringify(documentData);
            await saveFile(token, saveFilename, content);
            setShowSaveDialog(false);
            setSaveFilename('');
            alert('File saved successfully!');
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                alert('Session expired. Please login again.');
                logout();
            } else {
                alert('Failed to save file.');
            }
        }
    };

    const handleOpenCloud = async () => {
        try {
            const files = await listFiles(token);
            setUserFiles(files);
            setShowFileList(true);
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                alert('Session expired. Please login again.');
                logout();
            } else {
                alert('Failed to list files.');
            }
        }
    };

    const loadFile = async (filename) => {
        try {
            const response = await getFile(token, filename);
            // Expecting response to be { content: "stringified_json" }
            if (response && response.content) {
                const data = JSON.parse(response.content);
                setDocumentData(data);
                setShowFileList(false);
            } else {
                throw new Error("Invalid file format");
            }
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                alert('Session expired. Please login again.');
                logout();
            } else {
                alert('Failed to load file.');
            }
        }
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
                    <div className="auth-controls">
                        {user ? (
                            <div className="user-info">
                                <span className="user-name">Welcome, {user.name}</span>
                                <button onClick={logout} className="btn-auth">Logout</button>
                            </div>
                        ) : (
                            <button onClick={() => signIn()} className="btn-auth">Login with Google</button>
                        )}
                    </div>
                </div>

                {/* Toolbar */}
                <div className="toolbar-container">
                    <input
                        type="file"
                        accept=".docx,.txt"
                        onChange={handleFileUpload}
                        className="file-input-custom"
                    />
                    {documentData.length > 0 && (
                        <>
                            <button
                                onClick={downloadOutput}
                                className="btn-export"
                            >
                                Export Text
                            </button>
                            {user && (
                                <>
                                    <button onClick={() => setShowSaveDialog(true)} className="btn-export">Save to Cloud</button>
                                    <button onClick={handleOpenCloud} className="btn-export">Open from Cloud</button>
                                </>
                            )}
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
                        </>
                    )}
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
                                    {/* Empty state content removed as requested */}
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

            {/* Save Dialog */}
            {showSaveDialog && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Save File</h3>
                        <input
                            type="text"
                            value={saveFilename}
                            onChange={(e) => setSaveFilename(e.target.value)}
                            placeholder="Enter filename"
                            className="modal-input"
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowSaveDialog(false)} className="btn-cancel">Cancel</button>
                            <button onClick={handleSaveCloud} className="btn-confirm">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* File List Dialog */}
            {showFileList && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Your Files</h3>
                        <ul className="file-list">
                            {userFiles.map(file => (
                                <li key={file.filename} onClick={() => loadFile(file.filename)} className="file-item">
                                    {file.filename}
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setShowFileList(false)} className="btn-cancel">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Main component wrapped with providers
export default function TibetanReader() {
    return (
        <GoogleOAuthProvider clientId="642729519619-j2r2l2ccvi5g8b7ervhq73ok199na7ua.apps.googleusercontent.com">
            <AppProviders>
                <TibetanReaderContent />
            </AppProviders>
        </GoogleOAuthProvider>
    );
}
