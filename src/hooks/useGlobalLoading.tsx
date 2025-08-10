import React, { createContext, useContext, useState, useCallback } from 'react';

interface GlobalLoadingContextValue {
  active: number; // count of concurrent loading operations
  start: (key?: string) => string; // returns an id
  stop: (id: string) => void;
  isLoading: boolean;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | undefined>(undefined);

export const GlobalLoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState(0);
  const start = useCallback((key?: string) => {
    setActive(a => a + 1);
    return key || Math.random().toString(36).slice(2);
  }, []);
  const stop = useCallback((id: string) => {
    setActive(a => Math.max(0, a - 1));
  }, []);
  return (
    <GlobalLoadingContext.Provider value={{ active, start, stop, isLoading: active > 0 }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
};

export const useGlobalLoading = () => {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) throw new Error('useGlobalLoading must be used within GlobalLoadingProvider');
  return ctx;
};
