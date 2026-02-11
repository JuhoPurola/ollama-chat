import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApi } from '../services/api';
import { useInstance } from '../hooks/useInstance';
import { CostEstimate } from '../types';

export default function DashboardPage() {
  const { status, loading, startInstance, stopInstance } = useInstance();
  const { getAccessTokenSilently } = useAuth0();
  const [costs, setCosts] = useState<CostEstimate | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);

  const api = createApi(getAccessTokenSilently);

  useEffect(() => {
    loadCosts();
  }, []);

  const loadCosts = async () => {
    setLoadingCosts(true);
    try {
      const fetchedCosts = await api.fetchCosts();
      setCosts(fetchedCosts);
    } catch (error) {
      console.error('Failed to load costs:', error);
    } finally {
      setLoadingCosts(false);
    }
  };

  const getStateBadgeColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'bg-green-600';
      case 'stopped':
        return 'bg-red-600';
      case 'pending':
        return 'bg-yellow-600';
      case 'stopping':
        return 'bg-orange-600';
      default:
        return 'bg-gray-600';
    }
  };

  const handleStart = async () => {
    try {
      await startInstance();
    } catch (err) {
      alert('Failed to start instance');
    }
  };

  const handleStop = async () => {
    if (!confirm('Are you sure you want to stop the instance?')) return;
    try {
      await stopInstance();
    } catch (err) {
      alert('Failed to stop instance');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {/* Instance Status Card */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Instance Status</h2>

          {loading && !status ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : status ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">State:</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium text-white ${getStateBadgeColor(
                    status.state
                  )}`}
                >
                  {status.state.toUpperCase()}
                </span>
              </div>

              {status.publicIp && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Public IP:</span>
                  <span className="font-mono text-gray-100">{status.publicIp}</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <span className="text-gray-400">Ollama Ready:</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    status.ollamaReady
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {status.ollamaReady ? 'Yes' : 'No'}
                </span>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleStart}
                  disabled={loading || status.state === 'running' || status.state === 'pending'}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                >
                  Start Instance
                </button>
                <button
                  onClick={handleStop}
                  disabled={loading || status.state === 'stopped' || status.state === 'stopping'}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                >
                  Stop Instance
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">Failed to load instance status</p>
          )}
        </div>

        {/* Cost Estimate Card */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Cost Estimates</h2>

          {loadingCosts && !costs ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : costs ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-1">Yesterday</p>
                <p className="text-3xl font-bold text-blue-400">
                  ${costs.yesterday.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-1">This Month</p>
                <p className="text-3xl font-bold text-blue-400">
                  ${costs.month.toFixed(2)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">Failed to load cost estimates</p>
          )}

          <button
            onClick={loadCosts}
            disabled={loadingCosts}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm transition-colors"
          >
            {loadingCosts ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}
