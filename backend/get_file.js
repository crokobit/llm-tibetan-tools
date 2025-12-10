const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { verifyToken } = require('./auth');

const s3Client = new S3Client({});

const BUCKET_NAME = process.env.BUCKET_NAME;

exports.handler = async (event) => {
    try {
        const headers = event.headers || {};
        const authHeader = headers.authorization || headers.Authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No token provided' }) };
        }

        let user;
        try {
            user = await verifyToken(token);
        } catch (error) {
            console.error('Token verification failed:', error);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
        }
        const userId = user.sub;

        const filename = event.queryStringParameters?.filename;
        if (!filename) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing filename' }) };
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: `${userId}/${filename}`
        });

        const response = await s3Client.send(command);
        // response.Body is a stream in Node.js
        const streamToString = (stream) => new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

        const bodyContents = await streamToString(response.Body);

        return {
            statusCode: 200,
            body: JSON.stringify({ content: bodyContents })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
