"use client";

import { useRouter } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { EventForm } from "@/components/bookings/event-form";
import { PageHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export default function NewEventPage() {
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <BackLink href="/app/events" label="Events" />
      <PageHeader title="New event" subtitle="Events also appear by themselves when a client accepts a quote." />
      <EventForm
        onSaved={(event) => {
          toast("Event created");
          router.replace(`/app/events/${event.id}`);
        }}
      />
    </>
  );
}
