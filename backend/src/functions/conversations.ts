import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getAuthUser } from '../lib/auth.js';
import { checkRateLimit, createRateLimitResponse } from '../lib/rateLimit.js';
import {
  listConversations,
  getConversation,
  getMessages,
  putConversation,
  deleteConversation,
} from '../lib/dynamodb.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    // Verify authentication
    const user = await getAuthUser(event);

    // Check rate limit
    const rateLimit = await checkRateLimit(user.sub, 'conversations');
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit);
    }

    const method = event.requestContext.http.method;

    // GET / - List conversations
    if (method === 'GET' && !event.queryStringParameters?.id) {
      const conversations = await listConversations(user.sub);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversations),
      };
    }

    // GET /?id=xxx - Get messages for a conversation
    if (method === 'GET' && event.queryStringParameters?.id) {
      const conversationId = event.queryStringParameters.id;

      // Verify conversation ownership (IDOR protection)
      const conversation = await getConversation(user.sub, conversationId);
      if (!conversation) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Conversation not found' }),
        };
      }

      const messages = await getMessages(user.sub, conversationId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      };
    }

    // POST - Create conversation
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { title, model } = body;

      if (!title || !model) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required fields: title and model' }),
        };
      }

      const conversationId = crypto.randomUUID();
      await putConversation(user.sub, {
        id: conversationId,
        title,
        model,
      });

      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conversationId }),
      };
    }

    // DELETE /?id=xxx - Delete conversation
    if (method === 'DELETE' && event.queryStringParameters?.id) {
      const conversationId = event.queryStringParameters.id;

      // Verify conversation ownership (IDOR protection)
      const conversation = await getConversation(user.sub, conversationId);
      if (!conversation) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Conversation not found' }),
        };
      }

      await deleteConversation(user.sub, conversationId);
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
    console.error('Conversations error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
