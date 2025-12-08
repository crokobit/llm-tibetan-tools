import React, { useState, useEffect, useRef } from 'react';
import AnalysisParser from '../logic/AnalysisParser.js';
import DocumentParser from '../logic/DocumentParser.js';

export default function DebugBlockEditor({ block, onUpdate }) {
    const [text, setText] = useState(() => generateDebugText(block));
    const textareaRef = useRef(null);
    const isTypingRef = useRef(false); // Track if user is actively typing
    const typingTimeoutRef = useRef(null); // Timeout to clear typing flag
    const blockSerialRef = useRef(JSON.stringify(block)); // Track block changes

    // Helper to generate the full debug text
    function generateDebugText(blk) {
        let output = '>>>\n';
        let rawText = '';
        blk.lines.forEach((line, idx) => {
            if (idx > 0) rawText += '\n'; // Add newline between lines
            line.units.forEach(u => rawText += u.original);
        });
        output += rawText + '\n';
        output += '>>>>\n';
        output += AnalysisParser.format(blk.lines);
        output += '>>>>>';
        return output;
    }

    // Sync text from block when block changes externally
    useEffect(() => {
        const currentSerial = JSON.stringify(block);

        // Only update if block content actually changed AND we're not actively typing
        if (currentSerial !== blockSerialRef.current && !isTypingRef.current) {
            console.log('[DebugBlockEditor] Updating text from block change');
            setText(generateDebugText(block));
            blockSerialRef.current = currentSerial;
        } else if (currentSerial !== blockSerialRef.current) {
            // Block changed but we're typing - just update the serial for next time
            console.log('[DebugBlockEditor] Block changed but typing, deferring update');
            blockSerialRef.current = currentSerial;
        }
    }, [block]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, []);

    // Secondary sync: when typing stops, check if we need to update
    useEffect(() => {
        const checkInterval = setInterval(() => {
            if (!isTypingRef.current) {
                const currentSerial = JSON.stringify(block);
                if (currentSerial !== blockSerialRef.current) {
                    setText(generateDebugText(block));
                    blockSerialRef.current = currentSerial;
                }
            }
        }, 200); // Check every 200ms

        return () => clearInterval(checkInterval);
    }, [block]);

    const handleChange = (e) => {
        const newText = e.target.value;
        setText(newText);

        // Mark that we're typing
        isTypingRef.current = true;

        // Clear any existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set timeout to clear typing flag after user stops typing
        typingTimeoutRef.current = setTimeout(() => {
            isTypingRef.current = false;
        }, 150); // 150ms after last keystroke

        // Parse the block structure
        const parts = newText.split('>>>>');
        if (parts.length < 2) return; // Not enough parts

        // Extract raw text (everything after >>> and before first >>>>)
        let rawTextPart = parts[0];
        if (rawTextPart.includes('>>>')) {
            rawTextPart = rawTextPart.split('>>>')[1] || '';
        }
        const rawText = rawTextPart.trim();

        // Extract analysis (between >>>> and >>>>>)
        let analysisPart = parts[1];
        // Remove trailing >>>>> if present
        analysisPart = analysisPart.split('>>>>>')[0];

        const debugText = analysisPart.trim();

        // Use DocumentParser to process the block, which handles merging analysis with raw text
        // This ensures that if the user edits the raw text, it is respected
        const processedBlock = DocumentParser._processBlock(rawText, debugText);

        const newBlock = { ...block, lines: processedBlock.lines };
        onUpdate(newBlock);
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [text]);

    return (
        <textarea
            ref={textareaRef}
            className="block-debug-output"
            value={text}
            onChange={handleChange}
        />
    );
}
