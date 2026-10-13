# The "Connect Facebook & Instagram leads" tutorial video

`apps/web/public/videos/connect-facebook.mp4` (plus a `.webm` for browsers without H.264, and
its cover, `connect-facebook.jpg`) is the video in the bottom-right corner of Leads and at the
top of the Facebook guide. It is the real app, driven step by step against the pretend
Facebook, with big captions and the owner's ElevenLabs voice-over
(`docs/video-scripts/connect-facebook-voiceover.md`).

Setting `NEXT_PUBLIC_FACEBOOK_GUIDE_VIDEO_URL` on Vercel (a YouTube link, or a direct `.mp4`
link) replaces it everywhere, for example with an AI presenter video made from
`docs/video-scripts/connect-facebook-ai-presenter.md`.

The voice is `assets/voiceover/connect-facebook/voiceover.mp3`: all 15 lines in one file, with
a 1.5 s break between lines. `lines.json` next to it says where each line is. Each scene of the
video stays on screen as long as its line, so the voice always fits.

Everything below needs an ffmpeg with libx264, libvpx-vp9 and libopus (`npm i ffmpeg-static`
gives one); point `FFMPEG` at it.

## New voice (a re-made voice-over)

Replace `voiceover.mp3` with the new file (same 15 lines, same order, one
`<break time="1.5s" />` between lines), then find the lines again and re-make the video below:

```bash
FFMPEG=/path/to/ffmpeg node scripts/guide-video/voice.mjs lines
```

It prints each line's start, end and length and stops if it can't find exactly 15 lines.

## Re-make the video (new voice, or the screens changed)

1. Build the web app and start both apps on a **fresh** database, with the pretend Facebook:

   ```bash
   # API (apps/api, after `pnpm build`)
   DATABASE_URL=postgres://…/fresh_db PORT=4000 AUTH_OTP_DEV_ECHO=true CORS_ORIGINS=http://localhost:3000 \
   META_FAKE=true META_APP_ID=walk-app META_APP_SECRET=walk-app-secret META_VERIFY_TOKEN=walk-verify \
   META_TOKEN_KEY="$(openssl rand -base64 32)" WEB_APP_URL=http://localhost:3000 node dist/index.js
   # Web (apps/web, after `pnpm build`)
   NEXT_PUBLIC_API_URL=http://localhost:4000 npx next start --port 3000
   ```

   The database must be fresh: the pretend Facebook's Pages can only be switched on in one
   business at a time.

2. From a folder where Playwright **1.63 or newer** is installed (`npm i playwright`), record:

   ```bash
   OUT=./video-out META_APP_SECRET=walk-app-secret node /path/to/repo/scripts/guide-video/record.mjs
   ```

   It writes the raw recording, the cover and `scenes.json` (when each line's scene appeared)
   into `OUT`.

3. Put the voice in and encode:

   ```bash
   FFMPEG=/path/to/ffmpeg node /path/to/repo/scripts/guide-video/voice.mjs mix ./video-out
   ```

   It cuts at the orange title card, places each line 0.15 s after its scene appears, evens
   out the loudness (about −16 LUFS), and writes the MP4 (H.264 + AAC), the WebM (VP9 + Opus)
   and the cover into `apps/web/public/videos/`. If the end card isn't where the script's clock
   says it should be, the recording drifted (older Playwright) and it stops.

4. Set `duration` in `BUILT_IN_VIDEO` (`apps/web/src/lib/facebook-guide.ts`) to the length it
   prints, and watch it through before committing. Each file should be about 3 MB for 85 s.
