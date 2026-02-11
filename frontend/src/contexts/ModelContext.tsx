import { createContext, useContext, ReactNode } from 'react';
import { InstanceStatus } from '../types';

interface AppContextType {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  instanceStatus: InstanceStatus | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function useModelContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useModelContext must be used within ModelProvider');
  }
  return context;
}

export function useInstanceContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useInstanceContext must be used within ModelProvider');
  }
  return { status: context.instanceStatus };
}

interface ModelProviderProps {
  children: ReactNode;
  value: AppContextType;
}

export function ModelProvider({ children, value }: ModelProviderProps) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
