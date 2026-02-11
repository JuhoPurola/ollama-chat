import { useState, useEffect, ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createApi } from '../services/api';
import { Conversation } from '../types';
import Sidebar from './Sidebar';
import { useModels } from '../hooks/useModels';
import { useInstance } from '../hooks/useInstance';
import { ModelProvider } from '../contexts/ModelContext';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedModel, setSelectedModel] = useState('llama2');
  const { getAccessTokenSilently, user, logout } = useAuth0();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { models } = useModels();
  const { status: instanceStatus, loading: instanceLoading, startInstance, stopInstance } = useInstance();

  const api = createApi(getAccessTokenSilently);

  useEffect(() => {
    loadConversations();
  }, [conversationId]);

  useEffect(() => {
    if (models.length > 0 && !models.find(m => m.name === selectedModel)) {
      setSelectedModel(models[0].name);
    }
  }, [models]);

  const loadConversations = async () => {
    try {
      const fetched = await api.fetchConversations();
      setConversations(fetched.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const handleNewChat = () => {
    navigate('/');
    setSidebarOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    navigate(`/chat/${id}`);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      await loadConversations();
      if (conversationId === id) {
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <ModelProvider value={{ selectedModel, setSelectedModel, instanceStatus }}>
      <div className="flex h-screen bg-gray-900 text-gray-100">
        {/* Mobile header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-700 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="ml-4 text-lg font-semibold">Ollama Chat</h1>
        </div>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={`
            fixed lg:static inset-y-0 left-0 z-30
            w-64 bg-gray-800 border-r border-gray-700
            transform transition-transform duration-200 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <Sidebar
            conversations={conversations}
            activeConversationId={conversationId}
            selectedModel={selectedModel}
            models={models}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            onSelectModel={setSelectedModel}
            onNavigate={handleNavigate}
            onClose={() => setSidebarOpen(false)}
            userEmail={user?.email || ''}
            onLogout={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            instanceStatus={instanceStatus}
            instanceLoading={instanceLoading}
            onStartInstance={startInstance}
            onStopInstance={stopInstance}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:ml-0 pt-14 lg:pt-0">
          {children}
        </div>
      </div>
    </ModelProvider>
  );
}
