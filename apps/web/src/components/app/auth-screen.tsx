import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";

/**
 * PhotoLancer's sign-in layout: the golden-hour glow fills the page, and everything you
 * do sits in one white card in the middle. Used for sign-in, business setup and invites.
 */
export function AuthScreen({
  children,
  wide = false,
  topRight,
}: {
  children: ReactNode;
  wide?: boolean;
  topRight?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-hero">
      <main
        className={cn(
          "mx-auto flex min-h-dvh w-full flex-col justify-center px-4 py-10 sm:px-5",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="mb-8 flex items-center justify-center gap-4">
          <Logo />
          {topRight}
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft sm:p-8">{children}</div>
      </main>
    </div>
  );
}
