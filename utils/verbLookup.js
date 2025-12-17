
import verbIndex from './tibetan_verb_index.json';

/**
 * Looks up a Tibetan verb in the index to find its tense, volition, and honorific status.
 * @param {string} text - The Tibetan text to look up (e.g., "ཀུམ་པ", "བཀུམ").
 * @returns {Array|null} - Array of matching entries or null if not found.
 */
export const lookupVerb = (text) => {
    if (!text) return null;

    const trimmed = text.trim();

    // 1. Try exact match
    if (verbIndex[trimmed]) {
        return verbIndex[trimmed];
    }

    // 2. Try removing suffixes 'པ' (pa) or 'བ' (ba) if present
    // Note: The user mentioned removing suffix 'བ', but 'པ' is also common in citations (e.g. ཀུམ་པ -> ཀུམ)
    const suffixes = ['པ', 'བ'];

    for (const suffix of suffixes) {
        if (trimmed.endsWith(suffix)) {
            const stem = trimmed.slice(0, -1); // Remove last character
            if (verbIndex[stem]) {
                return verbIndex[stem];
            }
        }
    }

    return null;
};

/**
 * Enriches an analysis object with verb information if available.
 * @param {object} analysis - The existing analysis object (should have a 'root' or similar).
 * @param {string} originalText - The original text.
 * @returns {object} - The enriched analysis object.
 */
export const enrichAnalysis = (analysis, originalText) => {
    if (!analysis) return analysis;

    // Use original text or root for lookup
    const query = analysis.root || originalText;
    const matches = lookupVerb(query);

    if (matches && matches.length > 0) {
        // Deduplicate and Sort
        const uniqueOptions = [];
        const seen = new Set();

        matches.forEach(m => {
            const key = `${m.tense}-${m.definition}-${m.volition}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueOptions.push({
                    ...m,
                    id: key, // Simple unique ID for UI/AI reference
                    description: `${m.tense} (${m.dict || '?'})`
                });
            }
        });

        // Sort Order: Present, Past, Future, Imperative
        const tenseOrder = { 'Present': 1, 'Past': 2, 'Future': 3, 'Imperative': 4 };
        uniqueOptions.sort((a, b) => {
            return (tenseOrder[a.tense] || 99) - (tenseOrder[b.tense] || 99);
        });

        const firstMatch = uniqueOptions[0];

        return {
            ...analysis,
            tense: uniqueOptions.map(m => m.tense).join('/'), // Show all potential tenses
            hon: uniqueOptions.some(m => m.hon), // True if any form is honorific
            volition: firstMatch.volition,
            // Detailed verb info for UI/AI
            verbDetails: uniqueOptions
        };
    }

    return analysis;
};
