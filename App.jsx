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

import { lookupVerb } from './utils/verbLookup.js';
import { disambiguateVerbs } from './utils/api.js';

// Internal component that uses contexts - Main Reader Content
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
    const [isPolishing, setIsPolishing] = useState(false);
    const contentRef = useRef(null);
    const ignoreClickRef = useRef(false);

    const isApiBusy = isSaving || isLoadingFiles || !!isLoadingFile || isPolishing;

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

    const handlePolishVerbs = async () => {
        setIsPolishing(true);
        let count = 0;
        try {
            const newData = JSON.parse(JSON.stringify(documentData));
            const allAmbiguousItems = [];
            let fullText = '';
            let globalOffset = 0;

            // 1. Scan Document
            newData.forEach((block) => {
                if (block.type !== 'tibetan') return;

                let blockText = '';
                block.lines.forEach((line, idx) => {
                    if (idx > 0) blockText += '\n';
                    line.units.forEach(u => blockText += u.original);
                });

                // Scan verbs in this block
                let currentBlockOffset = 0;
                block.lines.forEach((line, lineIdx) => {
                    if (lineIdx > 0) currentBlockOffset += 1; // Newline (implicitly handled by blockText structure, but precise tracking helps)
                    line.units.forEach((unit) => {
                        const unitLen = unit.original.length;

                        // Skip if already has ID
                        if (!(unit.analysis && unit.analysis.verbId)) {
                            const matches = lookupVerb(unit.original);
                            if (matches && matches.length > 0) {
                                // Smart Deduplication:
                                // Filter out entries that have identical meaning (Tenses + Definition + Volition)
                                const uniqueMap = new Map();
                                matches.forEach(m => {
                                    const tensesStr = m.tenses ? (Array.isArray(m.tenses) ? m.tenses.sort().join(',') : m.tenses) : (m.tense || '');
                                    const key = `${tensesStr}|${m.definition}|${m.volition}`;
                                    if (!uniqueMap.has(key)) {
                                        uniqueMap.set(key, m);
                                    }
                                });

                                const uniqueMatches = Array.from(uniqueMap.values());

                                if (uniqueMatches.length === 1) {
                                    // Deterministic
                                    count++;
                                    applyVerbMatch(unit, uniqueMatches[0]);
                                } else {
                                    // Ambiguous
                                    const absIndex = globalOffset + currentBlockOffset;
                                    allAmbiguousItems.push({
                                        indexInText: absIndex,
                                        original: unit.original,
                                        verbOptions: uniqueMatches.map(m => ({ ...m, description: `${m.tenses ? m.tenses.join(',') : m.tense} (${m.definition})` })),
                                        _unitRef: unit
                                    });
                                }
                            }
                        }
                        currentBlockOffset += unitLen;
                    });
                });

                fullText += blockText + '\n';
                globalOffset += blockText.length + 1;
            });

            // 2. Process AI (Single Batch) with Retry
            if (allAmbiguousItems.length > 0) {
                showToast(`Polishing... Disambiguating ${allAmbiguousItems.length} verbs with AI...`);

                // Clean items for API
                const apiItems = allAmbiguousItems.map(({ _unitRef, ...rest }) => rest);

                // Retry Logic
                const maxRetries = 3;
                let attempt = 0;
                let success = false;
                let response;

                while (attempt < maxRetries && !success) {
                    try {
                        const api = await import('./utils/api.js');
                        response = await api.disambiguateVerbs(token, fullText, apiItems);
                        success = true;
                    } catch (err) {
                        attempt++;
                        // Check for 503 or network error
                        const isRetryable = err.message.includes('503') || err.message.includes('Failed to fetch') || err.message.includes('Service Unavailable');

                        if (isRetryable && attempt < maxRetries) {
                            console.warn(`AI Polish attempt ${attempt} failed (503/Network). Retrying...`, err);
                            showToast(`Server busy (503). Retrying (${attempt}/${maxRetries})...`);
                            // Exponential backoff: 1s, 2s, 4s...
                            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
                        } else {
                            if (attempt >= maxRetries) {
                                console.error("AI Polish failed after max retries", err);
                                showToast("AI Polish failed: Server busy. Please try again later.");
                            } else {
                                console.error("AI Polish failed (non-retryable)", err);
                                showToast("AI Polish failed: " + err.message);
                            }
                            // Break loop to finish deterministic updates
                            break;
                        }
                    }
                }

                if (success && response && response.results) {
                    response.results.forEach((res, idx) => {
                        if (idx >= allAmbiguousItems.length) return;
                        const originalItem = allAmbiguousItems[idx];
                        const { selectedIndex } = res;

                        if (selectedIndex !== undefined && selectedIndex >= 0 && selectedIndex < originalItem.verbOptions.length) {
                            const match = originalItem.verbOptions[selectedIndex];
                            applyVerbMatch(originalItem._unitRef, match);
                            count++;
                        }
                    });
                }
            }

            setDocumentData(newData);
            if (count > 0) showToast(`Polished ${count} verbs!`);
            else if (allAmbiguousItems.length > 0) showToast("Polished deterministic verbs only (AI skipped/failed).");
            else showToast("No new verbs found to polish.");

        } catch (error) {
            console.error("Polish failed", error);
            showToast("Polish failed: " + error.message);
        } finally {
            setIsPolishing(false);
        }
    };

    // Helper to apply match to unit
    const applyVerbMatch = (unit, match) => {
        // Construct POS string
        let posId = match.volition === 'vd' ? 'vd' : (match.volition === 'vnd' ? 'vnd' : 'v');
        let posParts = [posId];

        let attrs = [];
        if (match.hon) attrs.push('hon');
        if (match.tense) {
            const tenses = Array.isArray(match.tenses) ? match.tenses : [match.tense];
            const sysTenses = tenses.map(t => {
                if (t === 'Past') return 'past';
                if (t === 'Future') return 'future';
                if (t === 'Imperative') return 'imp';
                return null;
            }).filter(t => t);

            if (sysTenses.length > 0) {
                attrs.push(sysTenses.join('|'));
            }
        }

        if (attrs.length > 0) {
            posParts.push(attrs.join(','));
        }

        const posStr = posParts.join(',');

        unit.analysis = {
            ...unit.analysis,
            verbId: match.id,
            isPolished: true,
            root: match.original_word,
            pos: posStr,
            tense: match.tense
        };
    };

    const calculateUnitIndex = () => 0; // Deprecated


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
                            className={`btn-export toolbar-btn-spacing ${isApiBusy ? 'is-disabled' : ''}`}
                        >
                            {isLoadingFiles ? 'Loading...' : 'Open from Cloud'}
                        </button>
                    )}

                    {saveFilename ? (
                        <div className="file-input-custom filename-container">
                            <span className="current-filename">{saveFilename}</span>
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
                                onClick={handlePolishVerbs}
                                disabled={isApiBusy}
                                className={`btn-export toolbar-btn-spacing ${isApiBusy ? 'is-disabled' : ''}`}
                                title="Link all recognized verbs to the dictionary"
                            >
                                {isPolishing ? 'Polishing...' : 'Polish Verbs'}
                            </button>
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
                                        className={`btn-export ${isApiBusy ? 'is-disabled' : ''}`}
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
                                            className="btn-export btn-rename"
                                            disabled={isApiBusy}
                                        >
                                            Rename
                                        </button>
                                    )}
                                    {saveFilename && (
                                        <button
                                            onClick={() => handleDeleteCloud(saveFilename)}
                                            className={`btn-export btn-delete-main ${isApiBusy ? 'is-disabled' : ''}`}
                                            disabled={isApiBusy}
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
                                <div className="empty-state-hint">
                                    Start by "+ analyzed text" or "+ Tibetan" then analyse later.
                                    <div className="block-insert-controls block-insert-controls-centered">
                                        <button onClick={() => insertRichTextBlock(-1)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                        <button onClick={() => insertTibetanBlock(-1)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
                                        <button onClick={() => setShowPasteModal(true)} className="btn-insert-small" title="Add analyzed text">+ Analyzed Text</button>
                                    </div>
                                </div>
                            )}
                            {/* Insert controls at beginning of content */}
                            {documentData.length > 0 && (
                                <div className="block-insert-controls">
                                    <button onClick={() => insertRichTextBlock(-1)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                    <button onClick={() => insertTibetanBlock(-1)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
                                    <button onClick={() => setShowPasteModal(true)} className="btn-insert-small" title="Add analyzed text">+ Analyzed Text</button>
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
                                            onDelete={() => deleteBlock(blockIdx)}
                                        />
                                    )}

                                    {/* Insert buttons after each block */}
                                    <div className="block-insert-controls">

                                        <button onClick={() => insertRichTextBlock(blockIdx)} className="btn-insert-small" title="Insert Rich Text Block">+ Text</button>
                                        <button onClick={() => insertTibetanBlock(blockIdx)} className="btn-insert-small" title="Insert Tibetan Block">+ Tibetan</button>
                                        <button onClick={() => setShowPasteModal(true)} className="btn-insert-small" title="Add analyzed text">+ Analyzed Text</button>
                                        <button onClick={() => toggleBlockDebug(blockIdx)} className="btn-insert-small" title="Toggle Debug Mode">Debug</button>
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
                                <li key={file.filename} className={`file-item file-item-container ${isApiBusy ? 'is-disabled' : ''}`}>
                                    <span onClick={() => !isApiBusy && loadFile(file.filename)} className="file-item-name">
                                        {file.filename} {isLoadingFile === file.filename && '(Loading...)'}
                                    </span>
                                    <div className="file-item-actions">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRenameFilename(file.filename);
                                                setRenameNewFilename(file.filename);
                                                setShowRenameDialog(true);
                                            }}
                                            className="btn-export btn-file-action"
                                            disabled={isApiBusy}
                                        >
                                            Rename
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteCloud(file.filename);
                                            }}
                                            className="btn-file-delete"
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
