import React from 'react';

const AnalysisLabel = ({ text, isSub }) => {
    if (!text) return null;
    return <span className={`analysis-label ${isSub ? 'analysis-label-sub' : ''} block`}>{text}</span>
}

export default AnalysisLabel;
