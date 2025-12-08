import React from 'react';
import LineRenderer from './LineRenderer.jsx';
import DebugBlockEditor from './DebugBlockEditor.jsx';

export default function TibetanBlock({ block, blockIdx, onUpdate, editingTarget, showDebug }) {
    return (
        <div className="block-layout relative group">

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
