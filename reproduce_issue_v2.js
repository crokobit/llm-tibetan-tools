
const RegexGrammar = {
    ANALYSIS_LINE: /^(\t*)<([^>]+)>\[(.*)\]\s*$/
};

const AnalysisParser = {
    parse: (x) => ({ raw: x })
};

// Start of New Logic from DocumentParser
function _parseAnalysisHierarchy(analysisText) {
    const lines = analysisText.split('\n');
    const roots = [];
    const stack = []; // Stores { depth, node }

    let buffer = '';
    let buffering = false;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return; // Skip empty lines

        // Check if this line starts a new analysis block that might be multi-line
        // Matches start like: tabs <word> [ ...
        if (!buffering) {
            // If it looks like a start of a line but doesn't end with ]
            // Normal line: ^(\t*)<([^>]+)>\[(.*)\]\s*$
            const startMatch = line.match(/^(\t*)<([^>]+)>\[(.*)/);
            if (startMatch) {
                // Check if it's already complete on one line
                // Be careful with nested brackets if any (though structure seems flat)
                // Simple check: does it end with ]?
                if (!line.trim().endsWith(']')) {
                    buffering = true;
                    buffer = line;
                    return;
                }
            }
        } else {
            // We are buffering
            buffer += '\n' + line;
            if (line.trim().endsWith(']')) {
                buffering = false;
                // Process the complete buffer
                _processLine(buffer, roots, stack);
                buffer = '';
            }
            return;
        }

        // Normal processing (single line or complete line)
        _processLine(line, roots, stack);
    });

    return roots;
}

function _processLine(line, roots, stack) {
    // Since we might have newlines in the [...] content, we need to be careful with the regex.
    // The original regex was: /^(\t*)<([^>]+)>\[(.*)\]\s*$/
    // We need to support '.' matching newlines for the content part.
    // We can manually parse or use a slightly adjusted regex with [\s\S] or 's' flag.

    const match = line.match(/^(\t*)<([^>]+)>\[([\s\S]*)\]\s*$/);
    if (!match) return;

    const depth = match[1].length; // Number of tabs
    const original = match[2];
    const rawAnnotation = match[3];

    const node = {
        type: 'word',
        original,
        rawAnnotation,
        // analysis: AnalysisParser.parse(rawAnnotation),
        nestedData: [],
        supplementaryData: []
    };

    // Find parent
    // Mock stack behavior for test
    roots.push(node);
}
// End of New Logic

const input = `<test>[
Line 1
Line 2
]`;

console.log("Testing with input:");
console.log(input);
const result = _parseAnalysisHierarchy(input);
console.log(`Found ${result.length} items.`);

if (result.length === 0) {
    console.log("FAIL: Multi-line analysis was ignored.");
} else {
    console.log("PASS: Multi-line analysis was parsed.");
    console.log("Content:", result[0].rawAnnotation);
}
