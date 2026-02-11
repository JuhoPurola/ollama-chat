#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database';
import { BackendStack } from '../lib/backend';
import { FrontendStack } from '../lib/frontend';
import { BudgetStack } from '../lib/budget';

const app = new cdk.App();
const env = { region: 'eu-west-1' };

// Get allowed origins from context (add CloudFront URL after first deployment)
const cloudFrontUrl = app.node.tryGetContext('cloudFrontUrl');
const allowedOrigins = cloudFrontUrl
  ? [`https://${cloudFrontUrl}`, 'http://localhost:5173']  // Production + local dev
  : ['*'];  // Wildcard for initial deployment only

const db = new DatabaseStack(app, 'OllamaChatDatabase', { env });
const backend = new BackendStack(app, 'OllamaChatBackend', {
  env,
  table: db.table,
  allowedOrigins,
});
new FrontendStack(app, 'OllamaChatFrontend', {
  env,
  functionUrls: backend.functionUrls,
});

// Budget stack - optional, configure in cdk.json
const budgetEmail = app.node.tryGetContext('budgetEmail') || app.node.tryGetContext('adminEmails')?.split(',')[0];
const monthlyBudgetUsd = app.node.tryGetContext('monthlyBudgetUsd');
if (budgetEmail) {
  new BudgetStack(app, 'OllamaChatBudget', {
    env,
    email: budgetEmail,
    monthlyBudgetUsd: monthlyBudgetUsd ? parseInt(monthlyBudgetUsd, 10) : 100,
  });
}
