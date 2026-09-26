"use client";

import { useBroadcastAudience, useCreateBroadcast } from "@wedding-yantra/api-client/react";
import { BROADCAST_AUDIENCE_INFO, BROADCAST_AUDIENCES, BROADCAST_PRESETS, renderTemplate, type BroadcastAudience } from "@wedding-yantra/core";
import { broadcastInput } from "@wedding-yantra/types";
import { Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export default function NewMessagePage() {
  return (
    <Suspense fallback={<Splash />}>
      <NewMessage />
    </Suspense>
  );
}

function NewMessage() {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const presetId = useSearchParams().get("preset");
  const start = BROADCAST_PRESETS.find((p) => p.id === presetId) ?? null;
  const create = useCreateBroadcast(workspace.id);
  const [preset, setPreset] = useState<string | null>(start?.id ?? null);
  const [title, setTitle] = useState(start ? `${start.label} ${start.id === "season_offer" || start.id === "win_back" ? "message" : "wishes"}` : "");
  const [message, setMessage] = useState(start?.message ?? "");
  const [audience, setAudience] = useState<BroadcastAudience>(start?.audience ?? "past_clients");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const box = useRef<HTMLTextAreaElement>(null);
  const chosen = useBroadcastAudience(workspace.id, audience);

  function pick(id: string) {
    const p = BROADCAST_PRESETS.find((x) => x.id === id)!;
    setPreset(p.id);
    setTitle(`${p.label} ${p.id === "season_offer" || p.id === "win_back" ? "message" : "wishes"}`);
    setMessage(p.message);
    setAudience(p.audience);
    setErrors({});
  }

  function insert(token: string) {
    const el = box.current;
    const at = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? at;
    setMessage((m) => m.slice(0, at) + token + m.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  }

  async function submit() {
    const payload = { title, message, audience };
    const check = validate(broadcastInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const made = await create.mutateAsync(payload);
      router.push(`/app/messages/${made.id}`);
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  const count = chosen.data?.count;
  const sample = chosen.data?.names[0];
  const preview = renderTemplate(message || "…", { name: sample ?? "Neha", business: workspace.name });

  return (
    <>
      <BackLink href="/app/messages" label="Messages" />
      <PageHeader title="New message" subtitle="Pick an occasion, check the words, then send it one by one from your WhatsApp." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold">Occasion</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {BROADCAST_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p.id)}
                  aria-pressed={preset === p.id}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-sm font-bold transition",
                    preset === p.id ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold">Who gets it</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {BROADCAST_AUDIENCES.map((a) => (
                <AudienceOption key={a} audience={a} selected={audience === a} onPick={() => setAudience(a)} />
              ))}
            </div>
            {errors.audience && <p className="mt-2 text-sm text-danger">{errors.audience}</p>}
          </Card>

          <Card className="space-y-5 p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold">Message</h2>
            <div className="space-y-1.5">
              <label htmlFor="broadcast-message" className="block text-sm font-semibold">
                What it says
              </label>
              <textarea
                id="broadcast-message"
                ref={box}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-invalid={errors.message ? true : undefined}
                placeholder="Happy Diwali, {first_name}! …"
                className={cn(
                  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed focus:border-sun-300 focus:shadow-glow focus:outline-none",
                  errors.message && "border-danger",
                )}
              />
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                Add:
                <button type="button" onClick={() => insert("{first_name}")} className="rounded-full bg-cream px-3 py-1 font-semibold text-ink hover:bg-sun-100">
                  Their first name
                </button>
                <button type="button" onClick={() => insert("{business}")} className="rounded-full bg-cream px-3 py-1 font-semibold text-ink hover:bg-sun-100">
                  Your business name
                </button>
              </div>
              {errors.message && <p className="text-sm text-danger">{errors.message}</p>}
            </div>
            <TextField label="Name for this message" hint="Only you and your team see it" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Diwali wishes 2026" />
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">How it reads{sample ? ` for ${sample}` : ""}</p>
            <div className="mt-3 rounded-2xl rounded-tl-sm bg-success-soft p-4 text-[15px] leading-relaxed whitespace-pre-line text-ink">{preview}</div>
          </Card>
          {errors._ && <Notice tone="danger">{errors._}</Notice>}
          {count === 0 && <Notice tone="warning">Nobody fits this list yet. Pick another list, or add clients with a mobile number.</Notice>}
          <Button size="lg" onClick={submit} loading={create.isPending} disabled={count === 0}>
            {count ? `Make the list: ${count} ${count === 1 ? "person" : "people"}` : "Make the list"}
          </Button>
          <p className="text-center text-sm text-ink-muted">Nothing is sent yet. Next you send each one from WhatsApp.</p>
        </div>
      </div>
    </>
  );
}

function AudienceOption({ audience, selected, onPick }: { audience: BroadcastAudience; selected: boolean; onPick: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const preview = useBroadcastAudience(workspace.id, audience);
  const info = BROADCAST_AUDIENCE_INFO[audience];
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
        selected ? "border-brand bg-cream" : "border-line hover:border-sun-300 hover:bg-cream",
      )}
    >
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", selected ? "border-transparent bg-gradient-primary text-on-brand" : "border-line")}>
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-bold", selected && "text-brand-deep")}>{info.label}</span>
        <span className="block text-sm text-ink-muted">{info.about}</span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular text-ink-muted">{preview.data ? preview.data.count : "…"}</span>
    </button>
  );
}
