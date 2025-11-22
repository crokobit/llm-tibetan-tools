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

    // Load default test file on mount
    React.useEffect(() => {
        const loadDefaultFile = async () => {
            try {
                setLoading(true);
                const response = await fetch('test_plain_text.txt');
                if (!response.ok) {
                    throw new Error('Failed to load default file');
                }
                const text = await response.text();
                setRawText(text);
                const parsedData = DocumentParser.parse(text);
                setDocumentData(parsedData);
            } catch (error) {
                console.error("Error loading default file:", error);
            } finally {
                setLoading(false);
            }
        };

        loadDefaultFile();
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
                    lines: [{ units: [{ type: 'text', original: '' }] }]
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
