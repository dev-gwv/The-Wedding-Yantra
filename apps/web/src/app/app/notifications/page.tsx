"use client";

import { NOTIFICATION_GROUPS, timeAgo, type NotificationGroup, type NotificationKind } from "@wedding-yantra/core";
import { useAlertPrefs, useAlerts, useApi, useMarkAlertsRead, useSaveAlertPrefs, useTestAlert } from "@wedding-yantra/api-client/react";
import type { NotificationItem, NotificationPrefs } from "@wedding-yantra/types";
import {
  AlarmClock,
  AtSign,
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  CircleCheck,
  CirclePause,
  ClipboardList,
  Moon,
  MessageSquare,
  Send,
  Smartphone,
  Sun,
  TriangleAlert,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { enablePush, pushState, type PushState } from "@/lib/push";

const KIND_ICON: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  "task.assigned": { icon: ClipboardList, tone: "bg-sun-50 text-brand-strong" },
  "task.due_soon": { icon: AlarmClock, tone: "bg-sun-50 text-brand-strong" },
  "task.overdue": { icon: TriangleAlert, tone: "bg-danger-soft text-danger" },
  "task.submitted": { icon: Upload, tone: "bg-[#EEF2FF] text-[#4338CA]" },
  "task.approved": { icon: CircleCheck, tone: "bg-success-soft text-success" },
  "task.sent_back": { icon: Undo2, tone: "bg-warning-soft text-warning" },
  "task.done": { icon: CircleCheck, tone: "bg-success-soft text-success" },
  "task.stuck": { icon: CirclePause, tone: "bg-warning-soft text-warning" },
  "task.commented": { icon: MessageSquare, tone: "bg-cream text-ink-muted" },
  "task.mentioned": { icon: AtSign, tone: "bg-sun-50 text-brand-strong" },
  "digest.morning": { icon: Sun, tone: "bg-sun-50 text-brand-strong" },
  "digest.evening": { icon: Moon, tone: "bg-cream text-ink" },
  test: { icon: Bell, tone: "bg-cream text-ink-muted" },
};

function AlertsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") === "settings" ? "settings" : "alerts";

  return (
    <>
      <PageHeader title="Alerts" subtitle="Tasks given to you, reminders, hand-ins and the day's round-ups" />
      <div className="mb-6 inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Alerts">
        {(
          [
            ["alerts", "Alerts"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => router.replace(key === "alerts" ? pathname : `${pathname}?tab=settings`)}
            className={cn("h-10 rounded-xl px-5 text-sm font-bold transition sm:px-7", tab === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "alerts" ? <AlertList /> : <AlertSettings />}
    </>
  );
}

/** Whether this phone gets alerts, as it stands right now. */
function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    let live = true;
    void pushState().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);
  return [state, setState] as const;
}

function AlertList() {
  const { workspace } = useCurrentWorkspace();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const alerts = useAlerts(workspace.id, unreadOnly);
  const markRead = useMarkAlertsRead(workspace.id);
  const router = useRouter();
  const [push] = usePushState();
  const items = alerts.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = alerts.data?.pages[0]?.unread ?? 0;

  function open(a: NotificationItem) {
    if (!a.read) markRead.mutate({ ids: [a.id] });
    if (a.link) router.push(a.link);
  }

  return (
    <>
      {(push === "off" || push === "needs-install") && (
        <Card className="mb-5 flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun-50 text-brand-strong">
            <BellRing className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Get these on your phone</span>
            <span className="block text-sm text-ink-muted">
              {push === "needs-install"
                ? "On iPhone, tap Share → Add to Home Screen, open the app from there, then turn alerts on."
                : "New tasks and reminders reach you even when the app is closed."}
            </span>
          </span>
          {push === "off" && (
            <Button size="sm" onClick={() => router.push("/app/notifications?tab=settings")}>
              Turn on
            </Button>
          )}
        </Card>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              [false, "All"],
              [true, `Unread${unread ? ` (${unread})` : ""}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={unreadOnly === value}
              onClick={() => setUnreadOnly(value)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-bold transition",
                unreadOnly === value ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-cream",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <Button size="sm" variant="ghost" loading={markRead.isPending} onClick={() => markRead.mutate({ all: true })}>
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        )}
      </div>

      {alerts.isPending ? (
        <div className="grid place-items-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : alerts.isError ? (
        <Notice tone="danger">{errorMessage(alerts.error)}</Notice>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title={unreadOnly ? "All read" : "No alerts yet"}>
          {unreadOnly ? "You're up to date." : "When someone gives you a task, hands in work or comments, it shows up here."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((a) => {
              const k = KIND_ICON[a.kind] ?? KIND_ICON.test;
              const Icon = k.icon;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => open(a)} className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-cream sm:px-5", !a.read && "bg-sun-50/50")}>
                    <span className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl", k.tone)}>
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block leading-snug", a.read ? "font-semibold" : "font-bold")}>{a.title}</span>
                      {a.body && <span className="mt-0.5 block whitespace-pre-line text-sm text-ink-muted">{a.body}</span>}
                      <span className="mt-1 block text-xs text-ink-subtle">{timeAgo(a.createdAt)}</span>
                    </span>
                    {!a.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {alerts.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="ghost" size="sm" loading={alerts.isFetchingNextPage} onClick={() => void alerts.fetchNextPage()}>
                Show older
              </Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", checked ? "bg-brand" : "bg-line-strong")}
    >
      <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
    </button>
  );
}

function AlertSettings() {
  const { workspace } = useCurrentWorkspace();
  const prefs = useAlertPrefs(workspace.id);
  if (prefs.isPending) return <Splash />;
  if (prefs.isError) return <Notice tone="danger">{errorMessage(prefs.error)}</Notice>;
  return <SettingsForm key={JSON.stringify(prefs.data)} prefs={prefs.data} />;
}

function SettingsForm({ prefs }: { prefs: NotificationPrefs }) {
  const { workspace } = useCurrentWorkspace();
  const api = useApi();
  const save = useSaveAlertPrefs(workspace.id);
  const test = useTestAlert(workspace.id);
  const toast = useToast();
  const [push, setPushState] = usePushState();
  const [turningOn, setTurningOn] = useState(false);
  const [off, setOff] = useState<NotificationGroup[]>(prefs.off);
  const [pushOn, setPushOn] = useState(prefs.push);
  const [quiet, setQuiet] = useState(prefs.quietFrom !== null);
  const [from, setFrom] = useState(prefs.quietFrom ?? "22:00");
  const [to, setTo] = useState(prefs.quietTo ?? "07:00");

  const dirty =
    JSON.stringify([...off].sort()) !== JSON.stringify([...prefs.off].sort()) ||
    pushOn !== prefs.push ||
    quiet !== (prefs.quietFrom !== null) ||
    (quiet && (from !== prefs.quietFrom || to !== prefs.quietTo));

  async function turnOn() {
    setTurningOn(true);
    try {
      const state = await enablePush(api);
      setPushState(state);
      if (state === "on") toast("Alerts are on for this phone");
      else if (state === "blocked") toast("Alerts are blocked in this browser's settings", "error");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setTurningOn(false);
    }
  }

  function submit() {
    save.mutate(
      { off, push: pushOn, quietFrom: quiet ? from : null, quietTo: quiet ? to : null },
      { onSuccess: () => toast("Saved"), onError: (err) => toast(errorMessage(err), "error") },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", push === "on" ? "bg-success-soft text-success" : "bg-cream text-ink-muted")}>
            {push === "on" ? <Smartphone className="size-5" /> : <BellOff className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">This phone</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {push === null
                ? "Checking…"
                : push === "on"
                  ? "Alerts arrive here even when the app is closed."
                  : push === "needs-install"
                    ? "On iPhone, alerts need the app on your Home Screen: tap Share → Add to Home Screen, open it from there, and turn alerts on."
                    : push === "blocked"
                      ? "Alerts are blocked for this site. Allow notifications in the browser's site settings, then come back."
                      : push === "unsupported"
                        ? "This browser can't show alerts. Try Chrome on Android, or the app from your iPhone's Home Screen."
                        : "Turn on to get new tasks and reminders when the app is closed."}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {prefs.devices === 0 ? "No phones or computers get your alerts yet." : `${prefs.devices} phone${prefs.devices === 1 ? "" : "s"} or computer${prefs.devices === 1 ? "" : "s"} get your alerts.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {push === "off" && (
                <Button size="sm" loading={turningOn} onClick={() => void turnOn()}>
                  <BellRing className="size-4" /> Turn on alerts
                </Button>
              )}
              {push === "on" && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={test.isPending}
                  onClick={() => test.mutate(undefined, { onSuccess: () => toast("Sent. It should arrive in a few seconds."), onError: (err) => toast(errorMessage(err), "error") })}
                >
                  <Send className="size-4" /> Send a test
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">What reaches you</h2>
        <Card className="divide-y divide-line overflow-hidden">
          {NOTIFICATION_GROUPS.map((g) => {
            const on = !off.includes(g.key);
            return (
              <div key={g.key} className="flex items-center gap-4 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{g.label}</span>
                  <span className="block text-sm text-ink-muted">{g.about}</span>
                </span>
                <Switch label={g.label} checked={on} onChange={(v) => setOff(v ? off.filter((k) => k !== g.key) : [...off, g.key])} />
              </div>
            );
          })}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">On your phone</h2>
        <Card className="divide-y divide-line overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Buzz my phone</span>
              <span className="block text-sm text-ink-muted">Off: alerts stay here in the app only</span>
            </span>
            <Switch label="Buzz my phone" checked={pushOn} onChange={setPushOn} />
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-4">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Quiet hours</span>
                <span className="block text-sm text-ink-muted">No buzzing at night. Alerts wait here for the morning.</span>
              </span>
              <Switch label="Quiet hours" checked={quiet} onChange={setQuiet} disabled={!pushOn} />
            </div>
            {quiet && pushOn && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                From
                <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Quiet from" className="h-10 rounded-xl border border-line bg-surface px-3 tabular" />
                to
                <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Quiet until" className="h-10 rounded-xl border border-line bg-surface px-3 tabular" />
              </div>
            )}
          </div>
        </Card>
      </section>

      <div className="flex gap-3">
        <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Splash />}>
      <AlertsPage />
    </Suspense>
  );
}
