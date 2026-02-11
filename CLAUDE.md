# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ollama Chat is a full-stack chat application that integrates with Ollama running on an EC2 instance. The architecture consists of:

- **Frontend**: React + TypeScript + Vite + TailwindCSS, hosted on CloudFront/S3
- **Backend**: AWS Lambda functions (Node.js 20) with streaming support
- **Infrastructure**: AWS CDK for deployment (eu-west-1 region)
- **Database**: DynamoDB with single-table design
- **Authentication**: Auth0 with JWT verification

The application manages EC2 instance lifecycle (start/stop), handles real-time chat streaming, and tracks AWS costs.

## Repository Structure

This is an npm workspaces monorepo with three packages:

- `frontend/` - React SPA with Auth0 authentication
- `backend/` - Lambda functions bundled with esbuild
- `infra/` - AWS CDK infrastructure definitions

## Development Commands

### Frontend Development
```bash
cd frontend
npm run dev          # Start Vite dev server
npm run build        # Build for production (TypeScript + Vite)
```

### Backend Development
```bash
cd backend
npm run build        # Bundle Lambda functions with esbuild
npm run typecheck    # Run TypeScript type checking
```

### Infrastructure Deployment
```bash
cd infra
npm run build        # Compile TypeScript CDK code
npm run synth        # Synthesize CloudFormation templates
npm run deploy       # Deploy all stacks to AWS
npm run cdk          # Run any CDK command
```

## Architecture Details

### Backend Lambda Functions

All Lambda functions are located in `backend/src/functions/` and use:
- ESM format (`.mjs` output)
- Streaming response for chat function (`RESPONSE_STREAM` invoke mode)
- Auth0 JWT verification via `backend/src/lib/auth.ts`
- EC2 instance management via `backend/src/lib/ec2.ts`
- Ollama API integration via `backend/src/lib/ollama.ts`
- DynamoDB operations via `backend/src/lib/dynamodb.ts`

Functions:
- `chat.ts` - Streaming chat with Ollama (5 min timeout)
- `conversations.ts` - CRUD operations for chat conversations
- `models.ts` - List/manage Ollama models (10 min timeout for pulls)
- `instance.ts` - Start/stop EC2 instance
- `costs.ts` - Query AWS Cost Explorer
- `autostop.ts` - Scheduled function (every 5 min) to auto-stop idle EC2

### DynamoDB Single-Table Design

Table: `ollama-chat` with PK/SK:

- Conversations: `PK=USER#<userId>`, `SK=CONV#<conversationId>`
- Messages: `PK=USER#<userId>`, `SK=CONV#<conversationId>#MSG#<timestamp>`
- System heartbeat: `PK=SYSTEM`, `SK=HEARTBEAT`

### CDK Stack Dependencies

Three stacks deployed in order:
1. `OllamaChatDatabase` - DynamoDB table (RETAIN removal policy)
2. `OllamaChatBackend` - Lambda functions with Function URLs
3. `OllamaChatFrontend` - S3 bucket + CloudFront distribution

The frontend stack dynamically generates `config.json` with API endpoints and Auth0 configuration during deployment.

### Frontend Architecture

- React Router for navigation (`/`, `/chat/:conversationId`, `/models`, `/dashboard`)
- Auth0React provider wraps entire app in `main.tsx`
- ModelContext manages current model selection globally
- Custom hooks: `useChat`, `useModels`, `useInstance`
- API service layer in `frontend/src/services/api.ts` fetches config and calls Lambda Function URLs

### Authentication Flow

1. Frontend loads `config.json` from CloudFront to get Auth0 settings
2. User logs in via Auth0 (redirect flow)
3. Frontend receives JWT access token
4. All API calls include `Authorization: Bearer <token>` header
5. Lambda functions verify JWT using `jose` library with Auth0 JWKS endpoint

### EC2 Instance Management

- Instance ID hardcoded: `i-0cb9859cf76e12243`
- Backend resolves private IP via `DescribeInstances` API
- Ollama runs on port 11434 on the EC2 instance
- Autostop function checks heartbeat to determine idle time
- Hard limit: instance stops after 1 hour regardless of activity

## Important Notes

- The `backend/esbuild.config.mjs` automatically bundles all `*.ts` files in `src/functions/`
- Lambda functions use ESM format with a banner to create `require` from `import.meta.url`
- AWS SDK clients (`@aws-sdk/*`) are marked as external in esbuild config
- Frontend expects `config.json` at CloudFront root to be available before app initializes
- DynamoDB table uses `RETAIN` removal policy - will not be deleted on stack deletion
