"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { UnauthorizedError } from "@/lib/authClient";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          // Never retry a definitive 401 — authedFetch already did its single
          // refresh+retry, and the shared client has routed to sign-in.
          retry: (failureCount, error) =>
            !(error instanceof UnauthorizedError) && failureCount < 1,
          refetchOnWindowFocus: false,
        },
      },
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
