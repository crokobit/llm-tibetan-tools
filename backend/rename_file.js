const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { verifyToken } = require('./auth');

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME;
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

        const body = JSON.parse(event.body);
        const { filename, newFilename } = body;

        if (!filename || !newFilename) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing filename or newFilename' }) };
        }

        if (filename === newFilename) {
            return { statusCode: 400, body: JSON.stringify({ error: 'New filename must be different' }) };
        }

        // 1. Check if new filename already exists
        const checkNew = await ddbDocClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { userId, filename: newFilename }
        }));

        if (checkNew.Item && !checkNew.Item.isDeleted) {
            return { statusCode: 409, body: JSON.stringify({ error: 'File with new name already exists' }) };
        }

        // 2. S3 Copy
        await s3Client.send(new CopyObjectCommand({
            Bucket: BUCKET_NAME,
            CopySource: `${BUCKET_NAME}/${userId}/${filename}`,
            Key: `${userId}/${newFilename}`
        }));

        // 3. Create new DynamoDB Item
        await ddbDocClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                userId: userId,
                filename: newFilename,
                updatedAt: new Date().toISOString()
            }
        }));

        // 4. Soft Delete Old Item
        await ddbDocClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { userId, filename },
            UpdateExpression: "set isDeleted = :true",
            ExpressionAttributeValues: { ":true": true }
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'File renamed successfully', newFilename })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
