import React, { useState, useEffect, useRef } from 'react';
import AnalysisParser from '../logic/AnalysisParser.js';

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
        blk.lines.forEach(line => {
            line.units.forEach(u => rawText += u.original);
        });
        output += rawText + '\n';
        output += AnalysisParser.format(blk.lines);
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

        const lines = newText.split('\n');
        let analysisLines = lines;
        // Skip header if present (>>> and raw text line)
        if (lines.length > 0 && lines[0].trim() === '>>>') {
            // We assume the second line is raw text, so we skip 2 lines
            analysisLines = lines.slice(2);
        }

        const debugText = analysisLines.join('\n');
        const newWordNodes = AnalysisParser.parseDebugText(debugText);

        // Rehydrate and notify parent
        const rehydratedLines = AnalysisParser.rehydrateBlock(block.lines, newWordNodes);
        const newBlock = { ...block, lines: rehydratedLines };

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
            style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '0.875rem',
                color: '#374151',
                width: '100%',
                minHeight: '150px',
                resize: 'none', // Disable manual resize as we handle it automatically
                overflow: 'hidden' // Hide scrollbar
            }}
            value={text}
            onChange={handleChange}
        />
    );
}
