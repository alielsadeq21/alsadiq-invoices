'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,     // البيانات صالحة لمدة دقيقتين
            gcTime: 5 * 60 * 1000,        // تتمسك في الذاكرة 5 دقائق
            retry: 1,                       // محاولة إعادة واحدة بس
            refetchOnWindowFocus: false,    // ما يعملش refetch لما تفتح التاب
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
