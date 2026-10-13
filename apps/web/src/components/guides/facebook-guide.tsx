import { CircleCheck, ExternalLink, Info, Lightbulb, PlayCircle, Search, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { GuidePicture } from "@/components/guides/guide-pictures";
import { GUIDE_DONE, GUIDE_FAQ, GUIDE_PARTS, type GuideStep, type GuideVideo } from "@/lib/facebook-guide";
import { cn } from "@/lib/cn";

/*
 * The Facebook guide itself: before you start, connect, and what to do if something goes
 * wrong. No hooks, so the public page renders it on the server and Leads renders it in the app.
 */

function VideoBlock({ video }: { video: GuideVideo }) {
  if (video.embed) {
    return (
      <section aria-label="Video" className="overflow-hidden rounded-3xl border border-line bg-ink/5 shadow-soft">
        <div className="relative aspect-video">
          <iframe
            src={video.embed}
            title="How to connect your Facebook lead ads (video)"
            className="absolute inset-0 size-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </section>
    );
  }
  return (
    <a href={video.href} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
      <PlayCircle className="size-4" /> Watch the video
    </a>
  );
}

function StepBody({ step, mode }: { step: GuideStep; mode: "public" | "app" }) {
  return (
    <div className="min-w-0 space-y-2.5">
      <h3 className="font-display text-lg font-extrabold leading-snug">{step.title}</h3>
      {mode === "app" && step.inApp && (
        <p className="inline-flex rounded-full bg-success-soft px-3 py-1 text-sm font-bold text-success">{step.inApp}</p>
      )}
      <ul className="space-y-1.5 text-[15px] leading-relaxed">
        {step.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {step.check && (
        <p className="flex gap-2 rounded-xl bg-cream px-3 py-2.5 text-sm leading-relaxed">
          <Search className="mt-0.5 size-4 shrink-0 text-brand-strong" />
          <span>
            <strong>How to check:</strong> {step.check}
          </span>
        </p>
      )}
      {step.ifNot && (
        <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong>If not:</strong> {step.ifNot}
          </span>
        </p>
      )}
      {step.tip && (
        <p className="flex gap-2 rounded-xl bg-success-soft/60 px-3 py-2.5 text-sm leading-relaxed">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            <strong>Tip:</strong> {step.tip}
          </span>
        </p>
      )}
      {step.link && (
        <a href={step.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong hover:text-brand-deep">
          {step.link.label} <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/** Steps are numbered straight through the parts: where each part's numbering starts. */
const PART_START = GUIDE_PARTS.map((_, i) => GUIDE_PARTS.slice(0, i).reduce((n, p) => n + p.steps.length, 0));

export function FacebookGuide({
  mode,
  video,
  share,
}: {
  mode: "public" | "app";
  video: GuideVideo | null;
  /** "Send this guide on WhatsApp", placed after the intro */
  share?: ReactNode;
}) {
  return (
    <div className="space-y-10">
      <nav aria-label="Parts of the guide" className="flex flex-wrap gap-2">
        {[...GUIDE_PARTS.map((p) => ({ id: p.id, title: p.title })), { id: "problems", title: "If something goes wrong" }].map((p) => (
          <a key={p.id} href={`#${p.id}`} className="rounded-full bg-cream px-4 py-2 text-sm font-bold text-ink hover:bg-sun-100">
            {p.title}
          </a>
        ))}
      </nav>

      {video && <VideoBlock video={video} />}
      {share}

      {GUIDE_PARTS.map((part, partIndex) => (
        <section key={part.id} id={part.id} className="scroll-mt-6">
          <p className="text-xs font-extrabold uppercase tracking-wider text-brand-strong">
            Part {partIndex + 1} · {part.where}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">{part.title}</h2>
          <p className="mt-1 text-ink-muted">{part.intro}</p>
          <ol className="mt-5 space-y-5">
            {part.steps.map((step, stepIndex) => {
              const number = PART_START[partIndex]! + stepIndex + 1;
              return (
                <li key={step.id} id={`step-${step.id}`} className="scroll-mt-6 rounded-3xl border border-line bg-surface p-5 shadow-soft sm:p-6">
                  <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_290px] md:items-start">
                    <div className="flex gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-primary font-display text-base font-extrabold text-on-brand">
                        {number}
                      </span>
                      <StepBody step={step} mode={mode} />
                    </div>
                    {step.picture && <GuidePicture kind={step.picture} />}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <section className="rounded-3xl border border-success/30 bg-success-soft p-5 sm:p-6">
        <p className="flex items-center gap-2 font-display text-xl font-extrabold text-success">
          <CircleCheck className="size-6" /> Done
        </p>
        {GUIDE_DONE.map((l) => (
          <p key={l} className="mt-2 text-[15px] leading-relaxed">
            {l}
          </p>
        ))}
      </section>

      <section id="problems" className="scroll-mt-6">
        <p className="text-xs font-extrabold uppercase tracking-wider text-brand-strong">Part 3 · Help</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">If something goes wrong</h2>
        <div className="mt-4 divide-y divide-line rounded-3xl border border-line bg-surface shadow-soft">
          {GUIDE_FAQ.map((f) => (
            <details key={f.id} id={`faq-${f.id}`} className="group scroll-mt-6 px-5 py-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <span aria-hidden className="text-xl leading-none text-brand-strong transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink">
                {f.lines?.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                {f.steps && (
                  <ol className="space-y-2">
                    {f.steps.map((s, i) => (
                      <li key={s} className="flex gap-2.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cream text-xs font-extrabold text-brand-strong">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {f.link && (
                  <a href={f.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong hover:text-brand-deep">
                    {f.link.label} <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </details>
          ))}
        </div>
        <p className={cn("mt-4 flex gap-2 px-1 text-sm text-ink-muted")}>
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>Only lead form (Instant Form) ads come into Leads. WhatsApp and Messenger ads start a chat instead.</span>
        </p>
      </section>
    </div>
  );
}
