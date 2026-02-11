export interface AuthUser {
  sub: string;
  email?: string;
}

export interface ConversationRecord {
  PK: string;
  SK: string;
  id: string;
  title: string;
  model: string;
  updatedAt: string;
}

export interface ConversationRecordWithUser extends ConversationRecord {
  userId: string;
  email?: string;
}

export interface MessageRecord {
  PK: string;
  SK: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  conversationId: string;
}

export interface ChatRequest {
  conversationId?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}
