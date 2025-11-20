import React from 'react';

const AnalysisLabel = ({ text, isSub }) => {
    if (!text) return null;
    return <div className={`analysis-label ${isSub ? 'analysis-label-sub' : ''}`}>{text}</div>
}

export default AnalysisLabel;
