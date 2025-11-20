import React, { useState, useRef, useEffect } from 'react';
import { POS_COLORS } from '../utils/constants.js';

const PosSelect = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'other', label: 'Other', color: POS_COLORS.other },
        { value: 'n', label: 'Noun (n)', color: POS_COLORS.n },
        { value: 'v', label: 'Verb (v)', color: POS_COLORS.v },
        { value: 'adj', label: 'Adjective (adj)', color: POS_COLORS.adj },
        { value: 'adv', label: 'Adverb (adv)', color: POS_COLORS.adv },
        { value: 'part', label: 'Particle', color: POS_COLORS.other },
    ];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value) || options[0];
    const selectedBg = selectedOption.color.replace('pos-border-', 'pos-bg-');

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className="form-select-button"
            >
                <span className="text-sm">{selectedOption.label}</span>
                <div className={`w-3 h-3 rounded-full ${selectedBg}`}></div>
            </button>

            {isOpen && (
                <div className="form-select-dropdown">
                    {options.map((opt) => {
                        const barColor = opt.color.replace('pos-border-', 'pos-bg-');
                        return (
                            <div
                                key={opt.value}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className="form-select-option"
                            >
                                <div className="text-sm">{opt.label}</div>
                                <div className={`w-3 h-3 rounded-full ${barColor}`}></div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PosSelect;
