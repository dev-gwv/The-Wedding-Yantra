"use client";

import { ExternalLink, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import type { GuideVideo } from "@/lib/facebook-guide";
import { cn } from "@/lib/cn";

const TITLE = "How to connect your Facebook & Instagram leads (video)";

/**
 * The tutorial video, 16:9: YouTube in a privacy-friendly player, a video file in the
 * browser's own player, or a button for anything else. Nothing downloads until play is
 * pressed (phones on mobile data), unless `autoPlay` because someone just tapped to watch.
 */
export function GuideVideoPlayer({
  video,
  autoPlay = false,
  stepsHref,
  className,
}: {
  video: GuideVideo;
  autoPlay?: boolean;
  /** Where the written steps are, offered if the video can't play */
  stepsHref?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (video.kind === "link") {
    return (
      <a href={video.href} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", className })}>
        <PlayCircle className="size-4" /> Watch the video <ExternalLink className="size-3.5" />
      </a>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl bg-ink shadow-soft", className)}>
      <div className="relative aspect-video">
        {video.kind === "youtube" ? (
          <iframe
            src={`${video.embed}${autoPlay ? "&autoplay=1" : ""}`}
            title={TITLE}
            className="absolute inset-0 size-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading={autoPlay ? "eager" : "lazy"}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : failed ? (
          <div className="absolute inset-0 grid place-items-center bg-cream p-6 text-center">
            <div>
              <p className="font-bold text-ink">This video can&apos;t play here.</p>
              {stepsHref && (
                <Link href={stepsHref} className="mt-2 inline-flex font-bold text-brand-strong hover:text-brand-deep">
                  Read the steps instead →
                </Link>
              )}
            </div>
          </div>
        ) : (
          <video
            className="absolute inset-0 size-full bg-ink object-contain"
            controls
            playsInline
            autoPlay={autoPlay}
            preload={autoPlay ? "auto" : "none"}
            poster={video.poster ?? undefined}
            aria-label={TITLE}
            // React passes a <source>'s error up to here too; only the video's own error counts,
            // so a browser without H.264 still goes on to try the WebM.
            onError={(e) => {
              if (e.target === e.currentTarget) setFailed(true);
            }}
          >
            {video.sources.map((s, i) => (
              <source
                key={s.src}
                src={s.src}
                type={s.type}
                // The browser tries each file in turn; only the last one failing means it can't play at all.
                onError={i === video.sources.length - 1 ? () => setFailed(true) : undefined}
              />
            ))}
          </video>
        )}
      </div>
    </div>
  );
}
