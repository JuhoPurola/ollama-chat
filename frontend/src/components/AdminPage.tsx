import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApi } from '../services/api';
import { ConversationWithUser, Message } from '../types';
import { ShieldAlert, Search, Eye, Trash2, X } from 'lucide-react';

export function AdminPage() {
  const { getAccessTokenSilently } = useAuth0();
  const [conversations, setConversations] = useState<ConversationWithUser[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<ConversationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingMessages, setViewingMessages] = useState<{ conv: ConversationWithUser; messages: Message[] } | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const api = createApi(getAccessTokenSilently);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredConversations(conversations);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredConversations(
        conversations.filter(
          (conv) =>
            conv.email?.toLowerCase().includes(term) ||
            conv.title.toLowerCase().includes(term) ||
            conv.userId.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, conversations]);

  async function loadConversations() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchAllConversations();
      setConversations(data);
      setFilteredConversations(data);
    } catch (err) {
      if (err instanceof Error && err.message === 'Admin access required') {
        setError('You do not have admin access to this page.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleViewMessages(conv: ConversationWithUser) {
    try {
      setLoadingMessages(true);
      const messages = await api.fetchMessagesAdmin(conv.userId, conv.id);
      setViewingMessages({ conv, messages });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleDelete(conv: ConversationWithUser) {
    const confirmed = window.confirm(
      `Delete conversation "${conv.title}" from user ${conv.email || conv.userId}?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await api.deleteConversationAdmin(conv.userId, conv.id);
      setConversations((prev) => prev.filter((c) => c.id !== conv.id || c.userId !== conv.userId));
      alert('Conversation deleted successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  }

  const uniqueUsers = new Set(conversations.map((c) => c.userId)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading admin panel...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          <h1 className="text-2xl font-bold">Admin: Chat History Moderation</h1>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-4">
          <div className="bg-gray-800 rounded-lg px-4 py-2">
            <div className="text-sm text-gray-400">Total Conversations</div>
            <div className="text-2xl font-bold">{conversations.length}</div>
          </div>
          <div className="bg-gray-800 rounded-lg px-4 py-2">
            <div className="text-sm text-gray-400">Unique Users</div>
            <div className="text-2xl font-bold">{uniqueUsers}</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email, title, or user ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Conversations Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="text-left p-3 text-sm font-semibold text-gray-300">User Email</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-300">User ID</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-300">Title</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-300">Model</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-300">Updated</th>
                <th className="text-right p-3 text-sm font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-gray-400">
                    {searchTerm ? 'No conversations match your search' : 'No conversations found'}
                  </td>
                </tr>
              ) : (
                filteredConversations.map((conv) => (
                  <tr key={`${conv.userId}-${conv.id}`} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="p-3 text-sm">{conv.email || <span className="text-gray-500">N/A</span>}</td>
                    <td className="p-3 text-sm font-mono text-xs text-gray-400">{conv.userId.slice(0, 20)}...</td>
                    <td className="p-3 text-sm">{conv.title}</td>
                    <td className="p-3 text-sm text-gray-400">{conv.model}</td>
                    <td className="p-3 text-sm text-gray-400">{new Date(conv.updatedAt).toLocaleDateString()}</td>
                    <td className="p-3 text-sm text-right">
                      <button
                        onClick={() => handleViewMessages(conv)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded mr-2 transition-colors"
                        disabled={loadingMessages}
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => handleDelete(conv)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Messages Modal */}
      {viewingMessages && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-700 p-4">
              <div>
                <h2 className="text-xl font-bold">{viewingMessages.conv.title}</h2>
                <p className="text-sm text-gray-400">
                  User: {viewingMessages.conv.email || viewingMessages.conv.userId}
                </p>
              </div>
              <button
                onClick={() => setViewingMessages(null)}
                className="p-2 hover:bg-gray-700 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {viewingMessages.messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg ${
                    msg.role === 'user' ? 'bg-blue-900/30 ml-8' : 'bg-gray-700 mr-8'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold">
                      {msg.role === 'user' ? 'User' : 'Assistant'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-700 p-4 flex justify-end">
              <button
                onClick={() => setViewingMessages(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
