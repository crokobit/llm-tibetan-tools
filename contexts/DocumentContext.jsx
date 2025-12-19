import React, { createContext, useState, useContext } from 'react';
import DocumentParser from '../logic/DocumentParser.js';

const DocumentContext = createContext();

/**
 * Provider for document data and file upload functionality.
 * Manages the core document state and parsing logic.
 */
export function DocumentProvider({ children }) {
    const [documentData, setDocumentData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isMammothLoaded, setIsMammothLoaded] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [rawText, setRawText] = useState('');

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        try {
            let rawTextContent = '';
            if (file.name.endsWith('.docx')) {
                if (!isMammothLoaded) {
                    alert("File reader library is still loading, please wait a moment and try again.");
                    setLoading(false);
                    return;
                }
                const arrayBuffer = await file.arrayBuffer();
                const result = await window.mammoth.extractRawText({ arrayBuffer });
                rawTextContent = result.value;
            } else {
                // Assume text file for everything else
                rawTextContent = await file.text();
            }

            setRawText(rawTextContent); // Store raw text for debug mode
            const parsedData = DocumentParser.parse(rawTextContent);
            setDocumentData(parsedData);
        } catch (err) {
            console.error(err);
            alert("Error parsing file: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Default file loading removed
    React.useEffect(() => {
        // No-op
    }, []);

    const value = {
        documentData,
        setDocumentData,
        loading,
        setLoading,
        isMammothLoaded,
        setIsMammothLoaded,
        handleFileUpload,
        showDebug,
        setShowDebug,
        rawText,
        // Block manipulation helpers
        insertRichTextBlock: (afterIdx) => {
            setDocumentData(prev => {
                const newData = [...prev];
                newData.splice(afterIdx + 1, 0, {
                    type: 'richtext',
                    content: '<p><br></p>'
                });
                return newData;
            });
        },
        insertTibetanBlock: (afterIdx) => {
            setDocumentData(prev => {
                const newData = [...prev];
                newData.splice(afterIdx + 1, 0, {
                    type: 'tibetan',
                    _isInputMode: true,
                    lines: []
                });
                return newData;
            });
        },
        deleteBlock: (blockIdx) => {
            setDocumentData(prev => prev.filter((_, idx) => idx !== blockIdx));
        },
        updateRichTextBlock: (blockIdx, newContent) => {
            setDocumentData(prev => {
                const newData = [...prev];
                newData[blockIdx] = { ...newData[blockIdx], content: newContent };
                return newData;
            });
        },
        splitBlock: (blockIdx, afterLineIdx) => {
            setDocumentData(prev => {
                const newData = [...prev];
                const block = newData[blockIdx];

                // Only split tibetan blocks with more than 1 line
                if (block.type !== 'tibetan' || !block.lines || block.lines.length <= 1) {
                    return prev;
                }

                // Can't split after the last line
                if (afterLineIdx >= block.lines.length - 1) {
                    return prev;
                }

                // Create new block with lines after the split point
                const newBlock = {
                    type: 'tibetan',
                    lines: block.lines.slice(afterLineIdx + 1)
                };

                // Update original block to only have lines up to split point
                newData[blockIdx] = {
                    ...block,
                    lines: block.lines.slice(0, afterLineIdx + 1)
                };

                // Insert new block after the original
                newData.splice(blockIdx + 1, 0, newBlock);

                return newData;
            });
        },
        mergeBlocks: (blockIdx) => {
            setDocumentData(prev => {
                const newData = [...prev];
                const currentBlock = newData[blockIdx];
                const nextBlock = newData[blockIdx + 1];

                // Only merge if both blocks are tibetan type
                if (!currentBlock || !nextBlock) {
                    return prev;
                }
                if (currentBlock.type !== 'tibetan' || nextBlock.type !== 'tibetan') {
                    return prev;
                }

                // Combine lines from both blocks
                newData[blockIdx] = {
                    ...currentBlock,
                    lines: [...(currentBlock.lines || []), ...(nextBlock.lines || [])]
                };

                // Remove the next block
                newData.splice(blockIdx + 1, 1);

                return newData;
            });
        }
    };

    return (
        <DocumentContext.Provider value={value}>
            {children}
        </DocumentContext.Provider>
    );
}

/**
 * Custom hook to access document context.
 * @returns {Object} Document context value
 */
export function useDocument() {
    const context = useContext(DocumentContext);
    if (!context) {
        throw new Error('useDocument must be used within DocumentProvider');
    }
    return context;
}
