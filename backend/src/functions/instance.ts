import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getAuthUser } from '../lib/auth.js';
import { getInstanceStatus, startInstance, stopInstance, checkOllamaReady } from '../lib/ec2.js';
import { updateHeartbeat } from '../lib/dynamodb.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    // Verify authentication
    await getAuthUser(event);
    const method = event.requestContext.http.method;

    // GET - Get instance status
    if (method === 'GET') {
      const [status] = await Promise.all([
        getInstanceStatus(),
        updateHeartbeat(),
      ]);
      const ollamaReady = status.state === 'running' ? await checkOllamaReady() : false;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...status,
          ollamaReady,
        }),
      };
    }

    // POST - Start or stop instance
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      if (action === 'start') {
        await startInstance();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, action: 'start' }),
        };
      }

      if (action === 'stop') {
        await stopInstance();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, action: 'stop' }),
        };
      }

      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid action. Must be "start" or "stop"' }),
      };
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Instance error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
