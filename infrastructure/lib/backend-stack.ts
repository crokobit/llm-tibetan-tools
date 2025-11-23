import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

interface BackendStackProps extends cdk.StackProps {
    websiteBucket: s3.Bucket;
}

export class BackendStack extends cdk.Stack {
    public readonly apiUrl: string;

    constructor(scope: Construct, id: string, props: BackendStackProps) {
        super(scope, id, props);

        // 1. DynamoDB Table
        const table = new dynamodb.Table(this, 'TibetanAnalysisTable', {
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo
        });

        // 2. Lambda: Analyze (calls Gemini API)
        const analyzeLambda = new lambda.Function(this, 'AnalyzeFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/analyze')),
            timeout: cdk.Duration.seconds(30),
            environment: {
                TABLE_NAME: table.tableName,
                GEMINI_API_KEY: process.env.GEMINI_API_KEY || '', // Pass from build environment
            },
        });

        // 3. Lambda: Save (writes to DynamoDB)
        const saveLambda = new lambda.Function(this, 'SaveFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/save')),
            environment: {
                TABLE_NAME: table.tableName,
            },
        });

        table.grantWriteData(saveLambda);

        // 4. API Gateway
        const api = new apigateway.RestApi(this, 'TibetanToolsApi', {
            restApiName: 'Tibetan Tools Service',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
            },
        });

        const analyzeIntegration = new apigateway.LambdaIntegration(analyzeLambda);
        const saveIntegration = new apigateway.LambdaIntegration(saveLambda);

        const analyzeResource = api.root.addResource('analyze');
        analyzeResource.addMethod('POST', analyzeIntegration);

        const saveResource = api.root.addResource('save');
        saveResource.addMethod('POST', saveIntegration);

        this.apiUrl = api.url;

        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
        });
    }
}
