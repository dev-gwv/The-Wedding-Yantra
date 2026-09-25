"use client";

import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { buttonClass } from "@/components/ui/button";
import { useToken } from "@/lib/session";

/** The website's top bar. Someone already signed in goes straight to the app. */
export function SiteHeader() {
  const token = useToken();
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
      <Link href="/" aria-label="Wedding Yantra home">
        <Logo className="[&_svg]:size-9 [&>span:last-child]:text-lg sm:[&>span:last-child]:text-xl" />
      </Link>
      <nav className="flex items-center gap-2">
        <a href="#pricing" className="hidden px-3 text-sm font-semibold text-ink-muted hover:text-ink sm:inline">
          Prices
        </a>
        {token ? (
          <Link href="/app" className={buttonClass({ size: "sm" })}>
            Open the app
          </Link>
        ) : (
          <>
            <Link href="/login" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/login" className={buttonClass({ size: "sm", className: "hidden sm:inline-flex" })}>
              Start free
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
