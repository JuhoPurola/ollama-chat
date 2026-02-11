import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoadingScreen from './components/LoadingScreen';
import LoginScreen from './components/LoginScreen';
import AppLayout from './components/AppLayout';
import ChatView from './components/ChatView';
import ModelsPage from './components/ModelsPage';
import DashboardPage from './components/DashboardPage';
import { AdminPage } from './components/AdminPage';

function App() {
  const { isAuthenticated, isLoading, loginWithRedirect, error } = useAuth0();

  // Clear Auth0 error params from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogin = async () => {
    try {
      await loginWithRedirect();
    } catch (e) {
      console.error('Login redirect failed:', e);
      alert('Login failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} error={error?.message} />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ChatView />} />
        <Route path="/chat/:conversationId" element={<ChatView />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
