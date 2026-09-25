import type { LucideIcon } from "lucide-react";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui/misc";

/** A tab that the next updates will fill. Says plainly what it will do. */
export function ComingSoon({
  title,
  icon,
  heading,
  children,
}: {
  title: string;
  icon: LucideIcon;
  heading: string;
  children: string;
}) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={icon} title={heading} action={<Pill tone="brand">Coming soon</Pill>}>
          {children}
        </EmptyState>
      </Card>
    </>
  );
}
