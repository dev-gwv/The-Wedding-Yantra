"use client";

import { can } from "@wedding-yantra/core";
import { Play, X } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { GuideVideoPlayer } from "@/components/guides/video-player";
import { ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useDeviceFlag } from "@/lib/device-flag";
import { APP_GUIDE_PATH, FACEBOOK_SETTINGS_PATH, guideVideo, type GuideVideo } from "@/lib/facebook-guide";

const CLOSED_KEY = "wy.fb-video-closed";

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
 * Bottom-right of Leads, for everyone: "Watch: connect Facebook & Instagram leads". Tapping it
 * plays the tutorial; × puts it away on this device (the video stays in the guide).
 */
export function GuideVideoBubble() {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace, "members.hr");
  const [closed, close] = useDeviceFlag(CLOSED_KEY);
  const [open, setOpen] = useState(false);
  const video = guideVideo();

  if (closed) return null;

  function watch() {
    if (video.kind === "link") window.open(video.href, "_blank", "noopener,noreferrer");
    else setOpen(true);
  }

  return (
    <>
      {/* Room at the end of the list, so the last lead can scroll clear of the card. */}
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
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-strong">
                Watch{video.duration ? ` · ${video.duration}` : ""}
              </span>
              <span className="block text-sm font-bold leading-snug text-ink">Connect Facebook & Instagram leads</span>
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
        title="Connect Facebook & Instagram leads"
        description="Watch how it's done, then follow the steps."
        className="sm:max-w-2xl"
      >
        <div className="space-y-4">
          <GuideVideoPlayer video={video} autoPlay stepsHref={APP_GUIDE_PATH} />
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={APP_GUIDE_PATH} variant="secondary">
              Read the steps
            </ButtonLink>
            {owner && <ButtonLink href={FACEBOOK_SETTINGS_PATH}>Connect now</ButtonLink>}
          </div>
          {!owner && <p className="text-sm text-ink-muted">Only the business owner can connect Facebook. Show them this video.</p>}
        </div>
      </Sheet>
    </>
  );
}
