const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
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

        const command = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'userId = :uid',
            ExpressionAttributeValues: {
                ':uid': userId
            }
        });

        const response = await ddbDocClient.send(command);

        return {
            statusCode: 200,
            body: JSON.stringify(response.Items)
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
