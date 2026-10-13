"use client";

import { can } from "@wedding-yantra/core";
import { Play, Volume2, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { GuideVideoPlayer } from "@/components/guides/video-player";
import { ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useDeviceFlag } from "@/lib/device-flag";
import { APP_GUIDE_PATH, FACEBOOK_SETTINGS_PATH, guideVideo } from "@/lib/facebook-guide";
import { EVENTS_VIDEO, EVENTS_VIDEO_TITLE, FACEBOOK_VIDEO_TITLE, type GuideVideo } from "@/lib/guide-videos";

function Cover({ video, className }: { video: GuideVideo; className: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-gradient-primary ${className}`}>
      {video.poster && (
        // eslint-disable-next-line @next/next/no-img-element -- the cover may be YouTube's; a plain lazy image is enough
        <img src={video.poster} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      )}
      <span className="absolute inset-0 grid place-items-center bg-ink/15">
        <span className="grid size-9 place-items-center rounded-full bg-surface/95 text-brand-strong shadow-soft">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
      </span>
    </span>
  );
}

/**
 * Bottom-right of a page: "Watch · 1:24 · With sound" and what the video shows. Tapping it plays
 * the tutorial; × puts it away on this device.
 */
export function GuideVideoBubble({
  video,
  title,
  label,
  closedKey,
  stepsHref,
  description,
  children,
}: {
  video: GuideVideo;
  /** The player's name for screen readers, e.g. "How to add and run an event" */
  title: string;
  /** The card's line and the sheet's heading, e.g. "Add and run an event" */
  label: string;
  /** Remembers × on this device */
  closedKey: string;
  /** Where the written steps are, if the video can't play */
  stepsHref: string;
  description?: string;
  /** Buttons under the video */
  children?: ReactNode;
}) {
  const [closed, close] = useDeviceFlag(closedKey);
  const [open, setOpen] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const sound = video.kind === "file" && video.sound;

  if (closed) return null;

  function watch() {
    if (video.kind === "link") {
      window.open(video.href, "_blank", "noopener,noreferrer");
      return;
    }
    // Open the sheet now and start the video inside this tap: iPhones only play with sound
    // when play() comes straight from a tap. If it's still refused, its play button is there.
    flushSync(() => setOpen(true));
    player.current?.play().catch(() => {});
  }

  return (
    <>
      {/* Room at the end of the list, so the last row can scroll clear of the card. */}
      <div aria-hidden className="h-24 sm:h-72 print:hidden" />
      <div className="fixed bottom-24 right-4 z-30 print:hidden lg:bottom-8 lg:right-8" role="complementary" aria-label="Tutorial video">
        <div className="relative">
          <button
            type="button"
            onClick={watch}
            className="group flex w-[min(19rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-sun-300/70 bg-surface p-2 pr-9 text-left shadow-warm transition hover:border-brand sm:w-72 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0 sm:pr-0"
          >
            <Cover video={video} className="h-12 w-20 rounded-xl sm:aspect-video sm:h-auto sm:w-full sm:rounded-b-none sm:rounded-t-2xl" />
            <span className="min-w-0 sm:px-4 sm:py-3">
              <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-brand-strong">
                Watch{video.duration ? ` · ${video.duration}` : ""}
                {sound && (
                  <>
                    <span aria-hidden>·</span>
                    <Volume2 aria-hidden className="size-3.5" strokeWidth={2.5} />
                    {/* The slim phone card has room for the speaker only */}
                    <span className="max-sm:sr-only">With sound</span>
                  </>
                )}
              </span>
              <span className="block text-sm font-bold leading-snug text-ink">{label}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close the video"
            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-surface/95 text-ink-muted shadow-soft hover:text-ink sm:right-2 sm:top-2"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={`${sound ? "Turn your sound on. " : ""}${description ?? "Watch how it's done, then follow the steps."}`}
        className="sm:max-w-2xl"
      >
        <div className="space-y-4">
          <GuideVideoPlayer video={video} title={title} autoPlay videoRef={player} stepsHref={stepsHref} />
          {children}
        </div>
      </Sheet>
    </>
  );
}

/** On Leads, for everyone: how to connect Facebook & Instagram lead ads. */
export function FacebookVideoBubble() {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace, "members.hr");
  return (
    <GuideVideoBubble
      video={guideVideo()}
      title={FACEBOOK_VIDEO_TITLE}
      label="Connect Facebook & Instagram leads"
      closedKey="wy.fb-video-closed"
      stepsHref={APP_GUIDE_PATH}
    >
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={APP_GUIDE_PATH} variant="secondary">
          Read the steps
        </ButtonLink>
        {owner && <ButtonLink href={FACEBOOK_SETTINGS_PATH}>Connect now</ButtonLink>}
      </div>
      {!owner && <p className="text-sm text-ink-muted">Only the business owner can connect Facebook. Show them this video.</p>}
    </GuideVideoBubble>
  );
}

/** On Events, for people who can add events: how to add one and run it. */
export function EventsVideoBubble() {
  return (
    <GuideVideoBubble
      video={EVENTS_VIDEO}
      title={EVENTS_VIDEO_TITLE}
      label="Add and run an event"
      closedKey="wy.events-video-closed"
      stepsHref="/help#events"
      description="Watch how it's done, then add your own."
    >
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/events/new">Add an event</ButtonLink>
      </div>
    </GuideVideoBubble>
  );
}
