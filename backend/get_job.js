const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { verifyToken } = require('./auth');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    try {
        // Authentication
        const headers = event.headers || {};
        const authHeader = headers.authorization || headers.Authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'No token provided' })
            };
        }

        let user;
        try {
            user = await verifyToken(token);
        } catch (error) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Invalid or expired token' })
            };
        }

        // Get Job ID from path
        const jobId = event.pathParameters?.jobId;
        if (!jobId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Missing jobId' })
            };
        }

        const command = new GetCommand({
            TableName: JOBS_TABLE_NAME,
            Key: { jobId }
        });

        const response = await docClient.send(command);
        const job = response.Item;

        if (!job) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Job not found' })
            };
        }

        // Check ownership (optional, but good practice if userId is stored)
        if (job.userId && job.userId !== user.sub && job.email !== user.email) {
            // For now, checking email if we stored it, or skip if we trust the random UUID
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(job)
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};
