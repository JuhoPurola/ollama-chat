import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  BatchWriteCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ConversationRecord, MessageRecord, ConversationRecordWithUser } from '../types.js';

const TABLE_NAME = process.env.TABLE_NAME!;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'CONV#',
      },
    })
  );

  // Filter out messages (SK contains MSG)
  const conversations = (result.Items || []).filter(
    (item) => !item.SK.includes('#MSG#')
  ) as ConversationRecord[];

  return conversations;
}

/**
 * Get a single conversation by ID to verify ownership
 * Returns null if conversation doesn't exist or doesn't belong to user
 */
export async function getConversation(
  userId: string,
  conversationId: string
): Promise<ConversationRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CONV#${conversationId}`,
      },
    })
  );

  return result.Item as ConversationRecord || null;
}

export async function getMessages(
  userId: string,
  conversationId: string
): Promise<MessageRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': `CONV#${conversationId}#MSG#`,
      },
      ScanIndexForward: true, // Sort by timestamp ascending
    })
  );

  return (result.Items || []) as MessageRecord[];
}

export async function putConversation(
  userId: string,
  conversation: { id: string; title: string; model: string; email?: string }
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CONV#${conversation.id}`,
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        email: conversation.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        itemType: 'CONVERSATION',  // For GSI query
      },
    })
  );
}

export async function putMessage(
  userId: string,
  conversationId: string,
  message: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CONV#${conversationId}#MSG#${message.timestamp}`,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
      },
    })
  );
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  // Get all messages for the conversation
  const messages = await getMessages(userId, conversationId);

  // Delete conversation and all messages in batches
  const itemsToDelete = [
    { PK: `USER#${userId}`, SK: `CONV#${conversationId}` },
    ...messages.map((msg) => ({
      PK: `USER#${userId}`,
      SK: `CONV#${conversationId}#MSG#${msg.timestamp}`,
    })),
  ];

  // DynamoDB BatchWrite can handle max 25 items at a time
  const chunks: Array<Array<{ PK: string; SK: string }>> = [];
  for (let i = 0; i < itemsToDelete.length; i += 25) {
    chunks.push(itemsToDelete.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: chunk.map((item) => ({
          DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        })),
      },
    });

    const result = await docClient.send(command);

    // Handle unprocessed items (retry with exponential backoff)
    if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
      let unprocessed = result.UnprocessedItems;
      let retries = 0;
      const maxRetries = 3;

      while (Object.keys(unprocessed).length > 0 && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
        const retryResult = await docClient.send(new BatchWriteCommand({ RequestItems: unprocessed }));
        unprocessed = retryResult.UnprocessedItems || {};
        retries++;
      }

      if (Object.keys(unprocessed).length > 0) {
        console.error('Failed to delete some items after retries:', unprocessed);
        throw new Error('Failed to delete all conversation items');
      }
    }
  }
}

export async function updateHeartbeat(): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: 'SYSTEM',
        SK: 'HEARTBEAT',
        timestamp: new Date().toISOString(),
      },
    })
  );
}

export async function getHeartbeat(): Promise<{ timestamp: string } | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: 'SYSTEM',
        SK: 'HEARTBEAT',
      },
    })
  );

  return result.Item as { timestamp: string } | null;
}

export async function updateConversationTitle(
  userId: string,
  conversationId: string,
  title: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CONV#${conversationId}`,
      },
      UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':title': title,
        ':updatedAt': new Date().toISOString(),
      },
    })
  );
}

// Admin functions

export async function getAllConversationsWithUsers(): Promise<ConversationRecordWithUser[]> {
  // Use GSI for efficient query instead of Scan
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'ConversationsIndex',
      KeyConditionExpression: 'itemType = :type',
      ExpressionAttributeValues: {
        ':type': 'CONVERSATION',
      },
      ScanIndexForward: false,  // Sort by updatedAt descending (newest first)
    })
  );

  const conversations = (result.Items || []).map((item) => {
    const userId = item.PK.replace('USER#', '');
    return {
      ...item,
      userId,
      email: item.email,
    } as ConversationRecordWithUser;
  });

  return conversations;
}

export async function getMessagesAdmin(
  userId: string,
  conversationId: string
): Promise<MessageRecord[]> {
  return getMessages(userId, conversationId);
}

export async function deleteConversationAdmin(
  userId: string,
  conversationId: string
): Promise<void> {
  return deleteConversation(userId, conversationId);
}
