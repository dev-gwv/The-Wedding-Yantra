# The "Connect Facebook & Instagram leads" tutorial video

`apps/web/public/videos/connect-facebook.mp4` (plus a `.webm` for browsers without H.264, and
its cover, `connect-facebook.jpg`) is the video in the bottom-right corner of Leads and at the
top of the Facebook guide. It is the real app, driven step by step against the pretend
Facebook, with big captions and no voice.

Setting `NEXT_PUBLIC_FACEBOOK_GUIDE_VIDEO_URL` on Vercel (a YouTube link, or a direct `.mp4`
link) replaces it everywhere, for example with an AI presenter video made from
`docs/video-scripts/connect-facebook-ai-presenter.md`.

## Record it again (when the screens change)

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

2. From a folder where `playwright` is installed (`npm i playwright`), run:

   ```bash
   OUT=./video-out META_APP_SECRET=walk-app-secret node /path/to/repo/scripts/guide-video/record.mjs
   ```

   It prints the raw recording's path, the cover's path and `trimStart` (seconds of page
   loading to cut from the start).

3. Encode (any ffmpeg with libx264, e.g. `npx ffmpeg-static`), then copy the cover:

   ```bash
   ffmpeg -ss <trimStart> -i video-out/page@….webm -an -c:v libx264 -preset slow -crf 27 \
     -pix_fmt yuv420p -profile:v high -movflags +faststart -r 25 apps/web/public/videos/connect-facebook.mp4
   ffmpeg -ss <trimStart> -i video-out/page@….webm -an -c:v libvpx-vp9 -crf 42 -b:v 0 -row-mt 1 \
     -deadline good -cpu-used 2 -r 25 apps/web/public/videos/connect-facebook.webm
   ffmpeg -i video-out/cover.jpg -q:v 4 apps/web/public/videos/connect-facebook.jpg
   ```

4. Update `duration` in `BUILT_IN_VIDEO` (`apps/web/src/lib/facebook-guide.ts`) if the length
   changed, and watch it through before committing. It should stay small: about 2 MB per file
   for 80 s.
