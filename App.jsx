import React, { useEffect, useRef, useMemo, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AppProviders, useDocument, useEdit, useSelection, useAuth } from './contexts/index.jsx';
import { saveFile, listFiles, getFile, analyzeText, deleteFile, renameFile } from './utils/api.js';
import AnalysisParser from './logic/AnalysisParser.js';
import ResponseProcessor from './logic/ResponseProcessor.js';
import EditPopover from './components/EditPopover.jsx';
import AnalyzeModal from './components/AnalyzeModal.jsx';
import PasteModal from './components/PasteModal.jsx';
import RichTextBlock from './components/RichTextBlock.jsx';
import TibetanBlock from './components/TibetanBlock.jsx';

// Internal component that uses contexts
function TibetanReaderContent() {
    const { documentData, setDocumentData, loading, isMammothLoaded, setIsMammothLoaded, handleFileUpload, showDebug, setShowDebug, rawText, insertRichTextBlock, insertTibetanBlock, deleteBlock, updateRichTextBlock } = useDocument();
    const { editingTarget, setEditingTarget } = useEdit();
    const { selectMode, setSelectMode } = useSelection();
    const { user, token, signIn, logout, refreshSession } = useAuth();
    const [showFileList, setShowFileList] = useState(false);
    const [userFiles, setUserFiles] = useState([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveFilename, setSaveFilename] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [isLoadingFile, setIsLoadingFile] = useState(null);
    const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [notification, setNotification] = useState(null);
    const contentRef = useRef(null);
    const ignoreClickRef = useRef(false);

    const isApiBusy = isSaving || isLoadingFiles || !!isLoadingFile;

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


    const showToast = (message) => {
        setNotification(message);
        setTimeout(() => setNotification(null), 2000);
    };

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
        setIsSaving(true);
        try {
            const content = JSON.stringify(documentData);
            await saveFile(token, saveFilename, content);
            setShowSaveDialog(false);
            showToast('File saved successfully!');
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                try {
                    const newToken = await refreshSession();
                    // Retry with new token
                    await saveFile(newToken, saveFilename, content);
                    setShowSaveDialog(false);
                    showToast('File saved successfully!');
                } catch (refreshError) {
                    showToast('Session expired. Please login again.');
                    logout();
                }
            } else {
                showToast('Failed to save file.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenCloud = async () => {
        setIsLoadingFiles(true);
        try {
            const files = await listFiles(token);
            setUserFiles(files);
            setShowFileList(true);
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                try {
                    const newToken = await refreshSession();
                    // Retry with new token
                    const files = await listFiles(newToken);
                    setUserFiles(files);
                    setShowFileList(true);
                } catch (refreshError) {
                    showToast('Session expired. Please login again.');
                    logout();
                }
            } else {
                showToast('Failed to list files.');
            }
        } finally {
            setIsLoadingFiles(false);
        }
    };

    const handleDeleteCloud = async (filename) => {
        if (!window.confirm(`Are you sure you want to delete "${filename}"?`)) return;

        setIsSaving(true);
        try {
            await deleteFile(token, filename);
            showToast('File deleted successfully');

            // Refresh list if list is open
            if (showFileList) {
                const files = await listFiles(token);
                setUserFiles(files);
            }

            // If deleted file was open, clear saveFilename
            if (saveFilename === filename) {
                setSaveFilename('');
            }
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                try {
                    const newToken = await refreshSession();
                    await deleteFile(newToken, filename);
                    showToast('File deleted successfully');
                    if (showFileList) {
                        const files = await listFiles(newToken);
                        setUserFiles(files);
                    }
                    if (saveFilename === filename) {
                        setSaveFilename('');
                    }
                } catch (refreshError) {
                    showToast('Session expired. Please login again.');
                    logout();
                }
            } else {
                showToast('Failed to delete file.');
            }
        } finally {
            setIsSaving(false);
        }
    };
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [renameFilename, setRenameFilename] = useState('');
    const [renameNewFilename, setRenameNewFilename] = useState('');


    const handleRenameCloud = async () => {
        if (!renameFilename || !renameNewFilename) return;
        if (renameFilename === renameNewFilename) {
            setShowRenameDialog(false);
            return;
        }

        setIsSaving(true);
        try {
            await renameFile(token, renameFilename, renameNewFilename);
            showToast('File renamed successfully');
            setShowRenameDialog(false);

            // Update userFiles list
            setUserFiles(prev => prev.map(f => f.filename === renameFilename ? { ...f, filename: renameNewFilename } : f));

            // If current file was renamed, update saveFilename
            if (saveFilename === renameFilename) {
                setSaveFilename(renameNewFilename);
            }

            // If we are in file list mode, refresh list just in case (optional, but good for consistency)
            if (showFileList) {
                const files = await listFiles(token);
                setUserFiles(files);
            }

        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                try {
                    const newToken = await refreshSession();
                    await renameFile(newToken, renameFilename, renameNewFilename);
                    showToast('File renamed successfully');
                    setShowRenameDialog(false);
                    // Update userFiles list
                    setUserFiles(prev => prev.map(f => f.filename === renameFilename ? { ...f, filename: renameNewFilename } : f));

                    if (saveFilename === renameFilename) {
                        setSaveFilename(renameNewFilename);
                    }
                    if (showFileList) {
                        const files = await listFiles(newToken);
                        setUserFiles(files);
                    }

                } catch (refreshError) {
                    showToast('Session expired. Please login again.');
                    logout();
                }
            } else {
                showToast('Failed to rename file: ' + error.message);
            }
        } finally {
            setIsSaving(false);
        }
    };



    const loadFile = async (filename) => {
        setIsLoadingFile(filename);
        try {
            const response = await getFile(token, filename);
            // Expecting response to be { content: "stringified_json" }
            if (response && response.content) {
                const data = JSON.parse(response.content);
                const dataNoDebug = data.map(block => ({ ...block, _showDebug: false }));
                setDocumentData(dataNoDebug);
                setSaveFilename(filename);
                setShowFileList(false);

            } else {
                throw new Error("Invalid file format");
            }
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                try {
                    const newToken = await refreshSession();
                    // Retry with new token
                    const response = await getFile(newToken, filename);
                    if (response && response.content) {
                        const data = JSON.parse(response.content);
                        const dataNoDebug = data.map(block => ({ ...block, _showDebug: false }));
                        setDocumentData(dataNoDebug);
                        setSaveFilename(filename);
                        setShowFileList(false);

                    }
                } catch (refreshError) {
                    showToast('Session expired. Please login again.');
                    logout();
                }
            } else {
                showToast('Failed to load file.');
            }
        } finally {
            setIsLoadingFile(null);
        }
    };

    const handleAnalyze = async (text) => {
        setIsAnalyzing(true);
        try {
            // STEP 1: Start Analysis Job
            let jobResponse;
            try {
                jobResponse = await analyzeText(token, text);
            } catch (error) {
                if (error.message === 'Unauthorized') {
                    const newToken = await refreshSession();
                    jobResponse = await analyzeText(newToken, text);
                } else {
                    throw error;
                }
            }

            const { jobId } = jobResponse;
            if (!jobId) throw new Error("No job ID returned");

            showToast('Analysis started... please wait');

            // STEP 2: Poll for Result
            const pollInterval = 2000; // 2 seconds
            const maxAttempts = 150; // 5 minutes (300s)

            for (let i = 0; i < maxAttempts; i++) {
                // Wait
                await new Promise(resolve => setTimeout(resolve, pollInterval));

                // Check Status
                let jobStatus;
                try {
                    // Using api.js import implicitly, but need to make sure getJob is imported
                    jobStatus = await import('./utils/api.js').then(m => m.getJob(token, jobId));
                } catch (err) {
                    if (err.message === 'Unauthorized') {
                        const newToken = await refreshSession();
                        jobStatus = await import('./utils/api.js').then(m => m.getJob(newToken, jobId));
                    } else {
                        throw err;
                    }
                }

                if (jobStatus.status === 'COMPLETED') {
                    const newBlocks = ResponseProcessor.process(jobStatus.result);
                    setDocumentData(prev => [...prev, ...newBlocks]);
                    setShowAnalyzeModal(false);
                    showToast('Analysis complete!');
                    return;
                } else if (jobStatus.status === 'FAILED') {
                    throw new Error(jobStatus.error || "Job failed");
                }
                // If PENDING, continue loop
            }

            throw new Error("Analysis timed out");

        } catch (error) {
            console.error(error);
            showToast('Analysis failed: ' + error.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handlePasteAnalyzed = (text) => {
        try {
            const newBlocks = ResponseProcessor.process(text);
            if (newBlocks.length === 0) {
                showToast('No valid blocks found in text.');
                return;
            }
            setDocumentData(prev => [...prev, ...newBlocks]);
            setShowDebug(false);
            setShowPasteModal(false);
            showToast('Text imported successfully!');
        } catch (error) {
            console.error(error);
            showToast('Failed to parse text: ' + error.message);
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

    const handleAnalyzeBlock = async (blockIdx, text) => {
        setDocumentData(prev => {
            const newData = [...prev];
            newData[blockIdx] = { ...newData[blockIdx], _isAnalyzing: true };
            return newData;
        });

        try {
            // STEP 1: Start Analysis Job
            let jobResponse;
            try {
                jobResponse = await analyzeText(token, text);
            } catch (error) {
                if (error.message === 'Unauthorized') {
                    const newToken = await refreshSession();
                    jobResponse = await analyzeText(newToken, text);
                } else {
                    throw error;
                }
            }

            const { jobId } = jobResponse;
            if (!jobId) throw new Error("No job ID returned");

            showToast('Analysis started...');

            // STEP 2: Poll for Result
            const pollInterval = 2000;
            const maxAttempts = 150;

            for (let i = 0; i < maxAttempts; i++) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));

                let jobStatus;
                try {
                    jobStatus = await import('./utils/api.js').then(m => m.getJob(token, jobId));
                } catch (err) {
                    if (err.message === 'Unauthorized') {
                        const newToken = await refreshSession();
                        jobStatus = await import('./utils/api.js').then(m => m.getJob(newToken, jobId));
                    } else {
                        throw err;
                    }
                }

                if (jobStatus.status === 'COMPLETED') {
                    const newBlocks = ResponseProcessor.process(jobStatus.result);

                    setDocumentData(prev => {
                        const newData = [...prev];
                        // Replace the input block with the new analyzed blocks
                        newData.splice(blockIdx, 1, ...newBlocks);
                        return newData;
                    });

                    showToast('Analysis complete!');
                    return;
                } else if (jobStatus.status === 'FAILED') {
                    throw new Error(jobStatus.error || "Job failed");
                }
            }
            throw new Error("Analysis timed out");

        } catch (error) {
            console.error(error);
            showToast('Analysis failed: ' + error.message);
            // Reset analyzing state on error
            setDocumentData(prev => {
                const newData = [...prev];
                // Check if block still exists and is input mode (it might have changed if user deleted everything, but unlikely)
                if (newData[blockIdx]) {
                    newData[blockIdx] = { ...newData[blockIdx], _isAnalyzing: false };
                }
                return newData;
            });
        }
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
                    {user && (
                        <button
                            onClick={handleOpenCloud}
                            disabled={isApiBusy}
                            className={`btn-export ${isApiBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ marginRight: '10px' }}
                        >
                            {isLoadingFiles ? 'Loading...' : 'Open from Cloud'}
                        </button>
                    )}
                    <button
                        onClick={() => setShowPasteModal(true)}
                        className="btn-export"
                        style={{ marginRight: '10px' }}
                    >
                        Add analyzed text
                    </button>

                    {saveFilename ? (
                        <div className="file-input-custom" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: 600, color: '#2563eb' }}>{saveFilename}</span>
                        </div>
                    ) : (
                        <input
                            type="file"
                            accept=".docx,.txt"
                            onChange={handleFileUpload}
                            className="file-input-custom"
                        />
                    )}
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
                                    <button
                                        onClick={() => saveFilename ? handleSaveCloud() : setShowSaveDialog(true)}
                                        className={`btn-export ${isApiBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={isApiBusy}
                                    >
                                        {isSaving ? 'Saving...' : (saveFilename ? 'Save' : 'Save to Cloud')}
                                    </button>
                                    {saveFilename && (
                                        <button
                                            onClick={() => {
                                                setRenameFilename(saveFilename);
                                                setRenameNewFilename(saveFilename);
                                                setShowRenameDialog(true);
                                            }}
                                            className="btn-export"
                                            disabled={isApiBusy}
                                            style={{ marginLeft: '10px' }}
                                        >
                                            Rename
                                        </button>
                                    )}
                                    {saveFilename && (
                                        <button
                                            onClick={() => handleDeleteCloud(saveFilename)}
                                            className={`btn-export bg-red-600 hover:bg-red-700 ${isApiBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={isApiBusy}
                                            style={{ marginLeft: '10px', backgroundColor: '#dc2626', color: 'white' }}
                                        >
                                            Delete
                                        </button>
                                    )}
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
                                        onChange={(e) => {
                                            setShowDebug(e.target.checked);
                                            setDocumentData(prev => prev.map(b => ({ ...b, _showDebug: false })));
                                        }}
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
                                <div className="empty-state-hint" style={{ textAlign: 'center', margin: '20px 0', color: '#666' }}>
                                    Start by "+ analyzed text" or "+ Tibetan" then analyse later.
                                    <div className="block-insert-controls" style={{ justifyContent: 'center', marginTop: '10px' }}>
                                        <button onClick={() => insertRichTextBlock(-1)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                        <button onClick={() => insertTibetanBlock(-1)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
                                        <button onClick={() => setShowPasteModal(true)} className="btn-insert-small" title="Add analyzed text">+ Analyzed Text</button>
                                    </div>
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
                                            onAnalyze={handleAnalyzeBlock}
                                            isAnalyzing={block._isAnalyzing}
                                        />
                                    )}

                                    {/* Insert buttons after each block */}
                                    <div className="block-insert-controls">

                                        <button onClick={() => insertRichTextBlock(blockIdx)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                        <button onClick={() => insertTibetanBlock(blockIdx)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
                                        <button onClick={() => setShowPasteModal(true)} className="btn-insert-small" title="Add analyzed text">+ Analyzed Text</button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Edit Popover */}
            <EditPopover />

            {/* Analyze Modal */}
            <AnalyzeModal
                isOpen={showAnalyzeModal}
                onClose={() => setShowAnalyzeModal(false)}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
            />

            {/* Paste Modal */}
            <PasteModal
                isOpen={showPasteModal}
                onClose={() => setShowPasteModal(false)}
                onImport={handlePasteAnalyzed}
            />

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
                            <button onClick={() => setShowSaveDialog(false)} className="btn-cancel" disabled={isApiBusy}>Cancel</button>
                            <button onClick={handleSaveCloud} className="btn-confirm" disabled={isApiBusy}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
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
                                <li key={file.filename} className={`file-item ${isApiBusy ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span onClick={() => !isApiBusy && loadFile(file.filename)} style={{ flexGrow: 1, cursor: 'pointer' }}>
                                        {file.filename} {isLoadingFile === file.filename && '(Loading...)'}
                                    </span>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRenameFilename(file.filename);
                                                setRenameNewFilename(file.filename);
                                                setShowRenameDialog(true);
                                            }}
                                            className="btn-export"
                                            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                                            disabled={isApiBusy}
                                        >
                                            Rename
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteCloud(file.filename);
                                            }}
                                            className="btn-delete-small"
                                            style={{ padding: '2px 8px', fontSize: '0.8rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            disabled={isApiBusy}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setShowFileList(false)} className="btn-cancel">Close</button>
                    </div>
                </div>
            )}

            {/* Rename Dialog */}
            {showRenameDialog && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Rename File</h3>
                        <input
                            type="text"
                            value={renameNewFilename}
                            onChange={(e) => setRenameNewFilename(e.target.value)}
                            placeholder="Enter new filename"
                            className="modal-input"
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowRenameDialog(false)} className="btn-cancel" disabled={isApiBusy}>Cancel</button>
                            <button onClick={handleRenameCloud} className="btn-confirm" disabled={isApiBusy}>
                                {isSaving ? 'Renaming...' : 'Rename'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {notification && (
                <div className="toast-notification">
                    {notification}
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
