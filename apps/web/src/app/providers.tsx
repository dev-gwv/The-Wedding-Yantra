"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiRequestError, createApiClient } from "@wedding-yantra/api-client";
import { ApiClientProvider } from "@wedding-yantra/api-client/react";
import { useEffect, useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { clearSession, getToken } from "@/lib/session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Don't retry "not allowed" or "not found"; do retry network hiccups once.
            retry: (count, error) =>
              count < 1 && !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
          },
        },
      }),
  );

  const [api] = useState(() =>
    createApiClient({
      baseUrl: API_URL,
      getToken,
      onUnauthorized: () => {
        clearSession();
        queryClient.clear();
        const next = encodeURIComponent(window.location.pathname);
        window.location.replace(`/login?next=${next}`);
      },
    }),
  );

  useEffect(() => {
    // Installable app + offline shell. Skipped in development so edits show up at once.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={api}>
        <ToastProvider>{children}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
