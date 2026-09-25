"use client";

import { can, formatDate, formatFollowUp, formatMoney, formatPhone, timeAgo } from "@wedding-yantra/core";
import {
  useAddLeadActivity,
  useDeleteLead,
  useLead,
  useLeads,
  useQuotes,
  useUpdateLead,
} from "@wedding-yantra/api-client/react";
import {
  EVENT_LABELS,
  LOST_LABELS,
  SOURCE_LABELS,
  type Lead,
  type LeadActivity,
  type LostReason,
  type PipelineStage,
} from "@wedding-yantra/types";
import {
  ArrowRightLeft,
  BellRing,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  FileText,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Sparkles,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteRow } from "@/components/bookings/quote-row";
import { FollowUpBadge } from "@/components/sales/follow-up-badge";
import { FollowUpSheet } from "@/components/sales/follow-up-picker";
import { LeadFormSheet } from "@/components/sales/lead-form-sheet";
import { LostSheet } from "@/components/sales/lost-sheet";
import { WhatsAppSheet } from "@/components/sales/whatsapp-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Notice, Pill } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const lead = useLead(workspace.id, id);

  return (
    <>
      <BackLink href="/app/leads" label="Leads" />
      {lead.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {lead.isError && <Notice tone="danger">{errorMessage(lead.error)}</Notice>}
      {lead.data && <LeadView lead={lead.data} />}
    </>
  );
}

