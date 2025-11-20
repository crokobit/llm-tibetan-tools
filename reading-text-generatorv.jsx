import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// 1. LOGIC: IDENTIFYING & GRAMMAR (Regex)
// ==========================================

class RegexGrammar {
  // Matches the entire block: >>> Raw Text >>>> Analysis >>>>>
  static BLOCK = />>>\s*([\s\S]*?)\s*>>>>\s*([\s\S]*?)\s*>>>>>/g;

  // Matches a single analysis line: tabs, <original>, [analysis]
  // Captures: 1=tabs, 2=original, 3=analysis_content
  static ANALYSIS_LINE = /^(\t*)<([^>]+)>\[(.*)\]\s*$/;

  // Matches the internal analysis content: A{B1,Bh, B2}C D
  // A = volls (optional), { ... } = pos/tense, C D = root/definition
  static ANALYSIS_CONTENT = /^(.*?){([a-z0-9/\->|]+)(?:,([^}]+))?}(.*)$/i;
}

// ==========================================
// 2. LOGIC: PARSING & ANALYSIS (OOP)
// ==========================================

class AnalysisParser {
  static parse(annotationString) {
    let content = annotationString;

    // Handle potential double bracketing if it exists, though regex should handle it
    if (content.startsWith('[') && content.endsWith(']')) {
      content = content.substring(1, content.length - 1);
    }

    if (content) content = content.split(';')[0].trim();

    let volls = '', pos = 'other', tense = '', root = '', definition = '';

    const match = content.match(RegexGrammar.ANALYSIS_CONTENT);

    if (match) {
      volls = match[1].trim();
      pos = match[2];
      tense = match[3] || '';
      let rest = match[4].trim();

      // Attempt to separate Root from Definition
      // Assuming Root is Tibetan characters at the start
      const tibetanWordMatch = rest.match(/^([\u0F00-\u0FFF]+)/);
      if (tibetanWordMatch) {
        root = tibetanWordMatch[1].trim();
        definition = rest.substring(root.length).trim();
      } else {
        definition = rest;
      }
    } else {
      // Fallback if regex doesn't match (e.g. no {})
      definition = content.replace(/{[a-z0-9/\->|,]+}/i, '').trim();
    }

    return { volls, pos, root, tense, definition };
  }

  static serialize(analysisObj, originalWord) {
    const { volls, root, pos, tense, definition } = analysisObj;

    const bString = `${pos || 'other'}${tense ? ',' + tense : ''}`;
    const c_and_d = `${root || ''} ${definition || ''}`.trim();

    let internalString = '';
    if (volls) {
      internalString = `${volls}{${bString}} ${c_and_d}`;
    } else {
      internalString = `{${bString}} ${c_and_d}`;
    }

    return internalString.replace(/\s+/g, ' ').trim();
  }
}

class DocumentParser {
  static parse(fullText) {
    const blocks = [];
    const matches = [...fullText.matchAll(RegexGrammar.BLOCK)];

    if (matches.length === 0) {
      // Fallback: Treat entire text as raw text with no analysis if no blocks found
      if (fullText.trim().length > 0) {
        return [{ lines: [{ units: [{ type: 'text', original: fullText }] }] }];
      }
      return [];
    }

    matches.forEach(match => {
      const rawText = match[1];
      const analysisText = match[2];
      blocks.push(this._processBlock(rawText, analysisText));
    });

    return blocks;
  }

  static _processBlock(rawText, analysisText) {
    // 1. Parse Analysis Lines into a Hierarchy
    const analysisNodes = this._parseAnalysisHierarchy(analysisText);

    // 2. Merge Analysis with Raw Text
    const units = this._mergeAnalysisWithRaw(rawText, analysisNodes);

    // 3. Group into lines (preserving raw text newlines)
    const lines = [];
    let currentLineUnits = [];

    units.forEach(unit => {
      if (unit.type === 'text') {
        // Split text unit by newlines
        const parts = unit.original.split('\n');
        parts.forEach((part, idx) => {
          if (idx > 0) {
            // New line detected
            lines.push({ units: currentLineUnits });
            currentLineUnits = [];
          }
          if (part) {
            currentLineUnits.push({ type: 'text', original: part });
          }
        });
      } else {
        currentLineUnits.push(unit);
      }
    });

    if (currentLineUnits.length > 0) {
      lines.push({ units: currentLineUnits });
    }

    return { lines };
  }

