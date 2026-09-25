import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}
