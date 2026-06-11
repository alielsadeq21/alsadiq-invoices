'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // تسجيل الخطأ في console
    console.error('ErrorBoundary caught:', error, errorInfo);

    // تسجيل الخطأ في قاعدة البيانات
    try {
      const { supabase } = require('@/lib/supabase');
      supabase.from('error_log').insert({
        error_message: error.message,
        error_stack: error.stack?.substring(0, 2000),
        component_stack: errorInfo.componentStack?.substring(0, 2000),
        url: typeof window !== 'undefined' ? window.location.href : '',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp: new Date().toISOString(),
      }).then(() => {}).catch(() => {});
    } catch {
      // لو الجدول مش موجود، نتجاهل
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <Card className="max-w-md w-full border-0 shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">حدث خطأ غير متوقع</h2>
              <p className="text-muted-foreground text-sm mb-6">
                واجهنا مشكلة أثناء تحميل هذه الصفحة. يمكنك المحاولة مرة أخرى أو إعادة تحميل الصفحة.
              </p>
              {this.state.error && (
                <div className="bg-muted p-3 rounded-lg mb-4 text-right">
                  <p className="text-xs text-muted-foreground font-mono break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={this.handleReset} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  حاول تاني
                </Button>
                <Button onClick={this.handleReload}>
                  إعادة تحميل الصفحة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
