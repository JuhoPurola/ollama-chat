import { useState } from 'react';
import { useModels } from '../hooks/useModels';

export default function ModelsPage() {
  const { models, loading, pullModel, deleteModel } = useModels();
  const [pullModelName, setPullModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState('');

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 ** 2);
    return `${mb.toFixed(2)} MB`;
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) return;

    setPulling(true);
    setError('');
    try {
      await pullModel(pullModelName.trim());
      setPullModelName('');
    } catch (err) {
      setError('Failed to pull model. Please check the name and try again.');
    } finally {
      setPulling(false);
    }
  };

  const handleDeleteModel = async (name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      await deleteModel(name);
    } catch (err) {
      alert('Failed to delete model');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Models</h1>

        {/* Pull Model Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Pull Model</h2>
          <p className="text-gray-400 text-sm mb-4">
            Download a model from the Ollama library (e.g., llama2, mistral, codellama)
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              placeholder="Model name (e.g., llama2)"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handlePullModel()}
              disabled={pulling}
            />
            <button
              onClick={handlePullModel}
              disabled={!pullModelName.trim() || pulling}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              {pulling ? 'Pulling...' : 'Pull'}
            </button>
          </div>
          {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
        </div>

        {/* Models List */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Installed Models</h2>

          {loading && models.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : models.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No models installed yet</p>
          ) : (
            <div className="space-y-3">
              {models.map((model) => (
                <div
                  key={model.name}
                  className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{model.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Size: {formatSize(model.size)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Modified: {new Date(model.modified_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteModel(model.name)}
                    className="px-4 py-2 text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
