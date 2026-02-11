# Ollama Chat

A full-stack serverless chat application that integrates with Ollama running on an AWS EC2 instance. Features real-time streaming responses, conversation management, and automatic instance lifecycle management to minimize costs.

## Features

- **Real-time Chat Streaming**: Stream responses from Ollama models with WebSocket-like experience
- **Conversation Management**: Create, view, and delete chat conversations
- **Model Management**: Pull, list, and delete Ollama models
- **Instance Management**: Automatic start/stop of EC2 instance with idle detection
- **Admin Moderation**: Cross-user conversation viewing and moderation for designated admins
- **Cost Tracking**: Real-time AWS cost monitoring via Cost Explorer API
- **Authentication**: Secure Auth0 integration with JWT verification

## Architecture

### Frontend
- **Stack**: React + TypeScript + Vite + TailwindCSS
- **Hosting**: CloudFront + S3 (serverless, global CDN)
- **Authentication**: Auth0 React SDK

### Backend
- **Runtime**: AWS Lambda (Node.js 20.x) with Function URLs
- **Functions**:
  - `chat` - Streaming chat handler (5 min timeout)
  - `conversations` - CRUD operations for conversations
  - `models` - Ollama model management (10 min timeout)
  - `instance` - EC2 start/stop control
  - `costs` - AWS cost data retrieval
  - `autostop` - Scheduled function (every 5 min) for auto-stop
  - `admin` - Cross-user moderation endpoints

### Database
- **DynamoDB**: Single-table design with on-demand pricing
- **Schema**:
  - `PK=USER#{userId}`, `SK=CONV#{conversationId}` - Conversations
  - `PK=USER#{userId}`, `SK=CONV#{conversationId}#MSG#{timestamp}` - Messages
  - `PK=SYSTEM`, `SK=HEARTBEAT` - System heartbeat for idle detection

### Compute
- **EC2 Instance**: g4dn.xlarge with NVIDIA T4 GPU
- **Ollama**: Runs on port 11434, accessed by Lambda functions

## Cost Analysis

### Monthly Cost Breakdown

#### Minimal Usage (Recommended Starting Point)
| Service | Configuration | Monthly Cost | Notes |
|---------|--------------|--------------|-------|
| EC2 g4dn.xlarge | 10 hours/month | ~$15.24 | $0.526/hour in eu-west-1 |
| EBS gp3 | 20 GB | $1.60 | $0.08/GB-month |
| Data Transfer | 10 GB out | $0.90 | $0.09/GB (first 1TB tier) |
| DynamoDB | On-demand, ~1000 conversations | $0.02-0.05 | $1.25/million writes, $0.25/million reads |
| Lambda | ~10,000 invocations | $0.20 | First 1M requests free monthly |
| CloudFront | 10 GB transfer | $0.85 | $0.085/GB (first 10TB tier) |
| S3 | Storage + requests | $0.10 | Minimal for static hosting |
| **Total (Minimal)** | | **~$18-19/month** | Based on 10 hours GPU usage |

#### Moderate Usage
| Service | Configuration | Monthly Cost | Notes |
|---------|--------------|--------------|-------|
| EC2 g4dn.xlarge | 40 hours/month | ~$60.96 | $0.526/hour |
| EBS gp3 | 30 GB | $2.40 | For multiple 7B models |
| Data Transfer | 30 GB out | $2.70 | |
| DynamoDB | ~5000 conversations | $0.10 | Still very cheap with on-demand |
| Lambda | ~50,000 invocations | $0.80 | |
| CloudFront | 30 GB transfer | $2.55 | |
| S3 | Storage + requests | $0.15 | |
| **Total (Moderate)** | | **~$70/month** | Based on 40 hours GPU usage |

