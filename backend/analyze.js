const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuration
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai'; // 'openai' or 'gemini'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

// Initialize Clients
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT_TEMPLATE = `### TARGET
我會給你一段藏文，你要用以下的格式註解藏文。

### 核心規則：純文字輸出 (Raw Text Output)
1.  **你*必須*將你完整的、最終的回答，*只*放在一個 \` \`\`\`txt ... \`\`\` \` 區塊中。**
2.  **這能確保 100% 避免 Markdown 渲染**，保留所有 \`>>>\` 和 \`<>\` 標記的原始樣貌。 (不含 \`)
3.  **絕對禁止**：在偈頌與偈頌之間使用 \`---\` 或任何 Markdown 分隔線。
4.  **唯一的結構**：整篇回答的結構，**只**能由「藏文原文」和「\`>>>\`, \`>>>>\`, \`>>>>>\` 標記」組成。

---

### 格式邏輯總結

這是一個「由上而下」(Top-Down) 的分析流程，從完整的文本段落開始，逐層深入到最小的詞根。

---

### 1. 結構層：原文 -> 標記 -> 分析區塊

* **以「偈頌」(Stanza) 為單位：** 將整篇文拆解成數個獨立區塊。
* 獨立區塊原文開頭為獨立一行的 \`>>>\`
* ***步驟 1: 顯示原文區塊。* (例如 4 句偈頌)
* ***步驟 2: 緊接著下方，獨佔一行，使用 \`>>>\` 標記。*
* ***步驟 3: 在 \`>>>>\` 下方，為分析區塊
* ***步驟 3: 此獨立區塊分析完成後，下一行，獨立一行，使用\`>>>>>\`標記

原文要在 >>> 和 >>>> 中間

**詳細規則：**

* **\`>>>\`**
    * **功能：** 標記「獨立區塊文本」的開始。
    * **格式：** 獨佔一行

* **\`>>>>\`**
    * **功能：** 標記「分析區塊」的開始。
    * **格式：** 獨佔一行
    * **內容：** 此區塊內是「行內逐詞註解」。


* **\`>>>>>\`**
    * **功能：** 標記「分析區塊」的結束。
    * **格式：** 獨佔一行。

### 2. 分析區塊

這是在 \`>>>>\` ... \`>>>>>\`  區塊內的核心邏輯。
**規則：**
每行一個要分析的詞。以\`<詞>[註釋]\`。參考以下核心語法定義章節。
要是有複合詞，參考3. 複合詞分析章節加之。
詞的尾端不會有\`་\`
  舉例： <འབར་>[འབར་བ{vnd}燃燒] 是錯的。應該要是 <འབར>[འབར་བ{vnd}燃燒]
不標虛詞不分析虛詞

#### 核心語法定義
核心語法是：\`<>[A{B1,Bh, B2}C D]\`

符號：\`<>\`
範例：\`<བསྐྱོད>\`
定義與功能：
藏文詞彙框，用於標記文本中實際出現的詞彙。
強制限制：<>內的詞結尾不能是་

符號：\`[]\`
範例：\`[...{...}...]\`
定義與功能：
註解框，存放對該詞彙的所有分析。

符號：\`A\`
範例：\`[བསྐྱོད་པ{...}]\`
定義與功能：
A - 完整的詞 (藏文)（可選）。
功能：位於 \`[]\` 內、\`{}\` 之前的第一個藏文。
作用：標註 \`<>\` 中詞彙的「完整形式」。可能是簡寫的完整版，或是加回結尾詞贅པ或བ的詞。

符號：\`C\`
範例：\`[...{...}སྐྱོད་པ ...]\`
定義與功能：
C - 原型 (藏文)（可選）。
功能：位於 \`[]\` 內、\`{}\` 之後的第一個藏文。
作用：標註 \`A\`（動詞原型）。為動詞的現在式原型。

符號：\`{B1,Bh,B3}\`
範例：\`{n}\` 或 \`{vd,past}\`
定義與功能：
B - 元數據標籤（核心）。
B1（詞性）：必須存在（例如 n, vd）。
B2（時態）：可選（例如 past）。
邏輯：逗號用於分隔 B1 與 B2。
「或」邏輯：直線符號 | 例如 \`{vd,past|future}\`。
Bh, optional, could only be 'hon'(表示這是敬語)

符號：\`D\`
範例：\`[...搖動]\`、\`[...最勝，尊agraḥ]\`
定義與功能：
D - 中文翻譯（及補充）。
功能：位於 \`[]\` 內的最後部分，是主要翻譯。
作用：包含該詞彙的釋義與補充資訊（如梵文等）。
D 不用用 "/" 分開詞，要用 ","or"，"or"。"
(敬語)不用寫在翻譯，這在 Bh 已定義
必須簡潔易懂無多餘資訊

B1 可以是：adj,n,v,vd, vnd, pron,adv, n|v, n|adj, v->n, v->adj, (v->adj)|adv
B2 可以是: imp,past,future
B1 有多種詞性要標的話不用 "," like "n,adj" 標, 要用 "|", like n|adj

vd ཐ་དད་པ
vnd ཐ་མི་དད་པ

B1, B2 可用 | 標多主可能
B1 可用 -> 標。舉例 v->n 表示，雖然是動詞，但文本內這邊當n 用。

**不標註**
* 不標格位 (如 ཀྱི་, གི་, གྱི་, འི་, ཡི་, ཏུ་, ལ་, ནས་, ལས་, ཀྱིས་, གིས་, གྱིས་, ས)
* 不標虛詞 (如 ནི་, དང་, དེ་, ཅིང་, ཞིང་, ཤིང་)
* 不標複數 (如 རྣམས་, དག)
* 不標等 (如 སོགས་)
* 不標沒列出在此文件的詞性
* 不標名子(除非的名字是有意義的詞)
* 不標種子字 (如 ཨོཾ, ཨཱཿ, ཧཱུྂ༔, རཾ, ཡཾ, ཁཾ)

**<> 內不包含**
* 藏文詞和詞中間的་
* 詞尾端連著的虛詞格位詞

複合詞分析 \`<>[]\` 的規則同此

---

### 3. 複合詞分析

* **目的：** 當一個詞彙本身是由更小的詞根組成時（例如 \`རྒྱ་མཚོ\` 由 \`རྒྱ\` 和 \`མཚོ\` 組成）,分析之。
  緊接在之前分析的詞下一行
  每個複合詞單獨一行。開頭1tab。每行一個要加的<>[]分析
  如果為nested結構，下一層多1tab。
  藏文常常複合詞其實是縮寫，種種情況複合詞分析時要把完整的詞分析出來。
* 目前最多只有一層 nested

`;

const { verifyToken } = require('./auth');

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    console.log('Provider:', LLM_PROVIDER);

    try {
        // Authentication
        const headers = event.headers || {};
        const authHeader = headers.authorization || headers.Authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'No token provided' })
            };
        }

        const user = await verifyToken(token);

        // Authorization: Only allow specific email
        if (user.email !== 'crokobit@gmail.com') {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Access denied. You are not authorized to use this feature.' })
            };
        }

        const body = JSON.parse(event.body);
        const { text } = body;

        if (!text) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Text is required' })
            };
        }

        let responseText = '';

        if (LLM_PROVIDER === 'gemini') {
            // Gemini Implementation
            const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
            const result = await model.generateContent([PROMPT_TEMPLATE, text]);
            const response = await result.response;
            responseText = response.text();
        } else {
            // OpenAI Implementation (Default)
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: PROMPT_TEMPLATE },
                    { role: "user", content: text }
                ],
                model: OPENAI_MODEL,
            });
            responseText = completion.choices[0].message.content;
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ result: responseText })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};
