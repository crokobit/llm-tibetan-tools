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

        if (!isMammothLoaded) {
            alert("File reader library is still loading, please wait a moment and try again.");
            return;
        }

        setLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await window.mammoth.extractRawText({ arrayBuffer });
            const rawTextContent = result.value;
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
        rawText
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
