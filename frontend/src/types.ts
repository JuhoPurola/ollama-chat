export interface Conversation {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
}

export interface ConversationWithUser extends Conversation {
  userId: string;
  email?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface InstanceStatus {
  state: 'stopped' | 'running' | 'pending' | 'stopping';
  publicIp?: string;
  ollamaReady: boolean;
}

export interface CostEstimate {
  yesterday: number;
  month: number;
}
