import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useModelContext, useInstanceContext } from '../contexts/ModelContext';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

export default function ChatView() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { messages, isStreaming, currentStreamContent, sendMessage, loadMessages, clearMessages } = useChat();
  const { selectedModel } = useModelContext();
  const { status } = useInstanceContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId);
    } else {
      clearMessages();
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamContent]);

  const handleSend = async (content: string) => {
    const newConversationId = await sendMessage(content, selectedModel, conversationId);

    if (newConversationId && !conversationId) {
      navigate(`/chat/${newConversationId}`);
    }
  };

  const isInstanceReady = status?.state === 'running' && status?.ollamaReady;

  return (
    <div className="flex flex-col h-full">
      {/* Warning banner if instance not ready */}
      {!isInstanceReady && (
        <div className="bg-yellow-600 text-white px-4 py-2 text-center text-sm">
          Instance is not running. Please start it from the Dashboard.
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 && !isStreaming ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-lg">Start a conversation</p>
                <p className="text-sm mt-2">Send a message to begin chatting with Ollama</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
              {isStreaming && currentStreamContent && (
                <MessageBubble
                  message={{
                    role: 'assistant',
                    content: currentStreamContent,
                    timestamp: new Date().toISOString(),
                  }}
                  isStreaming={true}
                />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        disabled={isStreaming || !isInstanceReady}
        placeholder={
          !isInstanceReady
            ? 'Instance not ready...'
            : isStreaming
            ? 'Waiting for response...'
            : 'Type a message...'
        }
      />
    </div>
  );
}
