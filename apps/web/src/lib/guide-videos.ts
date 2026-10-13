/** A tutorial video: one that ships with the app, or one the site links to instead. */
export type GuideVideo =
  /** A YouTube video, played in a privacy-friendly player */
  | { kind: "youtube"; href: string; embed: string; poster: string; duration: string | null }
  /** A video file (ours, or an export from an AI video tool); `sound` when we know it talks */
  | {
      kind: "file";
      href: string;
      sources: { src: string; type: string }[];
      poster: string | null;
      duration: string | null;
      sound?: true;
      /** WebVTT captions of what's said */
      captions?: string;
    }
  /** Any other page with the video: opened in a new tab */
  | { kind: "link"; href: string; poster: null; duration: null };

/**
 * A tutorial that ships with the app, in public/videos/ (made by scripts/guide-video/): the real
 * screens with captions of what's said, and the voice-over once it's made.
 */
function builtIn(name: string, duration: string, sound?: true): GuideVideo {
  return {
    kind: "file",
    href: `/videos/${name}.mp4`,
    // MP4 for phones and most browsers; WebM for browsers without H.264.
    sources: [
      { src: `/videos/${name}.mp4`, type: "video/mp4" },
      { src: `/videos/${name}.webm`, type: "video/webm" },
    ],
    poster: `/videos/${name}.jpg`,
    duration,
    ...(sound ? { sound } : {}),
    captions: `/videos/${name}.vtt`,
  };
}

/** "Connect Facebook & Instagram leads", with the owner's voice-over. */
export const FACEBOOK_VIDEO = builtIn("connect-facebook", "1:24", true);
export const FACEBOOK_VIDEO_TITLE = "How to connect your Facebook & Instagram leads";

/** "Add an event and run it": captions only until its voice-over is made. */
export const EVENTS_VIDEO = builtIn("events", "1:45");
export const EVENTS_VIDEO_TITLE = "How to add and run an event";
