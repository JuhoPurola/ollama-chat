import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import { Construct } from 'constructs';

interface BackendStackProps extends cdk.StackProps {
  table: dynamodb.Table;
}

export class BackendStack extends cdk.Stack {
  public readonly functionUrls: Record<string, lambda.FunctionUrl>;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const { table } = props;
    const backendDist = path.join(__dirname, '../../backend/dist');

    // Common environment variables for all functions
    const commonEnv = {
      TABLE_NAME: table.tableName,
      AUTH0_DOMAIN: 'ollama-purolaj.eu.auth0.com',
      AUTH0_AUDIENCE: 'ollama-chat-api',
      INSTANCE_ID: 'i-077950cffe484e6de',
      ADMIN_EMAILS: 'juhopuro@gmail.com',
    };

    // Chat function with streaming support
    const chatFn = new lambda.Function(this, 'ChatFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'chat.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      description: 'Streaming chat function for Ollama integration',
    });

    // Grant DynamoDB permissions
    table.grantReadWriteData(chatFn);

    // Grant EC2 permissions for instance IP resolution
    chatFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:DescribeInstances'],
        resources: ['*'],
      })
    );

    // Add Function URL with streaming
    const chatUrl = chatFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.POST],
      },
    });

    // Conversations function
    const conversationsFn = new lambda.Function(this, 'ConversationsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'conversations.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      description: 'Manage chat conversations',
    });

    table.grantReadWriteData(conversationsFn);

    const conversationsUrl = conversationsFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
      },
    });

    // Models function
    const modelsFn = new lambda.Function(this, 'ModelsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'models.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.minutes(10),
      description: 'List and manage Ollama models',
    });

    table.grantReadWriteData(modelsFn);

    // Grant EC2 permissions for instance IP resolution
    modelsFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:DescribeInstances'],
        resources: ['*'],
      })
    );

    const modelsUrl = modelsFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
      },
    });

    // Instance function
    const instanceFn = new lambda.Function(this, 'InstanceFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'instance.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      description: 'Start/stop EC2 instance',
    });

    table.grantReadWriteData(instanceFn);

    // Grant EC2 permissions for instance management
    instanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:DescribeInstances',
          'ec2:StartInstances',
          'ec2:StopInstances',
        ],
        resources: ['*'],
      })
    );

    const instanceUrl = instanceFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
      },
    });

    // Costs function
    const costsFn = new lambda.Function(this, 'CostsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'costs.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      description: 'Query AWS cost data',
    });

    table.grantReadWriteData(costsFn);

    // Grant Cost Explorer permissions
    costsFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ce:GetCostAndUsage'],
        resources: ['*'],
      })
    );

    const costsUrl = costsFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
      },
    });

    // Autostop function - runs on schedule, no Function URL needed
    const autostopFn = new lambda.Function(this, 'AutostopFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'autostop.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: {
        TABLE_NAME: table.tableName,
        INSTANCE_ID: 'i-077950cffe484e6de',
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      description: 'Auto-stop EC2 instance after idle or 1h hard limit',
    });

    table.grantReadData(autostopFn);
    autostopFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:DescribeInstances', 'ec2:StopInstances'],
        resources: ['*'],
      })
    );

    // Run every 5 minutes
    new events.Rule(this, 'AutostopSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(autostopFn)],
    });

    // Admin function
    const adminFn = new lambda.Function(this, 'AdminFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'admin.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      description: 'Admin functions for cross-user moderation',
    });

    table.grantReadWriteData(adminFn);

    const adminUrl = adminFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: [
          'Authorization',
          'Content-Type',
          'Accept',
          'Origin',
          'X-Requested-With',
        ],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST, lambda.HttpMethod.DELETE],
        maxAge: cdk.Duration.seconds(300),
      },
    });

    // Store function URLs
    this.functionUrls = {
      chat: chatUrl,
      conversations: conversationsUrl,
      models: modelsUrl,
      instance: instanceUrl,
      costs: costsUrl,
      admin: adminUrl,
    };

    // Output function URLs
    new cdk.CfnOutput(this, 'ChatFunctionUrl', {
      value: chatUrl.url,
      description: 'Chat function URL (streaming)',
      exportName: 'OllamaChatChatUrl',
    });

    new cdk.CfnOutput(this, 'ConversationsFunctionUrl', {
      value: conversationsUrl.url,
      description: 'Conversations function URL',
      exportName: 'OllamaChatConversationsUrl',
    });

    new cdk.CfnOutput(this, 'ModelsFunctionUrl', {
      value: modelsUrl.url,
      description: 'Models function URL',
      exportName: 'OllamaChatModelsUrl',
    });

    new cdk.CfnOutput(this, 'InstanceFunctionUrl', {
      value: instanceUrl.url,
      description: 'Instance function URL',
      exportName: 'OllamaChatInstanceUrl',
    });

    new cdk.CfnOutput(this, 'CostsFunctionUrl', {
      value: costsUrl.url,
      description: 'Costs function URL',
      exportName: 'OllamaChatCostsUrl',
    });

    new cdk.CfnOutput(this, 'AdminFunctionUrl', {
      value: adminUrl.url,
      description: 'Admin function URL',
      exportName: 'OllamaChatAdminUrl',
    });
  }
}
