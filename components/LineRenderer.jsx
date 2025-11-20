import React from 'react';
import UnitRenderer from './UnitRenderer.jsx';

const LineRenderer = ({ line, blockIdx, lineIdx, onUnitClick, editingTarget, isAnyEditActive }) => {
    return (
        <div className="my-6 leading-relaxed text-justify">
            {line.units.map((unit, unitIdx) => (
                <UnitRenderer
                    key={unitIdx}
                    unit={unit}
                    indices={{ blockIdx, lineIdx, unitIdx }}
                    onClick={(e, subUnit, subIndex, subType) => onUnitClick(e, blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType)}
                    editingTarget={editingTarget}
                    isAnyEditActive={isAnyEditActive}
                />
            ))}
        </div>
    );
};

export default LineRenderer;
