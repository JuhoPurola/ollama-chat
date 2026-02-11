import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApi } from '../services/api';
import { InstanceStatus } from '../types';

export function useInstance() {
  const { getAccessTokenSilently } = useAuth0();
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const api = createApi(getAccessTokenSilently);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const fetchedStatus = await api.fetchInstanceStatus();
      setStatus(fetchedStatus);
    } catch (error) {
      console.error('Failed to load instance status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startInstance = async () => {
    setLoading(true);
    try {
      await api.instanceAction('start');
      await loadStatus();
    } catch (error) {
      console.error('Failed to start instance:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const stopInstance = async () => {
    setLoading(true);
    try {
      await api.instanceAction('stop');
      await loadStatus();
    } catch (error) {
      console.error('Failed to stop instance:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!status) return;

    if (status.state === 'pending' || status.state === 'stopping') {
      const interval = setInterval(() => {
        loadStatus();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [status?.state]);

  return {
    status,
    loading,
    loadStatus,
    startInstance,
    stopInstance,
  };
}
