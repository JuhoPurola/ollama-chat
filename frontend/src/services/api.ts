import { getConfig } from './config';
import { Conversation, ConversationWithUser, Message, OllamaModel, InstanceStatus, CostEstimate } from '../types';

export interface ChatStreamBody {
  conversationId?: string;
  model: string;
  messages: Message[];
}

export function createApi(getAccessTokenSilently: () => Promise<string>) {
  const getHeaders = async () => {
    const token = await getAccessTokenSilently();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const config = getConfig();

  return {
    async fetchConversations(): Promise<Conversation[]> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.conversations, { headers });
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },

    async fetchMessages(conversationId: string): Promise<Message[]> {
      const headers = await getHeaders();
      const url = `${config.apiUrls.conversations}?id=${conversationId}`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },

    async createConversation(title: string, model: string): Promise<Conversation> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.conversations, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, model }),
      });
      if (!response.ok) throw new Error('Failed to create conversation');
      return response.json();
    },

    async deleteConversation(id: string): Promise<void> {
      const headers = await getHeaders();
      const url = `${config.apiUrls.conversations}?id=${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error('Failed to delete conversation');
    },

    async chatStream(body: ChatStreamBody): Promise<Response> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.chat, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Chat request failed');
      return response;
    },

    async fetchModels(): Promise<OllamaModel[]> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.models, { headers });
      if (!response.ok) throw new Error('Failed to fetch models');
      return response.json();
    },

    async pullModel(name: string): Promise<void> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.models, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('Failed to pull model');
    },

    async deleteModel(name: string): Promise<void> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.models, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('Failed to delete model');
    },

    async fetchInstanceStatus(): Promise<InstanceStatus> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.instance, { headers });
      if (!response.ok) throw new Error('Failed to fetch instance status');
      return response.json();
    },

    async instanceAction(action: 'start' | 'stop'): Promise<void> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.instance, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(`Failed to ${action} instance`);
    },

    async fetchCosts(): Promise<CostEstimate> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.costs, { headers });
      if (!response.ok) throw new Error('Failed to fetch costs');
      return response.json();
    },

    // Admin endpoints
    async fetchAllConversations(): Promise<ConversationWithUser[]> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.admin, { headers });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Admin access required');
        }
        throw new Error('Failed to fetch all conversations');
      }
      return response.json();
    },

    async fetchMessagesAdmin(userId: string, conversationId: string): Promise<Message[]> {
      const headers = await getHeaders();
      const response = await fetch(config.apiUrls.admin, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, conversationId }),
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },

    async deleteConversationAdmin(userId: string, conversationId: string): Promise<void> {
      const headers = await getHeaders();
      const url = `${config.apiUrls.admin}?userId=${userId}&conversationId=${conversationId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error('Failed to delete conversation');
    },
  };
}