#### Heavy Usage
| Service | Configuration | Monthly Cost | Notes |
|---------|--------------|--------------|-------|
| EC2 g4dn.xlarge | 160 hours/month | ~$243.84 | $0.526/hour |
| EBS gp3 | 50 GB | $4.00 | For multiple larger models |
| Data Transfer | 100 GB out | $9.00 | |
| DynamoDB | ~20,000 conversations | $0.40 | |
| Lambda | ~200,000 invocations | $3.20 | |
| CloudFront | 100 GB transfer | $8.50 | |
| S3 | Storage + requests | $0.25 | |
| **Total (Heavy)** | | **~$269/month** | Based on 160 hours GPU usage |

### Cost Optimization Strategies

#### 1. EC2 Instance Type Selection

| Instance Type | vCPU | GPU | RAM | GPU Memory | Cost/hour (eu-west-1) | Best For |
|---------------|------|-----|-----|------------|---------------------|----------|
| **g4dn.xlarge** | 4 | 1x T4 | 16 GB | 16 GB | $0.526 | 7B models, cost-effective |
| g4dn.2xlarge | 8 | 1x T4 | 32 GB | 16 GB | $0.752 | 13B models, better CPU |
| g5.xlarge | 4 | 1x A10G | 16 GB | 24 GB | $1.006 | 13B-30B models, faster |
| g5.2xlarge | 8 | 1x A10G | 32 GB | 24 GB | $1.212 | 30B+ models |

**Recommendation**: Start with **g4dn.xlarge** for 7B models (Qwen, Llama, Mistral). Upgrade only if you need larger models or faster inference.

#### 2. EBS Volume Optimization

| Model Size | Required Space | Recommended Volume | Monthly Cost |
|------------|----------------|-------------------|--------------|
| Single 7B model | 4-5 GB | 20 GB gp3 | $1.60 |
| 2-3 x 7B models | 10-15 GB | 30 GB gp3 | $2.40 |
| Mix of 7B and 13B | 20-25 GB | 40 GB gp3 | $3.20 |
| Multiple 13B models | 35-45 GB | 50 GB gp3 | $4.00 |

**Recommendation**: Use **20 GB gp3** for 1-2 models. You can always expand later without downtime using AWS Console.

#### 3. Instance Usage Patterns

| Usage Pattern | Monthly Hours | Monthly EC2 Cost | Best Practice |
|---------------|---------------|------------------|---------------|
| **Occasional** | 10-20 hours | $5-10 | Auto-stop after 10 min idle |
| **Regular** | 40-80 hours | $21-42 | Auto-stop after 15 min idle |
| **Frequent** | 160+ hours | $84+ | Auto-stop after 30 min idle |
| **Always-on** | 730 hours | $384 | Consider Reserved Instance (save 40-60%) |

**Recommendation**: Configure auto-stop based on your usage. The current setup stops after **10 minutes idle** or **1 hour maximum**.

#### 4. Alternative Architectures (Cost Comparison)

| Architecture | Monthly Cost | Pros | Cons |
|--------------|--------------|------|------|
| **Current (GPU on-demand)** | $18-70 | No commitment, auto-scaling | Pay per hour |
| GPU Reserved Instance | $140-180 | 40-60% savings for 24/7 | Requires 1-year commitment |
| AWS SageMaker | $60-200+ | Managed, auto-scaling | More complex setup, higher base cost |
| External API (OpenAI) | $20-200+ | Zero infrastructure | No model privacy, ongoing API costs |
| Local Ollama | $0 | Free compute | Requires always-on computer, no remote access |

**Recommendation**: Current architecture is optimal for personal/small team use with sporadic usage patterns.

## Prerequisites

### Required Accounts and Tools
1. **AWS Account** with admin access
2. **Auth0 Account** (free tier is sufficient)
3. **Node.js** 20.x or later
4. **AWS CLI** configured with credentials
5. **Git** for cloning the repository

