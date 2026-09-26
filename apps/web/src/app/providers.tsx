"use client";

import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ApiRequestError, createApiClient } from "@wedding-yantra/api-client";
import { ApiClientProvider } from "@wedding-yantra/api-client/react";
import { useEffect, useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { CACHE_KEY, clearSession, getToken } from "@/lib/session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const DAY = 24 * 60 * 60 * 1000;
/** A new version of the app starts with a fresh copy, so old data shapes are never shown. */
const BUILD = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "dev";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Kept a day so the last copy can be shown at once when the app is opened again.
            gcTime: DAY,
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

  // The last things seen are kept on this device and shown straight away next time, while
  // fresh data loads behind them. Signing out clears it.
  const [persister] = useState(() =>
    createSyncStoragePersister({ storage: typeof window === "undefined" ? undefined : window.localStorage, key: CACHE_KEY, throttleTime: 2000 }),
  );

  useEffect(() => {
    // Installable app + offline shell. Skipped in development so edits show up at once.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: DAY,
        buster: BUILD,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && !String(q.queryKey[0]).startsWith("public") },
      }}
      // The saved copy shows at once; everything is then checked again in the background.
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <ApiClientProvider client={api}>
        <ToastProvider>{children}</ToastProvider>
      </ApiClientProvider>
    </PersistQueryClientProvider>
  );
}
