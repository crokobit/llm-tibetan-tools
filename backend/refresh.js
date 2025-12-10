const https = require('https');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TABLE_NAME = process.env.TABLE_NAME;

function request(options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.error_description || parsed.error || 'Request failed'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse response'));
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'OPTIONS,POST'
    };

    if (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body);
        const { refresh_handle } = body;

        if (!refresh_handle) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing refresh_handle' }) };
        }

        // 1. Look up User ID from Handle
        const handleRecord = await ddbDocClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                userId: `HANDLE#${refresh_handle}`,
                filename: 'HANDLE'
            }
        }));

        if (!handleRecord.Item) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired refresh handle' }) };
        }

        const userId = handleRecord.Item.sub;

        // 2. Look up Google Refresh Token
        const userRecord = await ddbDocClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                userId: `USER#${userId}`,
                filename: 'REFRESH_TOKEN'
            }
        }));

        if (!userRecord.Item || !userRecord.Item.refreshToken) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'No refresh token found for user' }) };
        }

        const refreshToken = userRecord.Item.refreshToken;

        // 3. Exchange Refresh Token for new Access Token
        const tokenParams = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        }).toString();

        const tokenResponse = await request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, tokenParams);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                access_token: tokenResponse.access_token,
                expires_in: tokenResponse.expires_in
            })
        };

    } catch (error) {
        console.error('Refresh error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
