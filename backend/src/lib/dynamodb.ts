import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
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
    })
  );

  return (result.Items || []) as MessageRecord[];
}

export async function putConversation(
  userId: string,
  conv: { id: string; title: string; model: string; email?: string }
): Promise<void> {
  const now = new Date().toISOString();

  const item: Record<string, any> = {
    PK: `USER#${userId}`,
    SK: `CONV#${conv.id}`,
    id: conv.id,
    title: conv.title,
    model: conv.model,
    updatedAt: now,
  };
  if (conv.email) item.email = conv.email;

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );
}

export async function putMessage(
  userId: string,
  conversationId: string,
  msg: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CONV#${conversationId}#MSG#${msg.timestamp}`,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        conversationId,
      },
    })
  );
}

export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  // First, get all messages for this conversation
  const messages = await getMessages(userId, conversationId);
  
  // Batch delete messages
  if (messages.length > 0) {
    const chunks = [];
    for (let i = 0; i < messages.length; i += 25) {
      chunks.push(messages.slice(i, i + 25));
    }
    
    for (const chunk of chunks) {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: chunk.map((msg) => ({
              DeleteRequest: {
                Key: {
                  PK: msg.PK,
                  SK: msg.SK,
                },
              },
            })),
          },
        })
      );
    }
  }
  
  // Delete conversation metadata
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CONV#${conversationId}`,
      },
    })
  );
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

export async function getHeartbeat(): Promise<string | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': 'SYSTEM',
        ':sk': 'HEARTBEAT',
      },
    })
  );
  return result.Items?.[0]?.timestamp || null;
}

export async function updateConversationTitle(
  userId: string,
  conversationId: string,
  title: string
): Promise<void> {
  const now = new Date().toISOString();

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
        ':updatedAt': now,
      },
    })
  );
}

// Admin functions for cross-user access

export async function getAllConversationsWithUsers(): Promise<ConversationRecordWithUser[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :sk) AND NOT contains(SK, :msg)',
      ExpressionAttributeValues: {
        ':sk': 'CONV#',
        ':msg': '#MSG#',
      },
    })
  );

  const conversations = (result.Items || []).map((item) => {
    // Extract userId from PK (format: USER#{userId})
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
  // Same as getMessages but explicit about admin access
  return getMessages(userId, conversationId);
}

export async function deleteConversationAdmin(
  userId: string,
  conversationId: string
): Promise<void> {
  // Same as deleteConversation but explicit about admin access
  return deleteConversation(userId, conversationId);
}
