'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import AppSidebar from './app-sidebar';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setupGlobalErrorHandler } from '@/lib/error-handler';

const DEFAULT_IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE = 60 * 1000; // 1 minute before logout

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loadSettings, checkAuth, sidebarOpen, setSidebarOpen, autoLogout, settings } = useAppStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef = useRef(false);

  const getIdleTimeout = useCallback(() => {
    const minutes = settings?.idle_timeout_minutes || 15;
    return minutes * 60 * 1000;
  }, [settings?.idle_timeout_minutes]);

  const resetTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warnedRef.current = false;

    const idleTimeout = getIdleTimeout();
    const warningTime = Math.min(WARNING_BEFORE, idleTimeout - 1000);

    // Set warning timer (1 minute before logout)
    warningTimerRef.current = setTimeout(() => {
      warnedRef.current = true;
    }, idleTimeout - warningTime);

    // Set logout timer
    const minutes = settings?.idle_timeout_minutes || 15;
    timerRef.current = setTimeout(() => {
      autoLogout(`تم تسجيل خروجك تلقائياً بسبب عدم النشاط لأكثر من ${minutes} دقيقة`);
    }, idleTimeout);
  }, [autoLogout, getIdleTimeout, settings?.idle_timeout_minutes]);

  useEffect(() => {
    checkAuth();
    loadSettings();
    setupGlobalErrorHandler();
  }, [checkAuth, loadSettings]);

  useEffect(() => {
    if (!useAppStore.getState().isLoggedIn) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      resetTimers();
    };

    resetTimers();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimers]);

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'lg:mr-72' : 'lg:mr-0'
        }`}
      >
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

      <IdleWarningBanner warnedRef={warnedRef} />
    </div>
  );
}

function IdleWarningBanner({ warnedRef }: { warnedRef: React.RefObject<boolean> }) {
  const { isLoggedIn } = useAppStore();
  const [showWarning, setShowWarning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setShowWarning(false);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (warnedRef.current) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoggedIn, warnedRef]);

  // Hide warning on any user interaction
  useEffect(() => {
    if (!isLoggedIn) return;

    const hideWarning = () => {
      setShowWarning(false);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach((event) => {
      window.addEventListener(event, hideWarning);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, hideWarning);
      });
    };
  }, [isLoggedIn]);

  if (!showWarning || !isLoggedIn) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-3 px-4 shadow-lg">
      <p className="text-sm font-bold">
        سيتم تسجيل خروجك تلقائياً خلال دقيقة واحدة بسبب عدم النشاط — اضغط أي مكان للمتابعة
      </p>
    </div>
  );
}
