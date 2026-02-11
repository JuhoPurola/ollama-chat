import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create KMS key for DynamoDB encryption
    this.encryptionKey = new kms.Key(this, 'TableEncryptionKey', {
      description: 'KMS key for Ollama Chat DynamoDB table encryption',
      enableKeyRotation: true, // Automatic annual rotation
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep key if stack is deleted
      alias: 'ollama-chat/dynamodb',
    });

    this.table = new dynamodb.Table(this, 'OllamaChatTable', {
      tableName: 'ollama-chat',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',  // Enable TTL for automatic cleanup of rate limit records
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
    });

    // Add GSI for efficient admin queries (avoids full table scan)
    this.table.addGlobalSecondaryIndex({
      indexName: 'ConversationsIndex',
      partitionKey: {
        name: 'itemType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updatedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
      exportName: 'OllamaChatTableName',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB table ARN',
      exportName: 'OllamaChatTableArn',
    });

    new cdk.CfnOutput(this, 'EncryptionKeyId', {
      value: this.encryptionKey.keyId,
      description: 'KMS key ID for DynamoDB encryption',
      exportName: 'OllamaChatEncryptionKeyId',
    });

    new cdk.CfnOutput(this, 'EncryptionKeyArn', {
      value: this.encryptionKey.keyArn,
      description: 'KMS key ARN for DynamoDB encryption',
      exportName: 'OllamaChatEncryptionKeyArn',
    });
  }
}
