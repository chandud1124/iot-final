import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toaster } from './ui/toaster';
import { SecurityAlertBanner } from './SecurityAlertBanner';
import { useIsMobile } from '@/hooks/use-mobile';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const isMobile = useIsMobile();
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <SecurityAlertBanner />
      <div className="flex-1 flex flex-row overflow-hidden">
        <Sidebar className={`${isMobile ? 'hidden' : 'hidden md:block'}`} />
        <main className="flex-1 p-4 overflow-y-auto">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
};
