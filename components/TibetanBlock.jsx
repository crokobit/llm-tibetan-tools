import React from 'react';
import LineRenderer from './LineRenderer.jsx';
import DebugBlockEditor from './DebugBlockEditor.jsx';

export default function TibetanBlock({ block, blockIdx, onUpdate, editingTarget, showDebug, onAnalyze, isAnalyzing }) {
    const [inputText, setInputText] = React.useState('');

    if (block._isInputMode) {
        return (
            <div className="tibetan-input-block p-4 border rounded-lg bg-white shadow-sm">
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste Tibetan text here..."
                    className="w-full h-32 p-3 border rounded mb-3 font-tibetan text-lg"
                    disabled={isAnalyzing}
                />
                <div className="flex justify-end">
                    <button
                        onClick={() => onAnalyze(blockIdx, inputText)}
                        disabled={!inputText.trim() || isAnalyzing}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                        {isAnalyzing ? 'Analyzing...' : 'ANALYSIS'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="block-layout">

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
            {showDebug && (
                <DebugBlockEditor
                    block={block}
                    onUpdate={(newBlock) => onUpdate(blockIdx, newBlock)}
                />
            )}
        </div>
    );
}