  static _parseAnalysisHierarchy(analysisText) {
    const lines = analysisText.split('\n').filter(l => l.trim() !== '');
    const roots = [];
    const stack = []; // Stores { depth, node }

    lines.forEach(line => {
      const match = line.match(RegexGrammar.ANALYSIS_LINE);
      if (!match) return;

      const depth = match[1].length; // Number of tabs
      const original = match[2];
      const rawAnnotation = match[3];

      const node = {
        type: 'word',
        original,
        rawAnnotation,
        analysis: AnalysisParser.parse(rawAnnotation),
        nestedData: [],
        supplementaryData: []
      };

      // Find parent
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
      } else {
        const parent = stack[stack.length - 1].node;
        parent.nestedData.push(node);
      }

      stack.push({ depth, node });
    });

    // Post-process to fill gaps in nested data (e.g. tshegs)
    this._fillNestedGaps(roots);

    return roots;
  }

  static _fillNestedGaps(nodes) {
    nodes.forEach(node => {
      if (node.nestedData && node.nestedData.length > 0) {
        // Recursively fill gaps for children first
        this._fillNestedGaps(node.nestedData);

        // Now merge current node's original text with its children
        // This will insert 'text' units (like tshegs) between the analysis nodes
        node.nestedData = this._mergeAnalysisWithRaw(node.original, node.nestedData);
      }
    });
  }

  static _mergeAnalysisWithRaw(rawText, analysisNodes) {
    const units = [];
    let currentIndex = 0;

    analysisNodes.forEach(node => {
      // Find the node's original text in rawText starting from currentIndex
      const searchSpace = rawText.substring(currentIndex);
      const foundIndex = searchSpace.indexOf(node.original);

      if (foundIndex !== -1) {
        // Text before the match
        if (foundIndex > 0) {
          const textBefore = searchSpace.substring(0, foundIndex);
          units.push({ type: 'text', original: textBefore });
        }

        // The matched word
        units.push(node);

        // Advance index
        currentIndex += foundIndex + node.original.length;
      } else {
        console.warn(`Analysis node '${node.original}' not found in remaining text.`);
      }
    });

    // Remaining text
    if (currentIndex < rawText.length) {
      units.push({ type: 'text', original: rawText.substring(currentIndex) });
    }

    return units;
  }
}

// ==========================================
// 3. UI COMPONENTS (REACT)
// ==========================================

const FONT_SIZES = {
  tibetan: 'tibetan-large',
  analysisMain: 'analysis-main-text',
  analysisSub: 'analysis-sub-text'
};

const POS_COLORS = {
  n: 'pos-border-n',
  v: 'pos-border-v',
  adj: 'pos-border-adj',
  adv: 'pos-border-adv',
  other: 'pos-border-other'
};

// --- Helper Functions ---

const truncateDefinition = (def) => {
  if (!def) return '';
  const separators = ['，', '。', ','];
  let minIndex = def.length;
  separators.forEach(sep => {
    const idx = def.indexOf(sep);
    if (idx !== -1 && idx < minIndex) {
      minIndex = idx;
    }
  });
  return def.substring(0, minIndex);
};

// --- Helper Components ---

const AnalysisLabel = ({ text, isSub }) => {
  if (!text) return null;
  return <div className={`analysis-label ${isSub ? 'analysis-label-sub' : ''}`}>{text}</div>
}

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

