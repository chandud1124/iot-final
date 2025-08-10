import React from 'react';
import { useGlobalLoading } from '@/hooks/useGlobalLoading';

export const GlobalLoadingOverlay: React.FC = () => {
  const { isLoading } = useGlobalLoading();
  if (!isLoading) return null;
  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center bg-background/40 backdrop-blur-sm animate-in fade-in">
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-background/80 border shadow-lg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground">Loading...</span>
      </div>
    </div>
  );
};
