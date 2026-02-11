import { Conversation, OllamaModel, InstanceStatus } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId?: string;
  selectedModel: string;
  models: OllamaModel[];
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSelectModel: (model: string) => void;
  onNavigate: (path: string) => void;
  onClose: () => void;
  userEmail: string;
  onLogout: () => void;
  instanceStatus: InstanceStatus | null;
  instanceLoading: boolean;
  onStartInstance: () => void;
  onStopInstance: () => void;
}

export default function Sidebar({
  conversations,
  activeConversationId,
  selectedModel,
  models,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onSelectModel,
  onNavigate,
  onClose,
  userEmail,
  onLogout,
  instanceStatus,
  instanceLoading,
  onStartInstance,
  onStopInstance,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Close button for mobile */}
      <div className="lg:hidden flex justify-end p-4">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-700 rounded-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-medium">New Chat</span>
        </button>
      </div>

      {/* Model Selector */}
      <div className="px-4 mb-4">
        <label className="block text-sm text-gray-400 mb-2">Model</label>
        <select
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {models.length === 0 && (
            <option value="">No models available</option>
          )}
          {models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Conversations</div>
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No conversations yet</p>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`
                  group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
                  ${conv.id === activeConversationId
                    ? 'bg-gray-700 text-gray-100'
                    : 'hover:bg-gray-700 text-gray-300'
                  }
                `}
                onClick={() => onSelectConversation(conv.id)}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="flex-1 text-sm truncate">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instance Status */}
      <div className="border-t border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              !instanceStatus ? 'bg-gray-500' :
              instanceStatus.state === 'running' && instanceStatus.ollamaReady ? 'bg-green-500' :
              instanceStatus.state === 'running' ? 'bg-yellow-500 animate-pulse' :
              instanceStatus.state === 'pending' ? 'bg-yellow-500 animate-pulse' :
              instanceStatus.state === 'stopping' ? 'bg-orange-500 animate-pulse' :
              'bg-red-500'
            }`} />
            <span className="text-sm text-gray-300">
              {!instanceStatus ? 'Loading...' :
               instanceStatus.state === 'running' && instanceStatus.ollamaReady ? 'Ready' :
               instanceStatus.state === 'running' ? 'Starting Ollama...' :
               instanceStatus.state === 'pending' ? 'Starting...' :
               instanceStatus.state === 'stopping' ? 'Stopping...' :
               'Stopped'}
            </span>
          </div>
          {instanceStatus && (
            instanceStatus.state === 'stopped' ? (
              <button
                onClick={onStartInstance}
                disabled={instanceLoading}
                className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-md transition-colors"
              >
                Start
              </button>
            ) : instanceStatus.state === 'running' ? (
              <button
                onClick={onStopInstance}
                disabled={instanceLoading}
                className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-md transition-colors"
              >
                Stop
              </button>
            ) : null
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <div className="border-t border-gray-700 p-4 space-y-1">
        <button
          onClick={() => onNavigate('/models')}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg transition-colors text-left"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>Models</span>
        </button>
        <button
          onClick={() => onNavigate('/dashboard')}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg transition-colors text-left"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => onNavigate('/admin')}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-lg transition-colors text-left"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Admin</span>
        </button>
      </div>

      {/* User Info & Logout */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300 truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-gray-700 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
