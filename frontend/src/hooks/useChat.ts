import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApi } from '../services/api';
import { Message } from '../types';

export function useChat() {
  const { getAccessTokenSilently } = useAuth0();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamContent, setCurrentStreamContent] = useState('');

  const api = createApi(getAccessTokenSilently);

  const loadMessages = async (conversationId: string) => {
    try {
      const fetchedMessages = await api.fetchMessages(conversationId);
      setMessages(fetchedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const sendMessage = async (
    content: string,
    model: string,
    conversationId?: string
  ): Promise<string | undefined> => {
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setCurrentStreamContent('');

    try {
      const allMessages = [...messages, userMessage];
      const response = await api.chatStream({
        conversationId,
        model,
        messages: allMessages,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let fullContent = '';
      let returnConversationId: string | undefined = conversationId;

      let streamDone = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                console.error('Stream error from server:', data.error);
                break;
              }

              if (data.conversationId) {
                returnConversationId = data.conversationId;
              }

              if (data.content) {
                fullContent += data.content;
                setCurrentStreamContent(fullContent);
              }

              if (data.done) {
                streamDone = true;
                const assistantMessage: Message = {
                  role: 'assistant',
                  content: fullContent,
                  timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, assistantMessage]);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Always reset streaming state when the stream ends
      if (!streamDone && fullContent) {
        // Stream ended without done event but we got partial content - save it
        const assistantMessage: Message = {
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
      setIsStreaming(false);
      setCurrentStreamContent('');

      return returnConversationId;
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsStreaming(false);
      setCurrentStreamContent('');
      return undefined;
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setCurrentStreamContent('');
  };

  return {
    messages,
    isStreaming,
    currentStreamContent,
    sendMessage,
    loadMessages,
    clearMessages,
  };
}