function LeadView({ lead }: { lead: Lead }) {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const toast = useToast();
  const stages = useLeads(workspace.id).data?.stages;
  const update = useUpdateLead(workspace.id, lead.id);
  const log = useAddLeadActivity(workspace.id, lead.id);
  const remove = useDeleteLead(workspace.id);
  const [sheet, setSheet] = useState<"edit" | "whatsapp" | "follow-up" | "lost" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const event = [lead.eventType ? EVENT_LABELS[lead.eventType] : null, lead.eventDate ? formatDate(lead.eventDate) : null]
    .filter(Boolean)
    .join(" · ");

  async function moveTo(stage: PipelineStage, lostReason?: LostReason) {
    if (stage.id === lead.stageId) return;
    if (stage.kind === "lost" && !lostReason) return setSheet("lost");
    try {
      await update.mutateAsync({ stageId: stage.id, ...(lostReason ? { lostReason } : {}) });
      setSheet(null);
      toast(stage.kind === "won" ? `Booked! ${lead.name} is now a client` : `Moved to ${stage.name}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function setFollowUp(at: string | null) {
    try {
      await update.mutateAsync({ nextFollowUpAt: at });
      setSheet(null);
      toast(at ? `Follow-up set for ${formatFollowUp(at)}` : "Follow-up cleared");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function deleteLead() {
    try {
      await remove.mutateAsync(lead.id);
      toast("Lead deleted");
      router.replace("/app/leads");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Who, what, when */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(26px,4vw,34px)] font-extrabold leading-tight">{lead.name}</h1>
            {lead.phone && <p className="mt-1 font-semibold text-ink-muted tabular">{formatPhone(lead.phone)}</p>}
            {event && <p className="mt-1 text-ink-muted">{event}</p>}
          </div>
          {lead.budget !== null && (
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Budget</p>
              <p className="font-display text-2xl font-extrabold tabular">{formatMoney(lead.budget)}</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <FollowUpBadge at={lead.nextFollowUpAt} state={lead.followUpState} />
          {lead.stageKind === "won" && <Pill tone="success">Booked</Pill>}
          {lead.stageKind === "lost" && lead.lostReason && <Pill>Lost · {LOST_LABELS[lead.lostReason]}</Pill>}
          {lead.clientId && (
            <Link href={`/app/clients/${lead.clientId}`} className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
              <UserRoundCheck className="size-3.5" /> View client
            </Link>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button onClick={() => setSheet("whatsapp")}>
            <MessageCircle className="size-4" /> WhatsApp
          </Button>
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              onClick={() => log.mutate({ kind: "call" })}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-[15px] font-bold transition hover:border-sun-300 hover:bg-cream"
            >
              <Phone className="size-4" /> Call
            </a>
          ) : (
            <Button variant="secondary" disabled>
              <Phone className="size-4" /> Call
            </Button>
          )}
          {lead.stageKind === "open" && (
            <Button variant="secondary" onClick={() => setSheet("follow-up")}>
              <BellRing className="size-4" /> Follow up
            </Button>
          )}
          <Button variant="secondary" onClick={() => setSheet("edit")}>
            <Pencil className="size-4" /> Edit
          </Button>
        </div>
      </Card>

      {/* Stage */}
      {stages && (
        <section>
          <h2 className="mb-3 font-display text-lg font-extrabold">Stage</h2>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => {
              const current = s.id === lead.stageId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void moveTo(s)}
                  disabled={update.isPending}
                  aria-pressed={current}
                  className={cn(
                    "h-10 rounded-full px-4 text-sm font-bold transition disabled:opacity-60",
                    current
                      ? "bg-gradient-primary text-on-brand shadow-soft"
                      : s.kind === "won"
                        ? "border border-success/40 bg-surface text-success hover:bg-success-soft"
                        : s.kind === "lost"
                          ? "border border-line bg-surface text-ink-muted hover:bg-cream"
                          : "border border-line bg-surface text-ink hover:border-sun-300 hover:bg-cream",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <QuotesAndEvent lead={lead} />

      {/* Details */}
      <Details lead={lead} />

      {/* Note + history */}
      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">History</h2>
        <NoteBox lead={lead} />
        <ol className="mt-4 space-y-1">
          {lead.activities.map((a) => (
            <ActivityRow key={a.id} activity={a} />
          ))}
        </ol>
      </section>

      {can(workspace.role, "leads.delete") && (
        <div className="border-t border-line pt-6">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-muted">Delete {lead.name}? You can&apos;t undo this.</p>
              <Button variant="destructive" size="sm" onClick={deleteLead} loading={remove.isPending}>
                Delete lead
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete lead
            </Button>
          )}
        </div>
      )}

      <LeadFormSheet
        open={sheet === "edit"}
        lead={lead}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          toast("Lead saved");
        }}
      />
      <WhatsAppSheet open={sheet === "whatsapp"} onClose={() => setSheet(null)} lead={lead} />
      <FollowUpSheet
        open={sheet === "follow-up"}
        onClose={() => setSheet(null)}
        onPick={setFollowUp}
        hasCurrent={!!lead.nextFollowUpAt}
        busy={update.isPending}
      />
      <LostSheet
        open={sheet === "lost"}
        onClose={() => setSheet(null)}
        busy={update.isPending}
        onPick={(reason) => {
          const lost = stages?.find((s) => s.kind === "lost");
          if (lost) void moveTo(lost, reason);
        }}
      />
    </div>
  );
}

/** The lead's quotes and, once booked, its event. */
function QuotesAndEvent({ lead }: { lead: Lead }) {
  const { workspace } = useCurrentWorkspace();
  const canView = can(workspace.role, "quotes.view");
  const quotes = useQuotes(workspace.id, { leadId: lead.id }, canView);
  if (!canView && !lead.eventId) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Quotes</h2>
        {can(workspace.role, "quotes.manage") && lead.stageKind !== "lost" && (
          <ButtonLink href={`/app/quotes/new?leadId=${lead.id}`} variant={quotes.data?.length ? "secondary" : "primary"} size="sm">
            <FileText className="size-4" /> Make a quote
          </ButtonLink>
        )}
      </div>
      {lead.eventId && (
        <Link
          href={`/app/events/${lead.eventId}`}
          className="mb-3 flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 font-semibold text-success"
        >
          <CalendarDays className="size-5" /> Booked. Open the event
          <ChevronRight className="ml-auto size-4" />
        </Link>
      )}
      {quotes.data && quotes.data.length > 0 ? (
        <Card className="divide-y divide-line overflow-hidden">
          {quotes.data.map((q) => (
            <QuoteRow key={q.id} quote={q} />
          ))}
        </Card>
      ) : (
        canView && quotes.data && <p className="text-sm text-ink-muted">No quotes yet. Pick services from your price list and send it on WhatsApp.</p>
      )}
    </section>
  );
}

function Details({ lead }: { lead: Lead }) {
  const rows: [string, string | null][] = [
    ["Came from", SOURCE_LABELS[lead.source]],
    ["Venue", lead.venue],
    ["City", lead.city],
    ["Guests", lead.guestCount !== null ? lead.guestCount.toLocaleString("en-IN") : null],
    ["Email", lead.email],
    ["Referred by", lead.referredBy],
    ["Handled by", lead.assignedTo?.name ?? (lead.assignedTo ? "Team member" : "Nobody yet")],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">Details</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {shown.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
            <dd className="mt-0.5 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {lead.requirements && (
        <div className="mt-4 rounded-2xl bg-cream p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">What they need</p>
          <p className="mt-1 whitespace-pre-line">{lead.requirements}</p>
        </div>
      )}
    </Card>
  );
}

function NoteBox({ lead }: { lead: Lead }) {
  const { workspace } = useCurrentWorkspace();
  const add = useAddLeadActivity(workspace.id, lead.id);
  const toast = useToast();
  const [note, setNote] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await add.mutateAsync({ kind: "note", body: note.trim() });
      setNote("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <label className="flex-1">
        <span className="sr-only">Add a note</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note: what they said, what's next"
          className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
        />
      </label>
      <Button type="submit" variant="secondary" loading={add.isPending} disabled={!note.trim()} className="h-12">
        Add
      </Button>
    </form>
  );
}

const ACTIVITY_ICONS = {
  created: Sparkles,
  note: NotebookPen,
  call: Phone,
  whatsapp: MessageCircle,
  stage_changed: ArrowRightLeft,
  follow_up_set: BellRing,
  assigned: UserRound,
} as const;

function describe(a: LeadActivity): string {
  const who = a.actor?.name ?? "Someone";
  const m = a.meta as Record<string, string | null | undefined>;
  switch (a.kind) {
    case "created":
      return m.source === "enquiry_form" ? "Sent your enquiry form" : `${who} added this lead`;
    case "note":
      // Notes without a person came from the client's quote link.
      return a.actor?.name ?? (m.quoteId ? "Quote link" : who);
    case "call":
      return `${who} called`;
    case "whatsapp":
      return `${who} sent a WhatsApp${a.body ? `: ${a.body}` : ""}`;
    case "stage_changed":
      if (m.kind === "won" && m.via === "quote" && !a.actor) return `${m.by ?? "The client"} accepted quote ${m.quote ?? ""} on the link`;
      return m.kind === "won"
        ? `${who} marked it Booked`
        : `${who} moved it from ${m.from ?? "?"} to ${m.to ?? "?"}${m.reason ? ` (${LOST_LABELS[m.reason as LostReason] ?? m.reason})` : ""}`;
    case "follow_up_set":
      return m.at ? `${who} set a follow-up for ${formatFollowUp(m.at)}` : `${who} cleared the follow-up`;
    case "assigned":
      return m.toName ? `${who} gave it to ${m.toName}` : `${who} unassigned it`;
  }
}

function ActivityRow({ activity }: { activity: LeadActivity }) {
  const Icon = activity.kind === "stage_changed" && activity.meta.kind === "won" ? CircleCheck : ACTIVITY_ICONS[activity.kind];
  return (
    <li className="flex gap-3 rounded-2xl px-1 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{describe(activity)}</span>
          <span className="text-ink-muted"> · {timeAgo(activity.createdAt)}</span>
        </p>
        {activity.kind === "note" && activity.body && <p className="mt-1 whitespace-pre-line text-[15px]">{activity.body}</p>}
      </div>
    </li>
  );
}
