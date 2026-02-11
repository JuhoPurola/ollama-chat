# Rate Limiting Implementation

## Overview

The application now includes comprehensive rate limiting to prevent abuse and control AWS costs. Rate limiting is enforced per user per endpoint using DynamoDB as the storage backend.

## How It Works

### Architecture

```
User Request → Lambda Function → Rate Limit Check → Business Logic
                                        ↓
                                   DynamoDB
                              (Atomic Counters)
```

1. **User makes request** to any Lambda function
2. **Authentication** verifies JWT and extracts user ID
3. **Rate limit check** increments atomic counter in DynamoDB
4. **Counter compared** to configured limit for that endpoint
5. **Request allowed** or **429 response** returned

### DynamoDB Storage

Rate limit records are stored with this structure:

```
PK: SYSTEM
SK: RATELIMIT#{userId}#{endpoint}#{windowStart}
requestCount: <number>
ttl: <unix timestamp>
```

**Example:**
```json
{
  "PK": "SYSTEM",
  "SK": "RATELIMIT#auth0|123456#chat#1707667200",
  "requestCount": 15,
  "ttl": 1707667320
}
```

### Time Windows

Rate limits use **sliding window** approach:
- Window size: 60 seconds (1 minute)
- Window resets every minute on the clock (e.g., 10:00:00, 10:01:00, 10:02:00)
- Old records automatically deleted via DynamoDB TTL

### Atomic Counters

DynamoDB `UpdateCommand` with `ADD` operation ensures atomic increments:
- No race conditions
- Thread-safe
- Handles concurrent requests correctly

## Rate Limit Configuration

### Current Limits

| Endpoint | Limit | Window | Use Case |
|----------|-------|--------|----------|
| `chat` | 20 requests | 60 seconds | Prevent chat spam |
| `conversations` | 60 requests | 60 seconds | Allow frequent conversation management |
| `models` | 10 requests | 60 seconds | Model operations are expensive |
| `instance` | 10 requests | 60 seconds | EC2 operations are costly |
| `costs` | 20 requests | 60 seconds | Cost queries are inexpensive |
| `admin` | 30 requests | 60 seconds | Admin operations |

### Adjusting Limits

Edit `backend/src/lib/rateLimit.ts`:

```typescript
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 20, windowSeconds: 60 },
  conversations: { maxRequests: 60, windowSeconds: 60 },
  // Add more or modify existing limits
};
```

### Per-Endpoint Configuration

Different limits for different endpoints:

```typescript
// Strict limit for expensive operations
models: { maxRequests: 10, windowSeconds: 60 }

// Generous limit for cheap operations
conversations: { maxRequests: 60, windowSeconds: 60 }
```

## API Response

### Success Response (Request Allowed)

Normal endpoint response with headers:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1707667260
```

**Headers:**
- `X-RateLimit-Limit`: Total requests allowed in window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### Rate Limit Exceeded (429)

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 45 seconds.",
  "limit": 20,
  "resetAt": 1707667260
}
```

**HTTP Headers:**
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1707667260
Retry-After: 45
```

## Implementation Details

### Rate Limit Check Function

```typescript
export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<RateLimitResult> {
  // 1. Get configuration for endpoint
  const config = RATE_LIMITS[endpoint];

  // 2. Calculate current time window
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;

  // 3. Atomically increment counter in DynamoDB
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'SYSTEM', SK: `RATELIMIT#${userId}#${endpoint}#${windowStart}` },
      UpdateExpression: 'ADD requestCount :inc SET #ttl = :ttl',
      ExpressionAttributeValues: { ':inc': 1, ':ttl': resetAt + 60 },
      ReturnValues: 'ALL_NEW',
    })
  );

  // 4. Check if limit exceeded
  const requestCount = result.Attributes?.requestCount || 0;
  const allowed = requestCount <= config.maxRequests;

  return { allowed, remaining, resetAt, limit };
}
```

### Lambda Integration Example

```typescript
export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    // 1. Authenticate
    const user = await getAuthUser(event);

    // 2. Check rate limit
    const rateLimit = await checkRateLimit(user.sub, 'chat');
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit);
    }

    // 3. Process request
    // ... business logic ...
  } catch (error) {
    // ... error handling ...
  }
};
```

## Cost Impact

### DynamoDB Costs

**Write Operations:**
- Each request = 1 DynamoDB write (UpdateCommand)
- Cost: $1.25 per million writes

**Example:**
- 10,000 API requests/month = 10,000 writes
- Cost: $0.0125 per month (negligible)

**Read Operations:**
- Rate limit check reads and writes in single operation (UpdateCommand with ReturnValues)
- No separate read cost

**Storage:**
- Rate limit records: ~100 bytes each
- Auto-deleted after 60 seconds via TTL
- Maximum ~100 active records at any time
- Storage cost: <$0.01 per month

**Total Rate Limiting Cost: <$0.02/month**

### Benefits

**Cost Savings:**
- Prevents unlimited Lambda invocations
- Protects against accidental infinite loops in frontend
- Blocks malicious attacks
- **Potential savings: Unlimited** (prevents runaway costs)

**Example Scenario:**
- Bug in frontend causes infinite request loop
- Without rate limiting: 1,000,000 Lambda invocations = $200
- With rate limiting: Max 20 requests/minute = Capped at $0.40

**ROI: 500x cost savings in attack scenarios**

## Fail-Safe Behavior

Rate limiting is designed to **fail open**:

```typescript
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
```

**Why fail open?**
- If DynamoDB is down, users can still use the app
- Availability > perfect rate limiting
- Rate limiting is defense-in-depth, not primary security

## Monitoring

### CloudWatch Metrics to Track

1. **Rate Limit Hits (429 Responses)**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=OllamaChatBackend-ChatFunction \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

2. **DynamoDB Throttles**
- Monitor `UserErrors` metric for DynamoDB
- Indicates rate limiting itself is being throttled (very unlikely)

3. **Lambda Invocation Count**
- Track total invocations per function
- Compare before/after rate limiting implementation

## Testing Rate Limits

### Manual Test

```bash
# Test chat endpoint rate limit (20 requests/minute)
for i in {1..25}; do
  curl -X POST https://your-chat-url \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"test"}]}'
  echo "Request $i"
