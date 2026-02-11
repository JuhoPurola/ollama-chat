import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getAuthUser } from '../lib/auth.js';
import { checkRateLimit, createRateLimitResponse } from '../lib/rateLimit.js';
import { getOllamaUrl } from '../lib/ec2.js';
import { listModels, pullModel, deleteModel } from '../lib/ollama.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    // Verify authentication
    const user = await getAuthUser(event);

    // Check rate limit
    const rateLimit = await checkRateLimit(user.sub, 'models');
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit);
    }

    const method = event.requestContext.http.method;

    // Get Ollama URL
    const ollamaUrl = await getOllamaUrl();

    // GET - List models
    if (method === 'GET') {
      const models = await listModels(ollamaUrl);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(models),
      };
    }

    // POST - Pull model
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required field: name' }),
        };
      }

      const result = await pullModel(ollamaUrl, name);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      };
    }

    // DELETE - Delete model
    if (method === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      const { name } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required field: name' }),
        };
      }

      await deleteModel(ollamaUrl, name);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Models error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
