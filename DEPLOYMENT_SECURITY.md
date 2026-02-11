# Deployment Security Configuration

## Post-Deployment CORS Configuration

After your first deployment, you **MUST** update the CORS configuration to restrict access to your CloudFront domain only.

### Steps:

1. **Deploy the stacks** for the first time:
   ```bash
   cd infra
   npm run deploy
   ```

2. **Note the CloudFront URL** from the deployment output:
   ```
   OllamaChatFrontend.CloudFrontUrl = dxxxxxxxxxxxxx.cloudfront.net
   ```

3. **Add the CloudFront URL to `infra/cdk.json`**:
   ```json
   {
     "context": {
       "cloudFrontUrl": "dxxxxxxxxxxxxx.cloudfront.net",
       ...
     }
   }
   ```

4. **Redeploy to apply CORS restrictions**:
   ```bash
   npm run deploy
   ```

5. **Update Auth0 allowed callback URLs** to include your CloudFront domain:
   - Go to Auth0 Dashboard → Applications → Your App → Settings
   - Add `https://dxxxxxxxxxxxxx.cloudfront.net` to:
     - Allowed Callback URLs
     - Allowed Logout URLs
     - Allowed Web Origins

## Security Notes

- **First deployment uses wildcard CORS** (`allowedOrigins: ['*']`) because the CloudFront URL doesn't exist yet
- **After adding cloudFrontUrl to cdk.json**, CORS is restricted to your specific domain + localhost for development
- **Never commit sensitive values** like Auth0 client secrets to version control
- **Rotate credentials immediately** if they are accidentally exposed

## Current Configuration Location

All sensitive configuration is now in:
- `infra/cdk.json` (context section) - **Committed to git**
- Environment variables - **Not committed**

To use environment variables instead of cdk.json:
```bash
export AUTH0_DOMAIN=your-tenant.auth0.com
export AUTH0_CLIENT_ID=your_client_id
export AUTH0_AUDIENCE=ollama-chat-api
export INSTANCE_ID=i-xxxxxxxxxxxxx
export ADMIN_EMAILS=admin@example.com

cd infra
npm run deploy
```
