const OpenAI = require("openai");

// Initialize OpenAI Client
// Note: Lambda will pick up OPENAI_API_KEY from environment variables automatically if passed in constructor,
// but passing explicitly is safer if defined in CDK environment map.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event) => {
    // 1. CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body);
        const { text, items } = body;

        if (!text || !items || !Array.isArray(items)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Missing 'text' or 'items' array" })
            };
        }

        // 2. Construct Prompt with Indexed Annotations
        // We will insert markers into the text for each item to help the LLM identify them.
        // However, since we don't want to mess up the text indices, we'll just try to describe them by surrounding context 
        // OR rely on the fact that the user selected them.
        // BETTER STRATEGY (Approved): Annotate text with IDs.
        // But we need to insert them carefully. We assume 'items' are sorted by index or we do it here.

        // Let's create an annotated version of the text.
        // We need 'indexInText' for each item to do this accurately.
        // Items: [{ id, indexInText, original, verbOptions }]

        // Sort items by index descending so we can insert without offsetting previous indices
        const sortedItems = [...items].sort((a, b) => b.indexInText - a.indexInText);

        let annotatedText = text;

        // Map from our UUID to the User's Item ID
        const internalIdMap = {};

        sortedItems.forEach((item, idx) => {
            // We'll use a simple numeric ID for the prompt to keep tokens low
            const promptId = idx + 1;
            item.promptId = promptId; // Store for consistent usage!
            internalIdMap[promptId] = item.id;

            // Look for the word at the index to confirm (safety check)
            if (typeof item.indexInText === 'number' && item.original) {
                const start = item.indexInText;
                const end = start + item.original.length;

                const before = annotatedText.substring(0, start);
                const after = annotatedText.substring(end);
                const word = annotatedText.substring(start, end);

                annotatedText = `${before}[[ID:${promptId}]]${word}[[/ID]]${after}`;
            }
        });

        // 3. Construct the LLM Prompt
        let systemPrompt = `You are a Tibetan language expert. Analyze the provided text where specific verbs are marked with IDs like [[ID:1]]word[[/ID]].
For each marked verb, identify the correct definition/tense from the provided options based on the context.
Return a JSON array of objects with "id" (the numeric ID) and "selectedIndex" (the index of the correct option).
Example Response: { "results": [{ "id": 1, "selectedIndex": 0 }] }`;

        let userPrompt = `TEXT:\n"""\n${annotatedText}\n"""\n\nOPTIONS:\n`;

        // Use a copy to reverse for display order without mutating original sorted structure if needed elsewhere
        // But mainly rely on stored promptId
        [...sortedItems].reverse().forEach((item) => {
            const promptId = item.promptId;
            userPrompt += `\nVerb [[ID:${promptId}]] (${item.original}):\n`;
            item.verbOptions.forEach((opt, optIdx) => {
                userPrompt += `  [${optIdx}] Tense: ${opt.tense}, Def: ${opt.definition}, Vol: ${opt.volition}\n`;
            });
        });

        // 4. Call OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Or "gpt-3.5-turbo" if preferred for cost
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1, // Low temperature for deterministic behavior
        });

        const content = completion.choices[0].message.content;

        // 5. Parse and Format Result
        const responseJson = JSON.parse(content);
        // Normalize: OpenAI might wrap in 'results' key implicitly if prompted, or just array.
        // Our system prompt asked for { "results": [...] } format implicitly roughly?
        // Actually typical common practice is asking for specific schema.

        let resultsArray = responseJson.results || responseJson;
        if (!Array.isArray(resultsArray)) {
            // Fallback if structure mismatches
            console.warn("Unexpected JSON structure:", responseJson);
            resultsArray = [];
        }

        // Map back to original item IDs
        const mappedResults = resultsArray.map(r => ({
            id: internalIdMap[r.id],
            selectedIndex: parseInt(r.selectedIndex, 10) // Enforce integer
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ results: mappedResults })
        };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
