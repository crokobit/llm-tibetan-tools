const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { verifyToken } = require('./auth');

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

exports.handler = async (event) => {
    try {
        // Handle CORS preflight if needed, but API Gateway usually handles it.
        // But we need to handle headers case insensitivity
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
        const userId = user.sub; // Google User ID

        const body = JSON.parse(event.body);
        const { filename, content } = body;

        if (!filename || !content) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing filename or content' }) };
        }

        // Save to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: `${userId}/${filename}`,
            Body: content, // content is stringified JSON
            ContentType: 'application/json'
        }));

        // Save metadata to DynamoDB
        await ddbDocClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                userId: userId,
                filename: filename,
                updatedAt: new Date().toISOString(),
            }
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'File saved successfully' })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
