const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { verifyToken } = require('./auth');

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.TABLE_NAME;

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

        // Soft Delete in DynamoDB (mark as deleted)
        await ddbDocClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                userId: userId,
                filename: filename
            },
            UpdateExpression: "set isDeleted = :true",
            ExpressionAttributeValues: {
                ":true": true
            }
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'File deleted successfully' })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
