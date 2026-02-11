import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { requireAdmin } from '../lib/auth.js';
import { checkRateLimit, createRateLimitResponse } from '../lib/rateLimit.js';
import {
  getAllConversationsWithUsers,
  getMessagesAdmin,
  deleteConversationAdmin,
} from '../lib/dynamodb.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;

  // Handle OPTIONS for CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    };
  }

  try {
    // Verify admin access
    const user = await requireAdmin(event);

    // Check rate limit
    const rateLimit = await checkRateLimit(user.sub, 'admin');
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit);
    }

    const queryParams = event.queryStringParameters || {};

    if (method === 'GET') {
      // List all conversations
      const conversations = await getAllConversationsWithUsers();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversations),
      };
    }

    if (method === 'POST') {
      // Get messages for specific conversation (body contains userId and conversationId)
      const body = event.body ? JSON.parse(event.body) : {};

      if (body.userId && body.conversationId) {
        const messages = await getMessagesAdmin(body.userId, body.conversationId);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        };
      }

      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'userId and conversationId are required in request body' }),
      };
    }

    if (method === 'DELETE') {
      if (!queryParams.userId || !queryParams.conversationId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'userId and conversationId are required' }),
        };
      }

      await deleteConversationAdmin(queryParams.userId, queryParams.conversationId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Conversation deleted successfully' }),
      };
    }

    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Admin function error:', error);

    // Check if it's an authorization error
    if (error instanceof Error && error.message === 'Admin access required') {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Admin access required' }),
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
};
