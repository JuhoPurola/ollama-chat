import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

interface FrontendStackProps extends cdk.StackProps {
  functionUrls: Record<string, lambda.FunctionUrl>;
}

export class FrontendStack extends cdk.Stack {
  public readonly distributionDomain: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { functionUrls } = props;

    // Create S3 bucket for hosting
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Create Origin Access Identity for CloudFront
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OAI',
      {
        comment: 'OAI for Ollama Chat frontend',
      }
    );

    // Grant read permissions to CloudFront
    bucket.grantRead(originAccessIdentity);

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.distributionDomain = distribution.distributionDomainName;

    // Deploy config.json with API endpoints and Auth0 settings
    new s3deploy.BucketDeployment(this, 'DeployConfig', {
      sources: [
        s3deploy.Source.jsonData('config.json', {
          apiUrls: {
            chat: functionUrls.chat.url,
            conversations: functionUrls.conversations.url,
            models: functionUrls.models.url,
            instance: functionUrls.instance.url,
            costs: functionUrls.costs.url,
            admin: functionUrls.admin.url,
          },
          auth0: {
            domain: 'ollama-purolaj.eu.auth0.com',
            clientId: '4mGFHdykQXumUQLD1BFU7ZmjrYQM3Rx5',
            audience: 'ollama-chat-api',
          },
        }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/config.json'],
      prune: false,
    });

    // Deploy frontend build
    const frontendDist = path.join(__dirname, '../../frontend/dist');
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(frontendDist)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    // Output CloudFront URL
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: 'OllamaChatFrontendUrl',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket name',
    });
  }
}
