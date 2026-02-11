#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database';
import { BackendStack } from '../lib/backend';
import { FrontendStack } from '../lib/frontend';

const app = new cdk.App();
const env = { region: 'eu-west-1' };

const db = new DatabaseStack(app, 'OllamaChatDatabase', { env });
const backend = new BackendStack(app, 'OllamaChatBackend', {
  env,
  table: db.table,
});
new FrontendStack(app, 'OllamaChatFrontend', {
  env,
  functionUrls: backend.functionUrls,
});
