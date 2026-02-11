interface LoginScreenProps {
  onLogin: () => void;
  error?: string;
}

export default function LoginScreen({ onLogin, error }: LoginScreenProps) {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-100 mb-2">Ollama Chat</h1>
          <p className="text-gray-400">Sign in to continue</p>
        </div>
        {error && (
          <p className="text-red-400 text-sm mb-4 max-w-sm mx-auto">{error}</p>
        )}
        <button
          onClick={onLogin}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
