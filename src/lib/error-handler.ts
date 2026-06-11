// Global Error Handler - يسجل الأخطاء في console و يحاول يرسلها لقاعدة البيانات
// يتم تشغيله من الـ app-layout

import { supabase } from '@/lib/supabase';

export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') return;

  // قبض الأخطاء غير الملتقطة
  const originalErrorHandler = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    logError({
      error_message: String(message),
      error_stack: error?.stack?.substring(0, 2000) || `${source}:${lineno}:${colno}`,
      url: window.location.href,
    });

    if (originalErrorHandler) {
      return originalErrorHandler(message, source, lineno, colno, error);
    }
    return false;
  };

  // قبض الـ Promise rejections غير الملتقطة
  const originalRejectionHandler = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    logError({
      error_message: reason?.message || String(reason),
      error_stack: reason?.stack?.substring(0, 2000) || 'Unhandled Promise Rejection',
      url: window.location.href,
    });

    if (originalRejectionHandler) {
      return originalRejectionHandler.call(window, event);
    }
  };
}

interface ErrorLogEntry {
  error_message: string;
  error_stack?: string;
  url?: string;
  component_stack?: string;
  user_agent?: string;
}

async function logError(entry: ErrorLogEntry) {
  // دايماً سجل في console
  console.error('[Global Error Handler]', entry.error_message, entry.error_stack);

  // حاول تبعت لقاعدة البيانات
  try {
    await supabase.from('error_log').insert({
      ...entry,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // لو الجدول مش موجود أو في مشكلة، نتجاهل بصمت
  }
}
