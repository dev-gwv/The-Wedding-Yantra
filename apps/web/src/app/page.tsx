"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Splash } from "@/components/ui/spinner";
import { useToken } from "@/lib/session";

/** The front door: straight into the app when signed in, otherwise to sign-in. */
export default function IndexPage() {
  const token = useToken();
  const router = useRouter();

  useEffect(() => {
    if (token === undefined) return;
    router.replace(token ? "/app" : "/login");
  }, [token, router]);

  return <Splash />;
}
