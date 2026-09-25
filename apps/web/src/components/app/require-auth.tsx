"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Splash } from "@/components/ui/spinner";
import { useToken } from "@/lib/session";

/** Sends signed-out visitors to the sign-in screen, then back here afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useToken();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (token === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [token, router, pathname]);

  if (!token) return <Splash />;
  return <>{children}</>;
}
