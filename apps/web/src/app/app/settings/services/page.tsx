"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Splash } from "@/components/ui/spinner";

/** The price list moved to Master data, Services and packages. */
export default function OldServicesPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    router.replace(`/app/services${params.toString() ? `?${params.toString()}` : ""}`);
  }, [router, params]);
  return <Splash />;
}
