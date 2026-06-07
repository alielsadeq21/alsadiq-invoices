'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import AppSidebar from './app-sidebar';
import { supabase } from '@/lib/supabase';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loadSettings, checkAuth, sidebarOpen, setSidebarOpen } = useAppStore();

  useEffect(() => {
    checkAuth();
    loadSettings();
  }, [checkAuth, loadSettings]);

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'lg:mr-72' : 'lg:mr-0'
        }`}
      >
        {/* Desktop sidebar toggle - shows when sidebar is closed */}
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-4 right-4 z-40 hidden lg:flex bg-card shadow-md h-10 w-10"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
