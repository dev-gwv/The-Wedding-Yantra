# Tutorial videos

The real Wedding Yantra screens, driven step by step by a script, with big captions of the words
being said (a sentence at a time) and the owner's ElevenLabs voice-over. Each video is in
`apps/web/public/videos/` as `<video>.mp4`, a `.webm` for browsers without H.264, a `.vtt` with
the captions for the player, and its cover, `<video>.jpg`.

| Video | Where it shows | Script (the lines, also the captions) | Voice |
|---|---|---|---|
| `connect-facebook` | Bottom-right of Leads, and the top of the Facebook guide | `docs/video-scripts/connect-facebook-voiceover.md` | done |
| `events` | Bottom-right of Events (for people who can add events), and Help → Events | `docs/video-scripts/events-voiceover.md` | done |
| `my-tasks` | (next: the video comes once the voice is made) | `docs/video-scripts/my-tasks-voiceover.md` | not yet |

Their lengths (and whether they have sound) are in `apps/web/src/lib/guide-videos.ts`. Setting
`NEXT_PUBLIC_FACEBOOK_GUIDE_VIDEO_URL` on Vercel (a YouTube link, or a direct `.mp4` link)
replaces the Facebook one, for example with an AI presenter video made from
`docs/video-scripts/connect-facebook-ai-presenter.md`.

The voice is `assets/voiceover/<video>/voiceover.mp3`: all the lines in one file, with a 1.5 s
break between lines. `lines.json` next to it says where each line is and when each of its
sentences starts. Each scene stays on screen as long as its line, so the voice always fits.

Everything below needs FFmpeg 5.1 or newer with libx264, libvpx-vp9 and libopus (`npm i
ffmpeg-static` gives one); point `FFMPEG` at it.

## The voice

- **It arrived (or changed):** put it at `assets/voiceover/<video>/voiceover.mp3` (same lines,
  same order, one `<break time="1.5s" />` between lines). If the words changed, change them in
  the script's table too: the captions come from there. Then find the lines:

  ```bash
  FFMPEG=/path/to/ffmpeg node scripts/guide-video/voice.mjs <video> lines
  ```

  It prints each line's start, end and length, and its captions, and stops if it can't find one
  line per row of the script. The breaks are the pauses of 1 s or more that best fit how long
  each line's words take, so a long pause inside a line isn't taken for a break (it says so when
  it sees one). A sentence too quick to read on its own shares a caption with its neighbour.
- **Not made yet:** time the lines as the Facebook voice would say them, so the video can go out
  with captions only and look the same once the voice comes:

  ```bash
  node scripts/guide-video/voice.mjs <video> estimate
  ```

Then re-make the video.

## Re-make a video (new voice, or the screens changed)

1. Build the web app and start both apps, with the pretend Facebook:

   ```bash
   # API (apps/api, after `pnpm build`)
   DATABASE_URL=postgres://…/db PORT=4000 AUTH_OTP_DEV_ECHO=true CORS_ORIGINS=http://localhost:3000 \
   META_FAKE=true META_APP_ID=walk-app META_APP_SECRET=walk-app-secret META_VERIFY_TOKEN=walk-verify \
   META_TOKEN_KEY="$(openssl rand -base64 32)" WEB_APP_URL=http://localhost:3000 node dist/index.js
   # Web (apps/web, after `pnpm build`)
   NEXT_PUBLIC_API_URL=http://localhost:4000 npx next start --port 3000
   ```

   For `connect-facebook` the database must be fresh: the pretend Facebook's Pages can only be
   switched on in one business at a time. Each run makes its own sample business.

2. From a folder where Playwright **1.63 or newer** is installed
   (`npm i playwright && npx playwright install chromium`), record:

   ```bash
   OUT=./video-out META_APP_SECRET=walk-app-secret node /path/to/repo/scripts/guide-video/record.mjs <video>
   ```

   It writes the raw recording, the cover and `scenes.json` (when each line's scene appeared)
   into `OUT`. The scenes are in `scenes/<video>.mjs`; a new video is a new scenes file, a new
   script and `estimate`.

3. Put the voice in and encode:

   ```bash
   FFMPEG=/path/to/ffmpeg node /path/to/repo/scripts/guide-video/voice.mjs <video> mix ./video-out
   ```

   It cuts at the orange title card, places each line 0.15 s after its scene appears, evens out
   the loudness (about −16 LUFS), and writes the MP4 (H.264 + AAC), the WebM (VP9 + Opus), the
   captions (`.vtt`) and the cover into `apps/web/public/videos/` (`VIDEOS` sends them elsewhere,
   for a test). With estimated lines there's no sound yet. If the end card isn't where the
   script's clock says it should be, the recording drifted (older Playwright) and it stops.

4. Set the video's length in `apps/web/src/lib/guide-videos.ts` to what it prints (and its
   sound, once it has a voice), rebuild the web app (Next only serves files that were in
   `public/` when it was built) and watch it through before committing. About 3 MB a file.
