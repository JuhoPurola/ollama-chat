import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME!;

export interface RateLimitConfig {
  maxRequests: number;  // Maximum requests allowed
  windowSeconds: number;  // Time window in seconds
}

// Rate limit configurations per endpoint
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 20, windowSeconds: 60 },  // 20 chat requests per minute
  conversations: { maxRequests: 60, windowSeconds: 60 },  // 60 requests per minute
  models: { maxRequests: 10, windowSeconds: 60 },  // 10 model operations per minute
  instance: { maxRequests: 10, windowSeconds: 60 },  // 10 instance operations per minute
  costs: { maxRequests: 20, windowSeconds: 60 },  // 20 cost queries per minute
  admin: { maxRequests: 30, windowSeconds: 60 },  // 30 admin operations per minute
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;  // Unix timestamp when limit resets
  limit: number;
}

/**
 * Check if a user has exceeded their rate limit for an endpoint
 * Uses DynamoDB atomic counters with TTL for automatic cleanup
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[endpoint] || { maxRequests: 30, windowSeconds: 60 };

  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const resetAt = windowStart + config.windowSeconds;

  // Create a key that includes the time window
  const key = `RATELIMIT#${userId}#${endpoint}#${windowStart}`;

  try {
    // Atomically increment the counter
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: 'SYSTEM',
          SK: key,
        },
        UpdateExpression: 'ADD requestCount :inc SET #ttl = :ttl',
        ExpressionAttributeNames: {
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':ttl': resetAt + 60,  // Keep for 1 minute after window expires
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    const requestCount = result.Attributes?.requestCount || 0;
    const allowed = requestCount <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - requestCount);

    return {
      allowed,
      remaining,
      resetAt,
      limit: config.maxRequests,
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if rate limiting is broken
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt,
      limit: config.maxRequests,
    };
  }
}

/**
 * Create a rate limit exceeded error response
 */
export function createRateLimitResponse(result: RateLimitResult) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetAt.toString(),
      'Retry-After': Math.max(1, result.resetAt - Math.floor(Date.now() / 1000)).toString(),
    },
    body: JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Too many requests. Please try again in ${Math.max(1, result.resetAt - Math.floor(Date.now() / 1000))} seconds.`,
      limit: result.limit,
      resetAt: result.resetAt,
    }),
  };
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  userId: string,
  endpoint: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[endpoint] || { maxRequests: 30, windowSeconds: 60 };

  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const resetAt = windowStart + config.windowSeconds;
  const key = `RATELIMIT#${userId}#${endpoint}#${windowStart}`;

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: 'SYSTEM',
          SK: key,
        },
      })
    );

    const requestCount = result.Item?.requestCount || 0;
    const allowed = requestCount < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - requestCount);

    return {
      allowed,
      remaining,
      resetAt,
      limit: config.maxRequests,
    };
  } catch (error) {
    console.error('Get rate limit status failed:', error);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt,
      limit: config.maxRequests,
    };
  }
}
