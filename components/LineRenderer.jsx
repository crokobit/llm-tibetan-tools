import React from 'react';
import { useEdit } from '../contexts/index.jsx';
import UnitRenderer from './UnitRenderer.jsx';

const LineRenderer = ({ line, blockIdx, lineIdx, editingTarget, isAnyEditActive }) => {
    const { handleUnitClick } = useEdit();

    return (
        <div className="my-6 leading-relaxed text-justify">
            {line.units.map((unit, unitIdx) => (
                <UnitRenderer
                    key={unitIdx}
                    unit={unit}
                    indices={{ blockIdx, lineIdx, unitIdx }}
                    onClick={(e, subUnit, subIndex, subType) => handleUnitClick(e, blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType)}
                    editingTarget={editingTarget}
                    isAnyEditActive={isAnyEditActive}
                />
            ))}
        </div>
    );
};

export default LineRenderer;
