
// Mock logic from EditPopover.jsx
const parseNode = (nodeStr) => {
    // Exact copy of parseNode logic from EditPopover.jsx (simplified for context but preserving the relevant parts)
    // Handle multi-select POS (e.g., "imp|past")
    if (nodeStr.includes('|')) {
        const parts = nodeStr.split('|').map(p => p.trim());
        const allSimple = parts.every(p => !p.includes(','));
        if (allSimple) {
            return { ids: parts, attrs: { hon: false, tense: [] } };
        }
    }

    if (nodeStr.includes(',')) {
        const parts = nodeStr.split(',').map(p => p.trim());
        const id = parts[0];
        const attrs = { hon: false, tense: [] };

        parts.slice(1).forEach(part => {
            if (part === 'hon') {
                attrs.hon = true;
            } else if (['past', 'imp', 'future', 'fut'].includes(part)) {
                const tenseValue = part === 'fut' ? 'future' : part;
                if (!attrs.tense.includes(tenseValue)) {
                    attrs.tense.push(tenseValue);
                }
            } else if (part.includes('|')) {
                // Handle tense multi-select like "past|future"
                const tenses = part.split('|').map(t => t.trim());
                tenses.forEach(t => {
                    if (['past', 'imp', 'future', 'fut'].includes(t)) {
                        const tenseValue = t === 'fut' ? 'future' : t;
                        if (!attrs.tense.includes(tenseValue)) {
                            attrs.tense.push(tenseValue);
                        }
                    }
                });
            }
        });

        return { ids: [id], attrs };
    }

    // ... Old format fallback omitted for brevity as it's not the case here ...
    const match = nodeStr.match(/^([a-z]+)(?:\((.*?)\))?$/);
    if (!match) return { ids: [nodeStr], attrs: { hon: false, tense: [] } };
    return { ids: [match[1]], attrs: { hon: false, tense: [] } }; // Mocking basic return
};

const parsePosString = (posStr) => {
    if (!posStr) return null; // ...

    if (posStr.includes('->') || posStr.includes('→')) {
        return "operator_transform";
    } else if (posStr.includes('|')) {
        const node = parseNode(posStr);
        if (node.ids.length > 1) {
            return { type: 'multi-select', node };
        } else {
            // PROPOSED FIX HERE
            // Check if the pipe segments are actually tenses that were consumed by parseNode

            const parts = posStr.split('|').map(p => p.trim());
            // parts[0] is "v,past"
            // parts[1] is "imp"

            // Check if parts[1..n] are present in node.attrs.tense?
            const extraParts = parts.slice(1);
            const consumedAsTense = extraParts.every(p => {
                const normalized = p === 'fut' ? 'future' : p;
                return node.attrs.tense.includes(normalized);
            });

            if (consumedAsTense && node.attrs.tense.length > 0) {
                return {
                    start: node.ids,
                    startAttrs: node.attrs,
                    op: 'single', // Force single
                    end: [],
                    endAttrs: { hon: false, tense: [] },
                    _reason: "Fixed by ConsumedTense Check"
                };
            }
            // END PROPOSED FIX

            // Union fallback
            return { type: 'union', parts };
        }
    } else {
        const node = parseNode(posStr);
        return {
            type: 'single',
            start: node.ids,
            startAttrs: node.attrs
        };
    }
};

const runTest = (input) => {
    console.log(`Testing: "${input}"`);
    console.log("Result:", JSON.stringify(parsePosString(input), null, 2));
}

runTest("v,past|imp");
runTest("v,past|future");
runTest("v,hon|n"); // Should stay Union
runTest("n|v"); // Should stay Multi-select
runTest("v,past"); // Simple