const WordCard = ({ unit, onClick, isNested = false, indices, editingTarget, isAnyEditActive }) => {
  const { analysis, original, nestedData, supplementaryData } = unit;
  const [hoveredSubIndex, setHoveredSubIndex] = useState(null);

  const mainPosKey = analysis.pos?.toLowerCase().split(/[\->|]/)[0] || 'other';
  const mainBorderColor = POS_COLORS[mainPosKey] || POS_COLORS.other;
  const displayDef = truncateDefinition(analysis.definition);

  // Check if this unit is the target of the current creation action
  const isEditingTarget = editingTarget &&
    editingTarget.indices.blockIdx === indices.blockIdx &&
    editingTarget.indices.lineIdx === indices.lineIdx &&
    editingTarget.indices.unitIdx === indices.unitIdx;

  const isCreatingSub = isEditingTarget && editingTarget.isCreating;
  const isEditingExisting = isEditingTarget && !editingTarget.isCreating;
  const isEditingMainAnalysis = isEditingExisting && (editingTarget.indices.subIndex === null || editingTarget.indices.subIndex === undefined);

  // Reset hoveredSubIndex when edit mode closes
  useEffect(() => {
    if (!isAnyEditActive) {
      setHoveredSubIndex(null);
    }
  }, [isAnyEditActive]);

  // Determine highlight color based on action type
  const highlightColor = editingTarget && editingTarget.highlightColor ? editingTarget.highlightColor : 'highlight-creating';

  // --- Compound Mode Logic (Grid Layout) ---
  const subUnits = (nestedData && nestedData.length > 0) ? nestedData : (supplementaryData && supplementaryData.length > 0 ? supplementaryData : null);
  const subType = nestedData && nestedData.length > 0 ? 'nested' : 'supplementary';

  if (subUnits) {
    let currentGlobalOffset = 0; // Track offset for highlighting
    return (
      <div
        data-indices={indices ? JSON.stringify(indices) : undefined}
        className={`word-card-grid ${isEditingMainAnalysis ? 'editing-main' : ''}`}
        style={{ gridTemplateColumns: `repeat(${subUnits.length}, auto)` }}
        // Clicking background selects the main unit
        onClick={(e) => { e.stopPropagation(); onClick(e, unit, null, null); }}
      >
        {/* --- Row 1: Tibetan Sub-Words (The "Main Word") --- */}
        {subUnits.map((u, i) => {
          // Check if this sub-unit is just a tsheg
          const isTsheg = u.original.trim() === '་';
          const myOffset = currentGlobalOffset;
          currentGlobalOffset += u.original.length;

          // Check if this specific sub-word is being edited
          const isThisSubWordEditing = isEditingExisting && editingTarget.indices.subIndex === i;

          return (
            <div
              key={`tib-${i}`}
              className={`tibetan-word-box ${i === hoveredSubIndex && !isAnyEditActive ? 'highlight-editing' : ''} ${isThisSubWordEditing ? 'highlight-editing' : ''}`}
              onClick={(e) => {
                // If tsheg, let it bubble to main unit (do nothing here). If word, handle sub-click.
                if (!isTsheg) {
                  e.stopPropagation();
                  // User request: Clicking the main word (Tibetan text) should enter the word edit (main), not the compound edit (sub).
                  onClick(e, unit, null, null);
                }
              }}
            >
              <span className={`tibetan-font ${isNested ? 'tibetan-medium' : FONT_SIZES.tibetan}`}>
                {isCreatingSub && editingTarget && editingTarget.creationDetails
                  ? renderHighlightedText(
                    u.original,
                    editingTarget.creationDetails.startOffset,
                    editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
                    myOffset,
                    highlightColor
                  )
                  : u.original}
              </span>
            </div>
          );
        })}

        {/* --- Row 2: Main Analysis (Spans all cols) --- */}
        <div
          style={{ gridColumn: `1 / span ${subUnits.length}` }}
          className="main-analysis-box"
          onClick={(e) => { e.stopPropagation(); onClick(e, unit, null, null); }} // Click here edits main
        >
          {/* Main Analysis Underline */}
          <div className={`main-analysis-underline ${mainBorderColor}`}></div>

          {/* Main Analysis Text */}
          <div className="flex flex-col items-center">
            <AnalysisLabel text={analysis.root} isSub={isNested} />
            {analysis.tense && <span className="tense-label">({analysis.tense})</span>}
            <div className={`analysis-def ${isNested ? 'analysis-def-sub' : 'analysis-def-main'}`}>
              {displayDef}
            </div>
          </div>
        </div>

        {/* --- Row 3: Sub Analysis (Aligned cols) --- */}
        {subUnits.map((u, i) => {
          // If tsheg, return empty cell to maintain grid structure but show nothing
          if (u.original.trim() === '་') {
            return <div key={`sub-${i}`} />;
          }

          const subPosKey = u.analysis?.pos?.toLowerCase().split(/[\->|]/)[0] || 'other';
          const subBorderColor = POS_COLORS[subPosKey] || POS_COLORS.other;
          const subBgColor = subBorderColor.replace('pos-border-', 'pos-bg-');
          const subDef = truncateDefinition(u.analysis?.definition);

          const isAnalyzed = !!u.analysis;

          // Check if this specific sub-analysis is being edited
          const isThisSubEditing = isEditingExisting &&
            editingTarget.indices.subIndex === i;

          return (
            <div
              key={`sub-${i}`}
              className={`sub-analysis-cell ${isThisSubEditing ? 'editing' : ''} ${isAnalyzed ? 'analyzed' : ''} ${isAnalyzed && !isAnyEditActive ? 'allow-hover' : ''}`}
              onMouseEnter={isAnalyzed && !isAnyEditActive ? () => setHoveredSubIndex(i) : undefined}
              onMouseLeave={isAnalyzed && !isAnyEditActive ? () => setHoveredSubIndex(null) : undefined}
              onClick={(e) => { e.stopPropagation(); onClick(e, u, i, subType); }}
            >
              {/* Sub Analysis Underline (Colored Bar) */}
              {u.analysis && (
                <div className={`sub-analysis-underline ${subBgColor}`}></div>
              )}

              {/* Sub Analysis Text */}
              <div className="text-center w-full rounded">
                <div className="analysis-label-sub text-gray-600 font-medium">{u.analysis?.root}</div>
                <div className="analysis-def-sub text-gray-500 truncate w-full leading-tight">
                  {subDef}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // --- Simple Mode (Standard Card) ---
  const borderClass = `main-analysis-underline ${mainBorderColor}`;

  return (
    <div
      data-indices={indices ? JSON.stringify(indices) : undefined}
      className={`word-card ${isEditingExisting ? 'editing' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e, unit, null, null);
      }}
    >
      {/* Main Tibetan Word */}
      <div className={`tibetan-word-box ${borderClass} ${!isCreatingSub && !isEditingExisting && !isAnyEditActive ? 'allow-hover' : ''}`}>
        <span className={`tibetan-font ${isNested ? 'tibetan-medium' : FONT_SIZES.tibetan}`}>
          {isCreatingSub && editingTarget && editingTarget.creationDetails
            ? renderHighlightedText(
              original,
              editingTarget.creationDetails.startOffset,
              editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
              0,
              highlightColor
            )
            : original}
        </span>
      </div>

      {/* Main Analysis */}
      <div className="main-analysis-box">
        <AnalysisLabel text={analysis.root} isSub={isNested} />
        {analysis.tense && <span className="tense-label">({analysis.tense})</span>}
        <div className={`analysis-def ${isNested ? 'analysis-def-sub' : 'analysis-def-main'}`}>
          {displayDef}
        </div>
      </div>
    </div>
  );
};

const UnitRenderer = ({ unit, indices, onClick, isNested, editingTarget, isAnyEditActive }) => {
  if (unit.type === 'text') {
    // Check if this text unit should have highlighting for new analysis creation
    const isEditingTarget = editingTarget &&
      editingTarget.indices.blockIdx === indices.blockIdx &&
      editingTarget.indices.lineIdx === indices.lineIdx &&
      editingTarget.indices.unitIdx === indices.unitIdx;

    const shouldHighlight = isEditingTarget && editingTarget.isCreating && editingTarget.creationDetails;
    const highlightColor = editingTarget && editingTarget.highlightColor ? editingTarget.highlightColor : 'highlight-creating';

    return (
      <span
        className={`inline-block mx-0.5 tibetan-font ${isNested ? 'tibetan-base' : FONT_SIZES.tibetan} cursor-text`}
        data-indices={indices ? JSON.stringify(indices) : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {shouldHighlight
          ? renderHighlightedText(
            unit.original,
            editingTarget.creationDetails.startOffset,
            editingTarget.creationDetails.startOffset + editingTarget.creationDetails.selectedText.length,
            0,
            highlightColor
          )
          : unit.original}
      </span>
    );
  }
  return <WordCard unit={unit} onClick={onClick} isNested={isNested} indices={indices} editingTarget={editingTarget} isAnyEditActive={isAnyEditActive} />;
};

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

// --- Modal Component ---

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
        onClick={() => setIsOpen(!isOpen)}
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
                onClick={() => {
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

const EditPopover = ({ isOpen, onClose, onSave, onDelete, data, isCreating, anchorRect, possibleParents }) => {
  const [formData, setFormData] = useState({
    volls: '', root: '', pos: '', tense: [], definition: ''
  });
  const [parentMode, setParentMode] = useState('main'); // 'main' or 'sub'
  const popoverRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, opacity: 0 });
  const [placement, setPlacement] = useState('bottom');

  useEffect(() => {
    if (isCreating) {
      setFormData({ volls: '', root: '', pos: 'other', tense: [], definition: '' });
      // Default to 'sub' if available as it's likely the intent when selecting inside a word
      if (possibleParents && possibleParents.length > 0) {
        const subOption = possibleParents.find(p => p.id === 'sub');
        if (subOption) setParentMode('sub');
        else setParentMode('main');
      } else {
        setParentMode('main');
      }
    } else if (data && data.analysis) {
      setFormData({
        volls: data.analysis.volls || '',
        root: data.analysis.root || '',
        pos: data.analysis.pos || '',
        tense: data.analysis.tense ? data.analysis.tense.split('|') : [],
        definition: data.analysis.definition || ''
      });
    }
  }, [data, isCreating, possibleParents]);

  // Smart Positioning
  React.useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !popoverRef.current) return;

    const popRect = popoverRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let top = anchorRect.bottom + scrollY + 12;
    let left = anchorRect.left + scrollX;
    let newPlacement = 'bottom';

    if (anchorRect.bottom + popRect.height + 20 > viewportH + scrollY) {
      if (anchorRect.top - popRect.height - 12 > scrollY) {
        top = anchorRect.top + scrollY - popRect.height - 12;
        newPlacement = 'top';
      } else {
        top = scrollY + viewportH - popRect.height - 10;
        newPlacement = 'bottom';
      }
    }

    if (left + popRect.width > viewportW + scrollX) {
      left = scrollX + viewportW - popRect.width - 10;
    }
    if (left < scrollX) {
      left = scrollX + 10;
    }

    setCoords({ top, left, opacity: 1 });
    setPlacement(newPlacement);
  }, [isOpen, anchorRect, formData.pos, formData.tense.length, parentMode]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ...formData,
      tense: formData.tense.join('|')
    }, parentMode);
  };

  const toggleTense = (val) => {
    setFormData(prev => ({
      ...prev,
      tense: prev.tense.includes(val)
        ? prev.tense.filter(t => t !== val)
        : [...prev.tense, val]
    }));
  }

  const isVerb = ['v', 'vd', 'vn'].some(t => formData.pos.includes(t));

  return (
    <div
      ref={popoverRef}
      className="popover-container"
      style={{ top: coords.top, left: coords.left, opacity: coords.opacity }}
    >
      {/* Arrow */}
      <div
        className={`popover-arrow ${placement === 'bottom' ? 'bottom' : 'top'}`}
      ></div>

      <div className="popover-content">
        {/* Parent Selection Dropdown - Hidden for now */}
        {false && isCreating && possibleParents && possibleParents.length > 1 && (
          <div className="mb-2">
            <label className="block text-xs text-gray-500 mb-1">Add Analysis To:</label>
            <select
              value={parentMode}
              onChange={(e) => setParentMode(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs bg-blue-50 border-blue-200 text-blue-800 font-medium focus:outline-none focus:border-blue-400"
            >
              {possibleParents.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Row 1: Root & POS */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              className="form-input"
              value={formData.root}
              onChange={e => setFormData({ ...formData, root: e.target.value })}
              placeholder="Root"
            />
          </div>
          <div className="w-24">
            <PosSelect value={formData.pos} onChange={(val) => setFormData({ ...formData, pos: val })} />
          </div>
        </div>

        {/* Row 2: Volls (Optional) */}
        <div>
          <input
            className="form-input text-xs"
            value={formData.volls}
            onChange={e => setFormData({ ...formData, volls: e.target.value })}
            placeholder="Full form (optional)"
          />
        </div>

        {/* Row 3: Tense (Conditional) */}
        {isVerb && (
          <div className="flex flex-wrap gap-1">
            {['present', 'past', 'future', 'imperative'].map(t => (
              <button
                key={t}
                onClick={() => toggleTense(t)}
                className={`tense-button ${formData.tense.includes(t) ? 'active' : 'inactive'}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Row 4: Definition */}
        <div>
          <textarea
            className="form-input text-xs"
            rows={2}
            value={formData.definition}
            onChange={e => setFormData({ ...formData, definition: e.target.value })}
            placeholder="Definition..."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="popover-footer">
        {!isCreating ? (
          <button onClick={onDelete} className="btn-delete">Delete</button>
        ) : <span></span>}
        <button onClick={handleSave} className="btn-save">Save</button>
      </div>
    </div>
  );
};

// ChoicePopover removed

// ==========================================
// 4. MAIN APP COMPONENT
// ==========================================

export default function TibetanReader() {
  const [documentData, setDocumentData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [isMammothLoaded, setIsMammothLoaded] = useState(false);
  const contentRef = useRef(null);
  const ignoreClickRef = useRef(false);

  useEffect(() => {
    if (window.mammoth) {
      setIsMammothLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
    script.onload = () => setIsMammothLoaded(true);
    script.onerror = () => console.error("Failed to load mammoth.js");
    document.body.appendChild(script);
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!isMammothLoaded) {
      alert("File reader library is still loading, please wait a moment and try again.");
      return;
    }

    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      const rawText = result.value;
      const parsedData = DocumentParser.parse(rawText);
      setDocumentData(parsedData);
    } catch (err) {
      console.error(err);
      alert("Error parsing file: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnitClick = (event, blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType) => {
    if (ignoreClickRef.current) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setAnchorRect(rect);

    // Calculate offset for sub-units if applicable
    let startOffset = 0;
    let parentUnit = null;

    if (subIndex !== null && subIndex !== undefined) {
      // This is a sub-analysis click
      parentUnit = documentData[blockIdx].lines[lineIdx].units[unitIdx];
      const list = subType === 'nested' ? parentUnit.nestedData : parentUnit.supplementaryData;

      // Calculate offset
      for (let i = 0; i < subIndex; i++) {
        startOffset += list[i].original.length;
      }
    }

    setEditingTarget({
      indices: { blockIdx, lineIdx, unitIdx, subIndex, subType },
      data: subUnit,
      isCreating: false,
      highlightColor: 'highlight-editing',
      creationDetails: {
        selectedText: subUnit.original,
        startOffset: startOffset,
        fullText: parentUnit ? parentUnit.original : subUnit.original
      }
    });
  };

  const handleSelection = useCallback(() => {
    if (editingTarget) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    let selectedText = range.toString().trim();
    if (!selectedText) return;

    // Remove leading or trailing Tibetan tseg (་) if present
    selectedText = selectedText.replace(/^་+|་+$/g, '');

    // Helper to find unit indices from a DOM node
    const getIndices = (node) => {
      const wrapper = node.nodeType === 3 ? node.parentNode.closest('[data-indices]') : node.closest('[data-indices]');
      return wrapper ? JSON.parse(wrapper.dataset.indices) : null;
    };

    const startIndices = getIndices(selection.anchorNode);
    const endIndices = getIndices(selection.focusNode);

    if (!startIndices || !endIndices) return;
    if (startIndices.blockIdx !== endIndices.blockIdx || startIndices.lineIdx !== endIndices.lineIdx) return;

    const { blockIdx, lineIdx } = startIndices;
    const startUnitIdx = Math.min(startIndices.unitIdx, endIndices.unitIdx);
    const endUnitIdx = Math.max(startIndices.unitIdx, endIndices.unitIdx);

    const lineUnits = documentData[blockIdx].lines[lineIdx].units;

    // Check for overlaps with word units
    let exactMatchUnit = null;
    let exactMatchSubUnit = null;
    let exactMatchSubIndex = null;
    let exactMatchSubType = null;
    let candidateParent = null;

    for (let i = startUnitIdx; i <= endUnitIdx; i++) {
      if (lineUnits[i].type === 'word') {
        if (startUnitIdx === endUnitIdx && lineUnits[i].original === selectedText) {
          exactMatchUnit = lineUnits[i];
        }
        // If selection is fully contained in one word, that word is a candidate parent
        if (startUnitIdx === endUnitIdx) {
          candidateParent = lineUnits[i];

          // Check if the selection matches any existing sub-analysis
          if (candidateParent.nestedData && candidateParent.nestedData.length > 0) {
            for (let j = 0; j < candidateParent.nestedData.length; j++) {
              const subUnit = candidateParent.nestedData[j];
              if (subUnit.type === 'word' && subUnit.original === selectedText) {
                exactMatchSubUnit = subUnit;
                exactMatchSubIndex = j;
                exactMatchSubType = 'nested';
                break;
              }
            }
          }

          // Also check supplementaryData if needed
          if (!exactMatchSubUnit && candidateParent.supplementaryData && candidateParent.supplementaryData.length > 0) {
            for (let j = 0; j < candidateParent.supplementaryData.length; j++) {
              const subUnit = candidateParent.supplementaryData[j];
              if (subUnit.type === 'word' && subUnit.original === selectedText) {
                exactMatchSubUnit = subUnit;
                exactMatchSubIndex = j;
                exactMatchSubType = 'supplementary';
                break;
              }
            }
          }
        }
      }
    }

    const rect = range.getBoundingClientRect();
    setAnchorRect(rect);

    // Case 1a: Exact match with sub-analysis -> Edit the sub-analysis
    if (exactMatchSubUnit) {
      // Calculate offset for this sub-unit within the parent
      let subStartOffset = 0;
      const parentUnit = candidateParent;
      if (parentUnit && parentUnit.nestedData) {
        for (let i = 0; i < exactMatchSubIndex; i++) {
          subStartOffset += parentUnit.nestedData[i].original.length;
        }
      }

      setEditingTarget({
        indices: { blockIdx, lineIdx, unitIdx: startUnitIdx, subIndex: exactMatchSubIndex, subType: exactMatchSubType },
        data: exactMatchSubUnit,
        isCreating: false,
        highlightColor: 'highlight-editing',
        creationDetails: {
          selectedText: exactMatchSubUnit.original,
          startOffset: subStartOffset,
          fullText: parentUnit ? parentUnit.original : exactMatchSubUnit.original
        }
      });
      selection.removeAllRanges();
      ignoreClickRef.current = true;
      setTimeout(() => { ignoreClickRef.current = false; }, 300);
      return;
    }

    // Case 1b: Exact match -> Edit
    if (exactMatchUnit) {
      setEditingTarget({
        indices: { blockIdx, lineIdx, unitIdx: startUnitIdx },
        data: exactMatchUnit,
        isCreating: false,
        highlightColor: 'highlight-editing',
        creationDetails: {
          selectedText: exactMatchUnit.original,
          startOffset: 0,
          fullText: exactMatchUnit.original
        }
      });
      selection.removeAllRanges();
      ignoreClickRef.current = true;
      setTimeout(() => { ignoreClickRef.current = false; }, 300);
      return;
    }

    // Case 2: Create New (with possible parents)
    // Calculate offsets
    let startOffset = -1;
    let fullText = '';

    if (startUnitIdx === endUnitIdx) {
      const unit = lineUnits[startUnitIdx];
      fullText = unit.original;
      startOffset = fullText.indexOf(selectedText);
    }

    // Construct possible parents
    const possibleParents = [
      { id: 'main', label: 'Main Analysis (Independent)' }
    ];

    if (candidateParent) {
      possibleParents.push({
        id: 'sub',
        label: `Sub-analysis of "${candidateParent.analysis.root || candidateParent.original}"`
      });
    }

    setEditingTarget({
      indices: { blockIdx, lineIdx, unitIdx: startUnitIdx, endUnitIdx },
      data: selectedText,
      isCreating: true,
      highlightColor: 'highlight-creating',
      possibleParents,
      creationDetails: {
        selectedText,
        startOffset,
        fullText
      }
    });
    selection.removeAllRanges();
    ignoreClickRef.current = true;
    setTimeout(() => { ignoreClickRef.current = false; }, 300);

  }, [documentData, editingTarget]);

  const handleSaveEdit = (newAnalysisValues, saveMode = 'main') => {
    if (!editingTarget) return;
    const { indices, isCreating, creationDetails } = editingTarget;
    const newData = [...documentData];

    if (isCreating) {
      const { blockIdx, lineIdx, unitIdx } = indices;
      const { startOffset, selectedText, fullText } = creationDetails;

      const newUnit = {
        type: 'word',
        original: selectedText,
        analysis: newAnalysisValues,
        rawAnnotation: '',
        nestedData: null,
        supplementaryData: []
      };
      newUnit.rawAnnotation = AnalysisParser.serialize(newAnalysisValues, selectedText);
      newUnit.rawAnnotation = `[${newUnit.rawAnnotation}]`;

      if (saveMode === 'sub') {
        // Add as Sub-Analysis (Nested)
        const parentUnit = newData[blockIdx].lines[lineIdx].units[unitIdx];
        let targetList = parentUnit.nestedData || [];

        if (targetList.length === 0) {
          targetList = [{ type: 'text', original: parentUnit.original }];
        }

        // Find where to insert in nested list
        let currentOffset = 0;
        let targetSubIndex = -1;
        let relativeStart = 0;

        // We need to find the sub-unit that contains the startOffset
        for (let i = 0; i < targetList.length; i++) {
          const len = targetList[i].original.length;
          if (startOffset >= currentOffset && startOffset < currentOffset + len) {
            targetSubIndex = i;
            relativeStart = startOffset - currentOffset;
            break;
          }
          currentOffset += len;
        }

        if (targetSubIndex !== -1 && targetList[targetSubIndex].type === 'text') {
          const subFullText = targetList[targetSubIndex].original;
          const preText = subFullText.substring(0, relativeStart);
          const postText = subFullText.substring(relativeStart + selectedText.length);

          const newSubUnits = [];
          if (preText) newSubUnits.push({ type: 'text', original: preText });
          newSubUnits.push(newUnit);
          if (postText) newSubUnits.push({ type: 'text', original: postText });

          targetList.splice(targetSubIndex, 1, ...newSubUnits);
          parentUnit.nestedData = targetList;
        } else {
          console.error("Could not find valid text node for sub-analysis insertion");
        }

      } else {
        // Add as Main Analysis (Independent)
        // This replaces/splits the unit(s) at the top level

        // Note: If we are replacing a 'word' unit with a new 'word' unit (plus text), 
        // we are essentially destroying the old word structure.

        // If startUnitIdx === endUnitIdx, we split that unit.
        const endOffset = startOffset + selectedText.length;
        const preText = fullText.substring(0, startOffset);
        const postText = fullText.substring(endOffset);

        const newUnits = [];
        if (preText) newUnits.push({ type: 'text', original: preText });
        newUnits.push(newUnit);
        if (postText) newUnits.push({ type: 'text', original: postText });

        const lineUnits = newData[blockIdx].lines[lineIdx].units;
        lineUnits.splice(unitIdx, 1, ...newUnits);
      }

    } else {
      // Editing existing
      let targetUnit = newData[indices.blockIdx].lines[indices.lineIdx].units[indices.unitIdx];
      let unitToUpdate = targetUnit;

      if (indices.subIndex !== null && indices.subIndex !== undefined) {
        const list = indices.subType === 'nested' ? targetUnit.nestedData : targetUnit.supplementaryData;
        unitToUpdate = list[indices.subIndex];
      }
      unitToUpdate.analysis = newAnalysisValues;
    }

    setDocumentData(newData);
    setEditingTarget(null);
  };

  const handleDeleteAnalysis = () => {
    if (!editingTarget) return;
    const { indices } = editingTarget;
    const newData = [...documentData];

    const lineUnits = newData[indices.blockIdx].lines[indices.lineIdx].units;

    if (indices.subIndex === null || indices.subIndex === undefined) {
      const originalText = lineUnits[indices.unitIdx].original;
      lineUnits[indices.unitIdx] = { type: 'text', original: originalText };
    } else {
      const parent = lineUnits[indices.unitIdx];
      const list = indices.subType === 'nested' ? parent.nestedData : parent.supplementaryData;
      const originalText = list[indices.subIndex].original;
      list[indices.subIndex] = { type: 'text', original: originalText };
    }

    setDocumentData(newData);
    setEditingTarget(null);
  }

  // --- Debug Mode Logic ---
  const [debugMode, setDebugMode] = useState(false);

  const generateRawOutput = () => {
    return documentData.map(block => {
      let rawText = '';
      let analysisLines = [];

      block.lines.forEach((line, lIdx) => {
        line.units.forEach(unit => {
          rawText += unit.original;

          if (unit.type === 'word') {
            const mainAnalysis = AnalysisParser.serialize(unit.analysis);
            analysisLines.push(`<${unit.original}>[${mainAnalysis}]`);

            if (unit.nestedData) {
              unit.nestedData.forEach(sub => {
                if (sub.type === 'word') {
                  const subAnalysis = AnalysisParser.serialize(sub.analysis);
                  analysisLines.push(`\t<${sub.original}>[${subAnalysis}]`);
                }
              });
            }
          }
        });
        if (lIdx < block.lines.length - 1) rawText += '\n';
      });

      return `>>> ${rawText} >>>>\n${analysisLines.join('\n')}\n>>>>>`;
    }).join('\n\n');
  };

  // Determine content class for selection styling
  const contentSelectionClass = editingTarget
    ? (editingTarget.isCreating ? 'creating-mode' : 'editing-mode')
    : '';

  return (
    <div className="app-root" onMouseUp={handleSelection}>
      <main className="main-container">

        <div className="header-container">
          <h1 className="app-title">藏文分析閱讀器 (React版)</h1>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="debugMode"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="debugMode" className="debug-mode-label">Debug Mode</label>
            </div>

            <label className={`file-upload-label ${!isMammothLoaded ? 'disabled' : ''}`}>
              <span>{isMammothLoaded ? '讀取 Word 檔案 (.docx)' : '載入核心中...'}</span>
              <input
                type="file"
                className="hidden"
                accept=".docx"
                onChange={handleFileUpload}
                disabled={!isMammothLoaded}
              />
            </label>
          </div>
        </div>

        <div ref={contentRef} className={`content-card tibetan-content ${contentSelectionClass}`}>
          {loading && <div className="loading-text">正在解析文件...</div>}

          {!loading && documentData.length === 0 && (
            <div className="empty-state">
              請上傳 .docx 檔案以開始分析。<br />
              <span className="text-sm mt-2 inline-block">您可以在未分析的文字上選取並建立新的註釋。</span>
            </div>
          )}

          {documentData.map((block, bIdx) => (
            <div key={bIdx} className="block-container">
              {block.lines.map((line, lIdx) => (
                <LineRenderer
                  key={lIdx}
                  line={line}
                  blockIdx={bIdx}
                  lineIdx={lIdx}
                  onUnitClick={handleUnitClick}
                  editingTarget={editingTarget}
                  isAnyEditActive={!!editingTarget}
                />
              ))}
            </div>
          ))}
        </div>

        {debugMode && (
          <div className="debug-container">
            <h3 className="debug-header">
              <span>Debug: Raw Text & Analysis</span>
              <button
                onClick={() => navigator.clipboard.writeText(generateRawOutput())}
                className="btn-copy"
              >
                Copy to Clipboard
              </button>
            </h3>
            <textarea
              readOnly
              className="debug-textarea"
              value={generateRawOutput()}
            />
          </div>
        )}
      </main>

      <EditPopover
        isOpen={!!editingTarget}
        onClose={() => setEditingTarget(null)}
        onSave={handleSaveEdit}
        onDelete={handleDeleteAnalysis}
        data={editingTarget ? editingTarget.data : null}
        isCreating={editingTarget ? editingTarget.isCreating : false}
        possibleParents={editingTarget ? editingTarget.possibleParents : []}
        anchorRect={anchorRect}
      />
    </div>
  );
}
