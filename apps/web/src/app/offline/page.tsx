import { WifiOff } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 pt-12">
      <Logo />
      <EmptyState icon={WifiOff} title="You're offline" className="mt-10">
        Wedding Yantra needs the internet to show your latest data. It will work again as soon as you&apos;re
        back online.
      </EmptyState>
    </main>
  );
}
