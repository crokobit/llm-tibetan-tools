import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// 1. LOGIC: IDENTIFYING & GRAMMAR (Regex)
// ==========================================

class RegexGrammar {
  static BLOCK = />>>\s*(.*?)\s*(?:>>>>\s*(.*?)\s*)?>>>>>/sg;
  static SUPPLEMENTARY_LINE = /^([^\s\[]+)\s*\[(.*)\]/;
  static UNIT_SPLIT = /(<[^>]+>\[.*?\])|(།|་|[^<།་]+)/g;
  static ANALYZED_WORD = /<([^>]+)>\[(.*)\]/;
  static ANALYSIS_CONTENT = /^(.*?){([a-z0-9/\->|]+)(?:,([^}]+))?}(.*)$/i;
  static NESTED_BLOCK = /^\[(<.*)\]$/;
  static BRACKET_CONTENT = /\[([^\[\]]+)\]$/;
}

// ==========================================
// 2. LOGIC: PARSING & ANALYSIS (OOP)
// ==========================================

class AnalysisParser {
  static parse(annotationString) {
    let content = annotationString;
    const lastMatch = content.match(RegexGrammar.BRACKET_CONTENT);
    if (lastMatch) {
      content = lastMatch[1];
    } else if (content.startsWith('[') && content.endsWith(']')) {
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

      const tibetanWordMatch = rest.match(/^([\u0F00-\u0FFF]+)/);
      if (tibetanWordMatch) {
        root = tibetanWordMatch[1].trim();
        definition = rest.substring(root.length).trim();
      } else {
        definition = rest;
      }
    } else {
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
  static parse(rawText) {
    const blocks = [];
    const matches = [...rawText.matchAll(RegexGrammar.BLOCK)];

    if (matches.length === 0 && rawText.trim().length > 0) {
       return this._parseBlockContent(rawText, null);
    }

    matches.forEach(match => {
      const mainContent = match[1];
      const suppContent = match[2];
      blocks.push(this._processBlock(mainContent, suppContent));
    });

    return blocks;
  }

  static _parseBlockContent(text, suppContent) {
      return this._processBlock(text, suppContent);
  }

  static _processBlock(mainContent, suppContent) {
    const supplementaryMap = new Map();
    if (suppContent) {
      const lines = suppContent.split('\n');
      lines.forEach(line => {
        const m = line.trim().match(RegexGrammar.SUPPLEMENTARY_LINE);
        if (m) {
          const label = m[1];
          const content = m[2];
          supplementaryMap.set(label, this._parseNestedUnits(content));
        }
      });
    }

    const lines = mainContent.split('\n')
      .filter(line => line.trim() !== '')
      .map(line => ({
        units: this._parseLineToUnits(line, supplementaryMap)
      }));

    return { lines };
  }

  static _parseLineToUnits(lineStr, supplementaryMap) {
    const parts = lineStr.match(RegexGrammar.UNIT_SPLIT) || [];
    return parts.map(part => {
      const analyzedMatch = part.match(RegexGrammar.ANALYZED_WORD);

      if (analyzedMatch) {
        const original = analyzedMatch[1];
        const rawAnnotation = analyzedMatch[2];
        
        return {
          type: 'word',
          original,
          rawAnnotation,
          analysis: AnalysisParser.parse(rawAnnotation),
          nestedData: this._checkAndParseNested(rawAnnotation),
          supplementaryData: supplementaryMap?.get(original) || []
        };
      } else {
        return {
          type: 'text',
          original: part
        };
      }
    });
  }

  static _checkAndParseNested(annotation) {
    const complexNestedMatch = annotation.match(/^\[(<.*)\](?=\[.*\]$)/) || annotation.match(/^\[(<.*)\]$/);
    if (complexNestedMatch) {
       const nestedContent = complexNestedMatch[1];
       if (nestedContent.includes('<')) {
         return this._parseNestedUnits(nestedContent);
       }
    }
    return null;
  }

  static _parseNestedUnits(contentString) {
    return this._parseLineToUnits(contentString, null);
  }
}

// ==========================================
// 3. UI COMPONENTS (REACT)
// ==========================================

const FONT_SIZES = {
  tibetan: 'text-4xl sm:text-5xl',
  analysisMain: 'text-lg',
  analysisSub: 'text-sm'
};

const POS_COLORS = {
  n: 'border-red-500',
  v: 'border-blue-500',
  adj: 'border-green-500',
  adv: 'border-purple-500',
  other: 'border-gray-500'
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
    if(!text) return null;
    return <div className={`text-gray-600 ${isSub ? 'text-xs' : 'text-sm'} font-medium`}>{text}</div>
}

const WordCard = ({ unit, onClick, isNested = false }) => {
  const { analysis, original, nestedData, supplementaryData } = unit;
  
  const mainPosKey = analysis.pos?.toLowerCase().split(/[\->|]/)[0] || 'other';
  const mainBorderColor = POS_COLORS[mainPosKey] || POS_COLORS.other;
  const displayDef = truncateDefinition(analysis.definition);

  // --- Compound Mode Logic (Grid Layout) ---
  const subUnits = (nestedData && nestedData.length > 0) ? nestedData : (supplementaryData && supplementaryData.length > 0 ? supplementaryData : null);
  const subType = nestedData && nestedData.length > 0 ? 'nested' : 'supplementary';

  if (subUnits) {
    return (
      <div 
        className="inline-grid gap-x-0.5 mx-1 align-top cursor-pointer group"
        style={{ gridTemplateColumns: `repeat(${subUnits.length}, auto)` }}
        // Clicking background selects the main unit
        onClick={(e) => { e.stopPropagation(); onClick(unit, null, null); }}
      >
        {/* --- Row 1: Tibetan Sub-Words (The "Main Word") --- */}
        {subUnits.map((u, i) => {
          // Check if this sub-unit is just a tsheg
          const isTsheg = u.original.trim() === '་';
          
          return (
            <div 
              key={`tib-${i}`} 
              className={`text-center px-0.5 rounded-t transition-colors ${!isTsheg ? 'hover:bg-blue-50' : ''}`}
              onClick={(e) => { 
                // If tsheg, let it bubble to main unit (do nothing here). If word, handle sub-click.
                if (!isTsheg) {
                  e.stopPropagation(); 
                  onClick(u, i, subType); 
                }
              }} 
            >
              <span className={`font-serif ${isNested ? 'text-2xl' : FONT_SIZES.tibetan}`}>{u.original}</span>
            </div>
          );
        })}

        {/* --- Row 2: Main Analysis (Spans all cols) --- */}
        <div 
           style={{ gridColumn: `1 / span ${subUnits.length}` }} 
           className="text-center w-full mb-1"
           onClick={(e) => { e.stopPropagation(); onClick(unit, null, null); }} // Click here edits main
        >
           {/* Main Analysis Underline */}
           <div className={`w-full border-b-[4px] ${mainBorderColor} mb-1`}></div>
           
           {/* Main Analysis Text */}
           <div className="flex flex-col items-center">
             <AnalysisLabel text={analysis.root} isSub={isNested} />
             {analysis.tense && <span className="text-xs text-gray-400 italic">({analysis.tense})</span>}
             <div className={`text-gray-500 ${isNested ? 'text-[10px]' : 'text-xs'} truncate max-w-full`}>
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
           const subBgColor = subBorderColor.replace('border-', 'bg-');
           const subDef = truncateDefinition(u.analysis?.definition);
           
           return (
             <div 
               key={`sub-${i}`} 
               className="flex flex-col items-center w-full group/sub"
               onClick={(e) => { e.stopPropagation(); onClick(u, i, subType); }}
             >
                {/* Sub Analysis Underline (Colored Bar) */}
                <div className={`w-full h-[3px] ${subBgColor} mb-0.5 opacity-80 group-hover/sub:opacity-100`}></div>
                
                {/* Sub Analysis Text */}
                <div className="text-center w-full group-hover/sub:bg-gray-50 rounded">
                   <div className="text-[10px] font-medium text-gray-600">{u.analysis?.root}</div>
                   <div className="text-[10px] text-gray-500 truncate w-full leading-tight">
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
  const borderClass = `border-b-[4px] ${mainBorderColor}`;
  
  return (
    <div 
      className={`inline-flex flex-col items-center mx-1 align-top cursor-pointer group transition-all duration-200 hover:-translate-y-1`}
      onClick={(e) => {
        e.stopPropagation(); 
        onClick(unit, null, null);
      }}
    >
      {/* Main Tibetan Word */}
      <div className={`px-1 ${borderClass} group-hover:bg-blue-50 rounded-t transition-colors`}>
        <span className={`font-serif ${isNested ? 'text-2xl' : FONT_SIZES.tibetan}`}>{original}</span>
      </div>

      {/* Main Analysis */}
      <div className="text-center mt-1 max-w-[120px]">
        <AnalysisLabel text={analysis.root} isSub={isNested} />
        {analysis.tense && <span className="text-xs text-gray-400 italic">({analysis.tense})</span>}
        <div className={`text-gray-500 ${isNested ? 'text-[10px]' : 'text-xs'} truncate w-full`}>
          {displayDef}
        </div>
      </div>
    </div>
  );
};

const UnitRenderer = ({ unit, indices, onClick, isNested }) => {
  if (unit.type === 'text') {
    return (
      <span 
        className={`inline-block mx-0.5 font-serif ${isNested ? 'text-xl' : FONT_SIZES.tibetan} cursor-text`}
        data-indices={indices ? JSON.stringify(indices) : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {unit.original}
      </span>
    );
  }
  return <WordCard unit={unit} onClick={onClick} isNested={isNested} />;
};

const LineRenderer = ({ line, blockIdx, lineIdx, onUnitClick }) => {
  return (
    <div className="my-6 leading-relaxed text-justify">
      {line.units.map((unit, unitIdx) => (
        <UnitRenderer 
          key={unitIdx} 
          unit={unit} 
          indices={{ blockIdx, lineIdx, unitIdx }}
          onClick={(subUnit, subIndex, subType) => onUnitClick(blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType)} 
        />
      ))}
    </div>
  );
};

// --- Modal Component ---

const EditModal = ({ isOpen, onClose, onSave, onDelete, data, isCreating }) => {
  const [formData, setFormData] = useState({
    volls: '', root: '', pos: '', tense: [], definition: ''
  });

  useEffect(() => {
    if (isCreating) {
      setFormData({ volls: '', root: '', pos: 'other', tense: [], definition: '' });
    } else if (data && data.analysis) {
      setFormData({
        volls: data.analysis.volls || '',
        root: data.analysis.root || '',
        pos: data.analysis.pos || '',
        tense: data.analysis.tense ? data.analysis.tense.split('|') : [],
        definition: data.analysis.definition || ''
      });
    }
  }, [data, isCreating]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ...formData,
      tense: formData.tense.join('|')
    });
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold">{isCreating ? '新增分析' : '編輯分析'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-black">&times;</button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="text-center mb-4">
             <h2 className="text-4xl font-serif">{isCreating ? data : data.original}</h2>
             {isCreating && <p className="text-sm text-green-600 mt-1">(New Selection)</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="block text-sm font-medium text-gray-700">Root</label>
               <input className="w-full border rounded p-2" value={formData.root} onChange={e => setFormData({...formData, root: e.target.value})} placeholder="e.g., འགྲོ་" />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700">Full (Volls)</label>
               <input className="w-full border rounded p-2" value={formData.volls} onChange={e => setFormData({...formData, volls: e.target.value})} />
             </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">POS</label>
            <select className="w-full border rounded p-2" value={formData.pos} onChange={e => setFormData({...formData, pos: e.target.value})}>
              <option value="other">Other</option>
              <option value="n">Noun (n)</option>
              <option value="v">Verb (v)</option>
              <option value="adj">Adjective (adj)</option>
              <option value="adv">Adverb (adv)</option>
              <option value="part">Particle</option>
            </select>
          </div>

          {isVerb && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tense</label>
              <div className="flex flex-wrap gap-2">
                {['present', 'past', 'future', 'imperative'].map(t => (
                   <button 
                     key={t}
                     onClick={() => toggleTense(t)}
                     className={`px-2 py-1 text-xs rounded border ${formData.tense.includes(t) ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-gray-50'}`}
                   >
                     {t}
                   </button>
                ))}
              </div>
            </div>
          )}

          <div>
             <label className="block text-sm font-medium text-gray-700">Definition</label>
             <textarea className="w-full border rounded p-2" rows={3} value={formData.definition} onChange={e => setFormData({...formData, definition: e.target.value})} placeholder="Full definition here..." />
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between rounded-b-lg">
           {!isCreating ? (
             <button onClick={onDelete} className="text-red-600 hover:bg-red-50 px-3 py-2 rounded">刪除分析</button>
           ) : <div></div>}
           <div className="space-x-2">
             <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100">取消</button>
             <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">儲存變更</button>
           </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN APP COMPONENT
// ==========================================

export default function TibetanReader() {
  const [documentData, setDocumentData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null); 
  const [isMammothLoaded, setIsMammothLoaded] = useState(false);
  const contentRef = useRef(null);

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

  const handleUnitClick = (blockIdx, lineIdx, unitIdx, subUnit, subIndex, subType) => {
    setEditingTarget({
      indices: { blockIdx, lineIdx, unitIdx, subIndex, subType },
      data: subUnit,
      isCreating: false
    });
  };

  const handleSelection = useCallback(() => {
    if (editingTarget) return; 

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString().trim();
    if (!selectedText) return;

    let node = selection.anchorNode;
    if (node.nodeType === 3) node = node.parentNode;
    
    const wrapper = node.closest('[data-indices]');
    if (!wrapper) return;

    try {
      const indices = JSON.parse(wrapper.dataset.indices);
      const { blockIdx, lineIdx, unitIdx } = indices;
      
      const textUnit = documentData[blockIdx].lines[lineIdx].units[unitIdx];
      
      if (textUnit.type !== 'text') return;
      
      const fullText = textUnit.original;
      const startOffset = fullText.indexOf(selectedText);
      if (startOffset === -1) return;

      const endOffset = startOffset + selectedText.length;

      setEditingTarget({
        indices: { blockIdx, lineIdx, unitIdx },
        data: selectedText,
        isCreating: true,
        creationDetails: { startOffset, endOffset, selectedText, fullText }
      });
      selection.removeAllRanges();

    } catch (e) {
      console.error("Selection error", e);
    }
  }, [documentData, editingTarget]);

  const handleSaveEdit = (newAnalysisValues) => {
    if (!editingTarget) return;
    const { indices, isCreating, creationDetails } = editingTarget;
    const newData = [...documentData];
    
    if (isCreating) {
      const { blockIdx, lineIdx, unitIdx } = indices;
      const { startOffset, endOffset, selectedText, fullText } = creationDetails;
      
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

      const preText = fullText.substring(0, startOffset);
      const postText = fullText.substring(endOffset);

      const newUnits = [];
      if (preText) newUnits.push({ type: 'text', original: preText });
      newUnits.push(newUnit);
      if (postText) newUnits.push({ type: 'text', original: postText });

      const lineUnits = newData[blockIdx].lines[lineIdx].units;
      lineUnits.splice(unitIdx, 1, ...newUnits);

    } else {
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans" onMouseUp={handleSelection}>
      <main className="max-w-5xl mx-auto p-4 sm:p-8">
        
        <div className="flex justify-between items-center mb-8">
           <h1 className="text-2xl font-bold text-gray-800">藏文分析閱讀器 (React版)</h1>
           <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition ${!isMammothLoaded ? 'opacity-50 cursor-not-allowed' : ''}`}>
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

        <div ref={contentRef} className="bg-white shadow-lg rounded-xl p-8 min-h-[500px]">
          {loading && <div className="text-center text-gray-500 mt-10">正在解析文件...</div>}
          
          {!loading && documentData.length === 0 && (
            <div className="text-center text-gray-400 mt-20 border-2 border-dashed border-gray-200 rounded-lg p-10">
              請上傳 .docx 檔案以開始分析。<br/>
              <span className="text-sm mt-2 inline-block">您可以在未分析的文字上選取並建立新的註釋。</span>
            </div>
          )}

          {documentData.map((block, bIdx) => (
            <div key={bIdx} className="mb-12 pb-8 border-b border-gray-100 last:border-0">
              {block.lines.map((line, lIdx) => (
                <LineRenderer 
                  key={lIdx} 
                  line={line} 
                  blockIdx={bIdx} 
                  lineIdx={lIdx}
                  onUnitClick={handleUnitClick} 
                />
              ))}
            </div>
          ))}
        </div>
      </main>

      <EditModal 
        isOpen={!!editingTarget} 
        data={editingTarget?.data || {}} 
        isCreating={editingTarget?.isCreating}
        onClose={() => setEditingTarget(null)} 
        onSave={handleSaveEdit}
        onDelete={handleDeleteAnalysis}
      />
    </div>
  );
}
