import React, { useState, useEffect, useRef } from 'react';
import AnalysisParser from '../logic/AnalysisParser.js';

export default function DebugBlockEditor({ block, onUpdate }) {
    const [text, setText] = useState(() => generateDebugText(block));
    const textareaRef = useRef(null);
    const lastBlockRef = useRef(block);

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
        // We only update if the block has actually changed in a way that matters
        // AND we are not currently editing (focused)
        // OR if the block changed significantly (e.g. completely different content not from our edit)

        // Simple heuristic: if not focused, always sync.
        if (document.activeElement !== textareaRef.current) {
            setText(generateDebugText(block));
        }

        lastBlockRef.current = block;
    }, [block]);

    const handleChange = (e) => {
        const newText = e.target.value;
        setText(newText);

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
