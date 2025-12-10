const { Stack, Duration, RemovalPolicy, CfnOutput } = require('aws-cdk-lib');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const s3 = require('aws-cdk-lib/aws-s3');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigw = require('aws-cdk-lib/aws-apigatewayv2');
const { HttpLambdaIntegration } = require('@aws-cdk/aws-apigatewayv2-integrations-alpha');
const path = require('path');

class TibetanToolsStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // DynamoDB Table
        const table = new dynamodb.Table(this, 'TibetanToolsFiles', {
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'filename', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY, // NOT RECOMMENDED FOR PRODUCTION
        });

        // S3 Bucket
        const bucket = new s3.Bucket(this, 'TibetanToolsUserFiles', {
            removalPolicy: RemovalPolicy.DESTROY, // NOT RECOMMENDED FOR PRODUCTION
            autoDeleteObjects: true, // NOT RECOMMENDED FOR PRODUCTION
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.DELETE],
                    allowedOrigins: ['*'], // Restrict this in production
                    allowedHeaders: ['*'],
                },
            ],
        });

        // Lambda Layer (optional, but good for dependencies if needed)
        // For now, we'll bundle code or just point to backend folder.
        // We'll assume the backend folder is at ../backend relative to cdk folder.

        const backendPath = path.join(__dirname, '../../backend');

        // Common Lambda Props
        const commonProps = {
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset(backendPath),
            environment: {
                TABLE_NAME: table.tableName,
                BUCKET_NAME: bucket.bucketName,
            },
            timeout: Duration.seconds(10),
        };

        // Save File Function
        const saveFileFunction = new lambda.Function(this, 'SaveFileFunction', {
            ...commonProps,
            handler: 'save_file.handler',
        });
        table.grantWriteData(saveFileFunction);
        bucket.grantWrite(saveFileFunction);

        // List Files Function
        const listFilesFunction = new lambda.Function(this, 'ListFilesFunction', {
            ...commonProps,
            handler: 'list_files.handler',
        });
        table.grantReadData(listFilesFunction);

        // Get File Function
        const getFileFunction = new lambda.Function(this, 'GetFileFunction', {
            ...commonProps,
            handler: 'get_file.handler',
        });
        bucket.grantRead(getFileFunction);
        table.grantReadData(getFileFunction);


        // API Gateway
        const httpApi = new apigw.HttpApi(this, 'TibetanToolsApi', {
            corsPreflight: {
                allowHeaders: ['Authorization', 'Content-Type'],
                allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.OPTIONS],
                allowOrigins: ['*'], // Restrict in production
            },
        });

        httpApi.addRoutes({
            path: '/save',
            methods: [apigw.HttpMethod.POST],
            integration: new HttpLambdaIntegration('SaveFileIntegration', saveFileFunction),
        });

        httpApi.addRoutes({
            path: '/list',
            methods: [apigw.HttpMethod.GET],
            integration: new HttpLambdaIntegration('ListFilesIntegration', listFilesFunction),
        });

        httpApi.addRoutes({
            path: '/get',
            methods: [apigw.HttpMethod.GET],
            integration: new HttpLambdaIntegration('GetFileIntegration', getFileFunction),
        });

        new CfnOutput(this, 'ApiUrl', {
            value: httpApi.url,
            description: 'API Gateway URL',
        });
    }
}

module.exports = { TibetanToolsStack };
