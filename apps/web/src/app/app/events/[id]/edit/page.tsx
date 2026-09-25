"use client";

import { useEvent } from "@wedding-yantra/api-client/react";
import { useParams, useRouter } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { EventForm } from "@/components/bookings/event-form";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const event = useEvent(workspace.id, id);
  const router = useRouter();
  const toast = useToast();
  if (event.isPending) return <Splash />;
  if (event.isError) return <Notice tone="danger">{errorMessage(event.error)}</Notice>;
  return (
    <>
      <BackLink href={`/app/events/${id}`} label={event.data.title} />
      <PageHeader title="Edit event" />
      <EventForm
        key={event.data.id}
        event={event.data}
        onSaved={() => {
          toast("Event saved");
          router.replace(`/app/events/${id}`);
        }}
      />
    </>
  );
}
