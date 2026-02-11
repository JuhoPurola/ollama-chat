import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApi } from '../services/api';
import { OllamaModel } from '../types';

export function useModels() {
  const { getAccessTokenSilently } = useAuth0();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);

  const api = createApi(getAccessTokenSilently);

  const loadModels = async () => {
    setLoading(true);
    try {
      const result = await api.fetchModels();
      setModels(Array.isArray(result) ? result : (result as any).models || []);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const pullModel = async (name: string) => {
    setLoading(true);
    try {
      await api.pullModel(name);
      await loadModels();
    } catch (error) {
      console.error('Failed to pull model:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteModel = async (name: string) => {
    setLoading(true);
    try {
      await api.deleteModel(name);
      await loadModels();
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  return {
    models,
    loading,
    loadModels,
    pullModel,
    deleteModel,
  };
}
