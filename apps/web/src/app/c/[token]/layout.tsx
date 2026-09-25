import type { Metadata } from "next";
import type { ReactNode } from "react";

// A client's page carries their bills and payments: keep it out of search engines.
export const metadata: Metadata = {
  title: "Your page",
  robots: { index: false, follow: false },
};

export default function ClientPageLayout({ children }: { children: ReactNode }) {
  return children;
}
