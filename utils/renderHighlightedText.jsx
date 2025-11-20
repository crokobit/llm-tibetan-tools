import React from 'react';

const renderHighlightedText = (text, startGlobal, endGlobal, currentGlobalOffset, highlightColor = 'highlight-creating') => {
    const textStart = currentGlobalOffset;
    const textEnd = currentGlobalOffset + text.length;

    // Intersection of [textStart, textEnd) and [startGlobal, endGlobal)
    const highlightStart = Math.max(textStart, startGlobal);
    const highlightEnd = Math.min(textEnd, endGlobal);

    if (highlightStart >= highlightEnd) {
        return text;
    }

    const relStart = highlightStart - textStart;
    const relEnd = highlightEnd - textStart;

    const before = text.substring(0, relStart);
    const mid = text.substring(relStart, relEnd);
    const after = text.substring(relEnd);

    return (
        <>
            {before}
            <span className={highlightColor}>{mid}</span>
            {after}
        </>
    );
};

export default renderHighlightedText;