done

# Expected: First 20 succeed, next 5 return 429
```

### Load Test Script

```bash
#!/bin/bash
TOKEN="your-jwt-token"
ENDPOINT="https://your-api-url"

echo "Testing rate limit..."
success=0
rate_limited=0

for i in {1..30}; do
  response=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"test"}]}')

  http_code=$(echo "$response" | tail -n1)

  if [ "$http_code" = "200" ]; then
    ((success++))
  elif [ "$http_code" = "429" ]; then
    ((rate_limited++))
  fi
done

echo "Success: $success"
echo "Rate Limited: $rate_limited"
```

## Security Considerations

### Bypassing Rate Limits

**Potential Attack Vectors:**
1. ✅ **Multiple user accounts** - Each user has separate limit (intended behavior)
2. ✅ **Token theft** - Stolen token still rate limited (defense-in-depth)
3. ✅ **Unauthenticated requests** - Blocked by JWT verification before rate limit check
4. ❌ **Distributed attack** - Multiple users attacking together (requires IP-based rate limiting)

### Additional Protection Layers

1. **AWS WAF** (not implemented)
   - IP-based rate limiting
   - Blocks distributed attacks
   - Cost: ~$5/month + $1 per million requests

2. **API Gateway** (not implemented)
   - Built-in throttling
   - Usage plans per API key
   - Cost: $1 per million requests

3. **CloudFront** (already implemented)
   - DDoS protection via AWS Shield Standard (free)
   - Geographic restrictions possible

## Future Enhancements

### 1. IP-Based Rate Limiting
```typescript
// Extract IP from Lambda event
const ip = event.requestContext.http.sourceIp;
await checkRateLimit(ip, 'global');
```

### 2. Tiered Limits by User Role
```typescript
const limits = user.isPremium
  ? { maxRequests: 100, windowSeconds: 60 }
  : { maxRequests: 20, windowSeconds: 60 };
```

### 3. Exponential Backoff
```typescript
// Increase penalty for repeat offenders
const penaltyMultiplier = await getPenaltyMultiplier(userId);
const effectiveLimit = baseLimit / penaltyMultiplier;
```

### 4. Rate Limit Dashboard
- Visualize per-user request rates
- Identify potential abuse
- Adjust limits dynamically

## Compliance

### GDPR
- Rate limit records contain user IDs (pseudonymous identifiers)
- Auto-deleted after 60 seconds (data minimization)
- No PII stored in rate limit records

### SOC 2
- Provides audit trail of request rates
- Demonstrates resource protection controls
- Prevents service disruption

## Summary

✅ **Implemented:** Per-user, per-endpoint rate limiting
✅ **Storage:** DynamoDB with atomic counters and TTL
✅ **Cost:** <$0.02/month for rate limiting infrastructure
✅ **Savings:** Prevents unlimited cost escalation
✅ **Coverage:** All 6 Lambda functions protected
✅ **Monitoring:** CloudWatch metrics available
✅ **Fail-Safe:** Fails open if DynamoDB unavailable

**Next Steps:**
1. Deploy and test rate limits
2. Monitor CloudWatch for 429 responses
3. Adjust limits based on actual usage patterns
4. Consider adding IP-based rate limiting for DDoS protection
