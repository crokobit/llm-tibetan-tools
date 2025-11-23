const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const text = body.text;

        if (!text) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Text is required' }) };
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Analyze the following Tibetan text. Provide a grammatical breakdown and translation. Return the result in JSON format with keys: "translation", "grammatical_breakdown" (list of objects with "word", "pos", "meaning").
    
    Text: ${text}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textResult = response.text();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "OPTIONS,POST"
            },
            body: textResult
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message })
        };
    }
};
