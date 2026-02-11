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

    // Get Auth0 configuration from CDK context
    const auth0Domain = this.node.tryGetContext('auth0Domain') || process.env.AUTH0_DOMAIN;
    const auth0ClientId = this.node.tryGetContext('auth0ClientId') || process.env.AUTH0_CLIENT_ID;
    const auth0Audience = this.node.tryGetContext('auth0Audience') || process.env.AUTH0_AUDIENCE;

    if (!auth0Domain || !auth0ClientId || !auth0Audience) {
      throw new Error('Missing Auth0 configuration. Set in cdk.json context or environment variables.');
    }

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

    // Build CSP with proper Auth0 support
    const lambdaUrls = Object.values(functionUrls).map(url => url.url);
    const connectSrc = [
      "'self'",
      'https://*.auth0.com',
      'https://*.lambda-url.eu-west-1.on.aws',
      ...lambdaUrls
    ].join(' ');

    // Security headers policy with CSP
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        comment: 'Security headers for Ollama Chat',
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https:; " +
              "font-src 'self' data:; " +
              `connect-src ${connectSrc}; ` +
              "frame-src 'self' https://*.auth0.com; " + // Allow Auth0 iframes
              "frame-ancestors 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'",
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.seconds(63072000), // 2 years
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: {
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
          // Note: Not setting frameOptions (X-Frame-Options) as it conflicts with CSP frame-src
          // CSP frame-src provides more granular control
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      }
    );

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
        responseHeadersPolicy: securityHeadersPolicy,
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
            domain: auth0Domain,
            clientId: auth0ClientId,
            audience: auth0Audience,
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
