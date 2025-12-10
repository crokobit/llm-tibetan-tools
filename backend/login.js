const https = require('https');
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'postmessage';
const TABLE_NAME = process.env.TABLE_NAME;

/**
 * Helper to make HTTP requests
 */
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
        const { code } = body;

        if (!code) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing code' }) };
        }

        // 1. Exchange code for tokens (requesting offline access)
        const tokenParams = new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString();

        const tokenResponse = await request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, tokenParams);

        // 2. Get User Info
        let user;
        if (tokenResponse.id_token) {
            const parts = tokenResponse.id_token.split('.');
            user = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        } else {
            user = await request({
                hostname: 'www.googleapis.com',
                path: '/oauth2/v3/userinfo',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
            });
        }

        // 3. Store Refresh Token (if provided)
        if (tokenResponse.refresh_token) {
            await ddbDocClient.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    userId: `USER#${user.sub}`,
                    filename: 'REFRESH_TOKEN',
                    refreshToken: tokenResponse.refresh_token,
                    updatedAt: new Date().toISOString()
                }
            }));
        }

        // 4. Generate and Store Refresh Handle
        // This is a secure random string the frontend can use to request a new token
        const refreshHandle = crypto.randomUUID();
        await ddbDocClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                userId: `HANDLE#${refreshHandle}`, // Lookup key
                filename: 'HANDLE',
                sub: user.sub,
                ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
            }
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                access_token: tokenResponse.access_token,
                expires_in: tokenResponse.expires_in,
                refresh_handle: refreshHandle,
                user: {
                    sub: user.sub,
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                }
            })
        };

    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
