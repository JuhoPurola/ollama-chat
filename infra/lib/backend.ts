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
  allowedOrigins?: string[];
}

export class BackendStack extends cdk.Stack {
  public readonly functionUrls: Record<string, lambda.FunctionUrl>;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const { table, allowedOrigins = ['*'] } = props;
    const backendDist = path.join(__dirname, '../../backend/dist');

    // Get configuration from CDK context or environment variables
    const auth0Domain = this.node.tryGetContext('auth0Domain') || process.env.AUTH0_DOMAIN;
    const auth0Audience = this.node.tryGetContext('auth0Audience') || process.env.AUTH0_AUDIENCE;
    const instanceId = this.node.tryGetContext('instanceId') || process.env.INSTANCE_ID;
    const adminEmails = this.node.tryGetContext('adminEmails') || process.env.ADMIN_EMAILS;

    if (!auth0Domain || !auth0Audience || !instanceId || !adminEmails) {
      throw new Error('Missing required configuration. Set in cdk.json context or environment variables.');
    }

    // Common environment variables for all functions
    const commonEnv = {
      TABLE_NAME: table.tableName,
      AUTH0_DOMAIN: auth0Domain,
      AUTH0_AUDIENCE: auth0Audience,
      INSTANCE_ID: instanceId,
      ADMIN_EMAILS: adminEmails,
    };

    // Construct instance ARN for IAM policies (least privilege)
    const instanceArn = `arn:aws:ec2:${this.region}:${this.account}:instance/${instanceId}`;

    // Chat function with streaming support
    const chatFn = new lambda.Function(this, 'ChatFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'chat.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      description: 'Streaming chat function for Ollama integration',
      reservedConcurrentExecutions: 10, // Max 10 simultaneous chat sessions
    });

    // Grant DynamoDB permissions
    table.grantReadWriteData(chatFn);

    // Grant EC2 permissions for instance IP resolution
    // Note: DescribeInstances doesn't support resource-level permissions
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
        allowedOrigins: allowedOrigins,
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.POST],
        allowCredentials: true,
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
      reservedConcurrentExecutions: 20, // Lightweight operations, allow more concurrency
    });

    table.grantReadWriteData(conversationsFn);

    const conversationsUrl = conversationsFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: allowedOrigins,
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowCredentials: true,
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
      reservedConcurrentExecutions: 5, // Heavy operations, limit concurrency
    });

    table.grantReadWriteData(modelsFn);

    // Grant EC2 permissions for instance IP resolution
    // Note: DescribeInstances doesn't support resource-level permissions
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
        allowedOrigins: allowedOrigins,
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowCredentials: true,
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
      reservedConcurrentExecutions: 5, // EC2 operations, limit concurrency
    });

    table.grantReadWriteData(instanceFn);

    // Grant EC2 permissions for instance management (least privilege)
    // Note: DescribeInstances doesn't support resource-level permissions
    instanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:DescribeInstances'],
        resources: ['*'],
      })
    );
    instanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:StartInstances', 'ec2:StopInstances'],
        resources: [instanceArn],
      })
    );

    const instanceUrl = instanceFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: allowedOrigins,
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowCredentials: true,
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
      reservedConcurrentExecutions: 10, // Lightweight queries, allow reasonable concurrency
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
        allowedOrigins: allowedOrigins,
        allowedHeaders: ['Authorization', 'Content-Type'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowCredentials: true,
      },
    });

    // Autostop function - runs on schedule, no Function URL needed
    const autostopFn = new lambda.Function(this, 'AutostopFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'autostop.handler',
      code: lambda.Code.fromAsset(backendDist),
      environment: {
        TABLE_NAME: table.tableName,
        INSTANCE_ID: instanceId,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      description: 'Auto-stop EC2 instance after idle or 1h hard limit',
      reservedConcurrentExecutions: 1, // Scheduled function, only needs 1
    });

    table.grantReadData(autostopFn);
    // Note: DescribeInstances doesn't support resource-level permissions
    autostopFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:DescribeInstances'],
        resources: ['*'],
      })
    );
    autostopFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:StopInstances'],
        resources: [instanceArn],
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
      reservedConcurrentExecutions: 5, // Admin operations are infrequent
    });

    table.grantReadWriteData(adminFn);

    const adminUrl = adminFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: allowedOrigins,
        allowedHeaders: [
          'Authorization',
          'Content-Type',
          'Accept',
          'Origin',
          'X-Requested-With',
        ],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST, lambda.HttpMethod.DELETE],
        allowCredentials: true,
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
