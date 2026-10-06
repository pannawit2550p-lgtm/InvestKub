'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Keep recently loaded pages responsive while refreshing stale data in the background.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
      },
    },
  }));
  useEffect(() => {
    let previousUser: string | null | undefined;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (previousUser !== undefined && previousUser !== nextUser)) queryClient.clear();
      previousUser = nextUser;
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