### AWS Permissions Required
The deployment user needs permissions for:
- CloudFormation (full access)
- IAM (create roles and policies)
- Lambda (create functions, function URLs)
- DynamoDB (create tables)
- S3 (create buckets, upload files)
- CloudFront (create distributions)
- EC2 (describe instances, create security groups)
- Systems Manager (send commands)
- Cost Explorer (read access)

## Deployment Instructions

### Step 1: Clone and Install Dependencies

```bash
git clone <your-repository-url>
cd ollama-chat
npm install
```

This will install dependencies for all three workspaces (frontend, backend, infra).

### Step 2: Set Up Auth0

1. Create an Auth0 account at https://auth0.com
2. Create a new **Single Page Application**
3. Note down:
   - **Domain**: `your-tenant.us.auth0.com` or `your-tenant.eu.auth0.com`
   - **Client ID**: From application settings
4. Create a new **API** in Auth0:
   - **Name**: `Ollama Chat API`
   - **Identifier**: `ollama-chat-api`
5. Configure allowed callback URLs in Auth0 application:
   - Add your CloudFront URL (you'll update this after first deployment)
   - For testing, add `http://localhost:5173`

### Step 3: Launch EC2 Instance

#### Option A: Manual Setup (Recommended for First Time)

1. **Launch EC2 Instance**:
   ```bash
   # From AWS Console or CLI
   aws ec2 run-instances \
     --image-id ami-0d64bb532e0502c46 \
     --instance-type g4dn.xlarge \
     --region eu-west-1 \
     --key-name your-key-pair \
     --security-group-ids sg-xxxxx \
     --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
     --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ollama-chat}]'
   ```

2. **Create Security Group** with these inbound rules:
   - Port 22 (SSH): Your IP or 0.0.0.0/0
   - Port 11434 (Ollama): 0.0.0.0/0 (needed for Lambda access)
   - Port 3000 (Optional, for Open WebUI): Your IP

3. **Connect via SSH or AWS Systems Manager**:
   ```bash
   ssh -i your-key.pem ubuntu@<instance-public-ip>
   # OR
   aws ssm start-session --target i-xxxxxxxxxxxxx --region eu-west-1
   ```

4. **Install Ollama**:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

5. **Configure Ollama to listen on all interfaces**:
   ```bash
   sudo mkdir -p /etc/systemd/system/ollama.service.d
   sudo bash -c 'cat > /etc/systemd/system/ollama.service.d/override.conf << EOF
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF'
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

6. **Verify Ollama is running**:
   ```bash
   sudo systemctl status ollama
   ss -tulpn | grep 11434  # Should show *:11434
   ```

7. **Pull your first model**:
   ```bash
   ollama pull qwen2.5:7b
   # Or for a smaller model: ollama pull qwen2.5:3b
   ```

8. **Note the Instance ID**:
   ```bash
   aws ec2 describe-instances --filters "Name=tag:Name,Values=ollama-chat" --query 'Reservations[0].Instances[0].InstanceId' --output text
   # Example output: i-077950cffe484e6de
   ```

#### Option B: Automated Setup with User Data

Use this user data script when launching the instance:

```bash
#!/bin/bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama to listen on all interfaces
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf << EOF
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

systemctl daemon-reload
systemctl restart ollama

# Pull default model
ollama pull qwen2.5:7b
```

### Step 4: Configure Infrastructure

Edit `infra/lib/backend.ts`:

1. **Update Instance ID** (line 28):
   ```typescript
   INSTANCE_ID: 'i-077950cffe484e6de',  // Replace with your instance ID
   ```

2. **Update Admin Email** (line 29):
   ```typescript
   ADMIN_EMAILS: 'your-email@example.com',  // Your admin email
   ```

3. **Update Auth0 Domain** (line 26):
   ```typescript
   AUTH0_DOMAIN: 'your-tenant.us.auth0.com',  // Your Auth0 domain
   ```

### Step 5: Build Backend

```bash
cd backend
npm run build
```

This compiles TypeScript and bundles Lambda functions with esbuild.

### Step 6: Deploy Infrastructure

```bash
cd ../infra
npm run deploy
```

This deploys three CloudFormation stacks:
1. `OllamaChatDatabase` - DynamoDB table
2. `OllamaChatBackend` - Lambda functions with Function URLs
3. `OllamaChatFrontend` - S3 + CloudFront

**Note the outputs**:
- `OllamaChatFrontend.CloudFrontUrl` - Your app URL
- `OllamaChatFrontend.BucketName` - S3 bucket name
- Lambda Function URLs are automatically injected into frontend config

Deployment takes 5-10 minutes (mostly CloudFront distribution creation).

### Step 7: Update Auth0 Callback URLs

1. Go to your Auth0 Application settings
2. Add to **Allowed Callback URLs**:
   ```
   https://<your-cloudfront-domain>
   ```
3. Add to **Allowed Logout URLs**:
   ```
   https://<your-cloudfront-domain>
   ```
4. Add to **Allowed Web Origins**:
   ```
   https://<your-cloudfront-domain>
   ```
5. Click **Save Changes**

### Step 8: Build and Deploy Frontend

```bash
cd ../frontend
npm run build
cd ../infra
npm run deploy  # Redeploy to sync frontend assets
```

### Step 9: Test the Application

1. Open the CloudFront URL in your browser
2. Click "Sign In" - you'll be redirected to Auth0
3. Create an account or log in
4. The EC2 instance should auto-start when you send your first message
5. Try chatting with the model!

## Configuration

### Environment Variables (Backend)

All Lambda functions share these environment variables (configured in `infra/lib/backend.ts`):

- `TABLE_NAME` - DynamoDB table name (auto-generated)
- `AUTH0_DOMAIN` - Your Auth0 domain
- `AUTH0_AUDIENCE` - API identifier (must be `ollama-chat-api`)
- `INSTANCE_ID` - EC2 instance ID
- `ADMIN_EMAILS` - Comma-separated list of admin emails

### Auto-stop Configuration

The autostop Lambda runs every 5 minutes and stops the instance if:
- **Idle time** > 10 minutes (no new messages in DynamoDB heartbeat)
- **OR Hard limit** > 1 hour (instance running time)

To modify, edit `backend/src/functions/autostop.ts`:

```typescript
const IDLE_MINUTES = 10;  // Change idle threshold
const HARD_LIMIT_MINUTES = 60;  // Change hard limit
```

To change schedule frequency, edit `infra/lib/backend.ts` (line 210):

```typescript
schedule: events.Schedule.rate(cdk.Duration.minutes(5)),  // Change to 10, 15, etc.
```

### Model Selection

Default models are configured in `frontend/src/contexts/ModelContext.tsx`. To add/remove models:

1. Pull model on EC2 instance:
   ```bash
   ollama pull model-name:tag
   ```

2. Model will appear automatically in the frontend model list (fetched from Ollama API)

Recommended models for g4dn.xlarge (7B models fit easily):
- `qwen2.5:7b` - General purpose, multilingual
- `llama3.1:7b` - Strong reasoning
- `mistral:7b` - Fast, efficient
- `dolphin-mistral:7b-v2.8` - Uncensored, creative

For 13B models, consider upgrading to g4dn.2xlarge or g5.xlarge.

## Maintenance

### Monitoring Costs

1. **Via Application Dashboard**:
   - Navigate to `/dashboard` in the app
   - View real-time cost estimates from Cost Explorer

2. **Via AWS Console**:
   - Cost Explorer: https://console.aws.amazon.com/cost-management/home
   - Set up Budget Alerts for cost thresholds

### Updating the Application

#### Backend Updates
```bash
cd backend
npm run build
cd ../infra
npm run deploy
```

#### Frontend Updates
```bash
cd frontend
npm run build
cd ../infra
npm run deploy
```

#### Infrastructure Changes
```bash
cd infra
npm run build
npm run deploy
```

### Expanding EBS Volume (No Downtime)

If you need more space for models:

```bash
# 1. Modify volume size (example: 20GB -> 40GB)
aws ec2 modify-volume --volume-id vol-xxxxx --size 40 --region eu-west-1

# 2. Wait for modification to complete
aws ec2 describe-volumes-modifications --volume-id vol-xxxxx

# 3. SSH into instance and expand filesystem
sudo growpart /dev/nvme0n1 1
sudo resize2fs /dev/nvme0n1p1
```

### Managing Models

**List models**:
```bash
ssh ubuntu@<instance-ip> "ollama list"
```

**Pull new model**:
```bash
ssh ubuntu@<instance-ip> "ollama pull model-name:tag"
# Or use the Models page in the web UI
```

**Delete model**:
```bash
ssh ubuntu@<instance-ip> "ollama rm model-name:tag"
# Or use the Models page in the web UI
```

### Backup Strategy

**DynamoDB** (automatic):
- Point-in-time recovery (PITR) can be enabled in AWS Console
- On-demand backups available
- Tables have `RETAIN` removal policy (won't be deleted with stack)

**EC2 Instance**:
- Create AMI snapshot periodically:
  ```bash
  aws ec2 create-image --instance-id i-xxxxx --name "ollama-chat-backup-$(date +%Y%m%d)" --region eu-west-1
  ```
- Or enable EBS automatic snapshots via Data Lifecycle Manager

## Troubleshooting

### Lambda Can't Connect to Ollama

**Symptoms**: "ECONNREFUSED" errors in Lambda logs

**Solution**:
1. Verify Ollama is listening on all interfaces:
   ```bash
   ssh ubuntu@<instance-ip> "ss -tulpn | grep 11434"
   # Should show *:11434, not 127.0.0.1:11434
   ```

2. If showing 127.0.0.1, reconfigure:
   ```bash
   sudo mkdir -p /etc/systemd/system/ollama.service.d
   sudo bash -c 'printf "[Service]\nEnvironment=\"OLLAMA_HOST=0.0.0.0:11434\"\n" > /etc/systemd/system/ollama.service.d/override.conf'
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

3. Check security group allows port 11434 from 0.0.0.0/0

### Instance Won't Auto-Start

**Symptoms**: Chat fails with "Instance is stopped"

**Possible causes**:
1. Lambda doesn't have EC2 start permissions (check IAM role)
2. Wrong instance ID in configuration
3. Instance in different region than Lambda

**Solution**:
```bash
# Verify instance ID
aws ec2 describe-instances --instance-ids i-xxxxx --region eu-west-1

# Check Lambda logs
aws logs tail /aws/lambda/OllamaChatBackend-InstanceFunction --follow
```

### Auth0 Email Not Available

**Symptoms**: Admin panel shows "Access Denied" even for admin email

**Solution**:
1. Verify email scope in `frontend/src/main.tsx`:
   ```typescript
   scope: 'openid profile email',
   ```

2. Check Auth0 API settings allow email claim

3. Backend fetches email from userinfo endpoint as fallback (already implemented)

### CORS Errors

**Symptoms**: "CORS policy" errors in browser console

**Solution**:
1. Verify CloudFront URL is added to Auth0 allowed origins
2. Check Lambda Function URL CORS configuration in `infra/lib/backend.ts`
3. For admin endpoints, we use POST instead of GET for preflight compatibility

### High DynamoDB Costs

**Symptoms**: Unexpected DynamoDB charges

**Solution**:
1. Check for scan operations in CloudWatch Logs
2. Consider switching from on-demand to provisioned capacity if traffic is consistent
3. Enable DynamoDB table class to Standard-IA for older data

### CloudFront Caching Issues

**Symptoms**: Frontend changes not visible after deployment

**Solution**:
```bash
# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id EXXXXXXXXXXXXX \
  --paths "/*"
```

## Security Considerations

1. **API Authentication**: All Lambda Function URLs verify JWT tokens from Auth0
2. **Admin Access**: Only emails in `ADMIN_EMAILS` can access admin endpoints
3. **EC2 Security Group**: Limit SSH (port 22) to your IP in production
4. **Environment Variables**: Sensitive config in Lambda environment (not in code)
5. **HTTPS**: CloudFront enforces HTTPS for all requests
6. **DynamoDB**: Each user can only access their own conversations (partition key enforcement)

## Uninstalling

To completely remove the application:

```bash
# 1. Delete CloudFormation stacks
cd infra
npm run cdk destroy OllamaChatFrontend
npm run cdk destroy OllamaChatBackend
npm run cdk destroy OllamaChatDatabase  # Table has RETAIN policy

# 2. Manually delete DynamoDB table if needed
aws dynamodb delete-table --table-name ollama-chat --region eu-west-1

# 3. Terminate EC2 instance
aws ec2 terminate-instances --instance-ids i-xxxxx --region eu-west-1

# 4. Delete any EBS snapshots/AMIs created
```

## Development

### Local Frontend Development

```bash
cd frontend
npm run dev  # Starts Vite dev server on http://localhost:5173
```

**Note**: You'll need to update Auth0 callback URLs to include `http://localhost:5173`

### Local Backend Development

Lambda functions can't run locally easily, but you can:
1. Test business logic in unit tests
2. Deploy to AWS for testing (fast with `npm run deploy`)
3. Use AWS SAM for local Lambda emulation (not included in this setup)

### Testing

```bash
# Type checking (all packages)
npm run typecheck

# Frontend dev server
cd frontend && npm run dev

# Backend build
cd backend && npm run build
```

## Architecture Decisions

### Why Lambda + EC2 Hybrid?

- **Lambda**: Serverless, auto-scaling, pay-per-request for API layer
- **EC2 GPU**: Required for Ollama model inference (Lambda doesn't support GPUs)
- **Auto-start/stop**: Combines benefits of both - Lambda always available, GPU only when needed

### Why DynamoDB Single-Table?

- Cost-effective for sporadic usage (on-demand pricing)
- Fast reads/writes for chat messages
- No server management
- Single table reduces costs vs multiple tables

### Why CloudFront + S3?

- Global CDN for fast frontend loading
- HTTPS included
- Extremely cheap for static hosting ($1-2/month)
- No server management

### Why Auth0?

- Free tier sufficient for personal/small team use
- Industry-standard JWT authentication
- Easy to integrate
- Handles user management, password resets, MFA

## Recommended Model Collections

### For 20GB Volume (g4dn.xlarge)
- `qwen2.5:7b` (4.7 GB)
- `dolphin-mistral:7b-v2.8` (4.1 GB)
- Total: ~9 GB + OS (~5 GB) = 14 GB used

### For 30GB Volume (g4dn.xlarge)
- `qwen2.5:7b` (4.7 GB)
- `llama3.1:7b` (4.7 GB)
- `mistral:7b` (4.1 GB)
- Total: ~13.5 GB + OS = 18.5 GB used

### For 40GB Volume (g4dn.2xlarge)
- `qwen2.5:14b` (9 GB)
- `llama3.1:13b` (7.4 GB)
- `mistral:7b` (4.1 GB)
- Total: ~20.5 GB + OS = 25.5 GB used

## Support and Contributing

- **Issues**: Report bugs or request features via GitHub Issues
- **Questions**: Check existing issues or create a new one
- **Contributions**: Pull requests welcome!

## License

[Add your license here]

## Acknowledgments

- [Ollama](https://ollama.ai) - Local LLM inference
- [Auth0](https://auth0.com) - Authentication
- [AWS CDK](https://aws.amazon.com/cdk/) - Infrastructure as code
- [React](https://react.dev) - Frontend framework
