import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "@/components/app/auth-screen";
import { Spinner } from "@/components/ui/spinner";
import { DeletionStatus } from "./deletion-status";

export const metadata: Metadata = {
  title: "Facebook data deletion",
  description: "Where your request to delete the data Wedding Yantra got from Facebook stands.",
  robots: { index: false },
};

/** The page Facebook links to after someone asks Wedding Yantra to delete their data. */
export default function MetaDeletionPage() {
  return (
    <AuthScreen>
      <h1 className="sr-only">Facebook data deletion</h1>
      <Suspense
        fallback={
          <div className="flex justify-center py-10 text-brand">
            <Spinner className="size-7" />
          </div>
        }
      >
        <DeletionStatus />
      </Suspense>
    </AuthScreen>
  );
}
