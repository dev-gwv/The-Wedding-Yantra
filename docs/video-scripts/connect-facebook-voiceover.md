# Voice-over for the tutorial video: "Connect Facebook & Instagram leads"

This is the narration for the built-in tutorial video
(`apps/web/public/videos/connect-facebook.mp4`), one line per scene, in simple English. Make all
15 lines as **one file** in ElevenLabs (see "Make it" below). The video is made so every scene
lasts as long as its line, so the voice and the screen always match.

**In use now:** the "Nimmo, Clear Hinglish Customer Care" voice (Eleven Multilingual v2), all 15
lines in one file: `assets/voiceover/connect-facebook/voiceover.mp3`. To change the voice, make a
new file the same way, replace that file, and re-make the video with
`scripts/guide-video/README.md`.

## ElevenLabs settings

- **Voice:** one warm Indian English (or clear Hinglish) voice from the Voice Library.
- **Model:** Eleven Multilingual v2.
- **Settings:** speed 0.9 · stability about 50% · similarity about 75% · style 0–10%.
- **Output:** MP3, 44.1 kHz.
- **Check one word first:** play "Wedding Yantra" once. If it sounds wrong, type it as
  "Wedding Yuntra" in ElevenLabs only. Don't change it anywhere else.

## The lines

| Line | What's on screen | Line to paste into ElevenLabs | About |
|---|---|---|---|
| `01-title` | Orange title card | Let's connect your Facebook and Instagram leads to Wedding Yantra. It's easy. | 4 s |
| `02-page` | Guide: "You have a Facebook Page" | Before you start, you need a Facebook Page for your business. Not your personal profile. | 6 s |
| `03-admin` | Guide: "You are an admin of that Page" | You must be an admin of that Page, with full control. | 4 s |
| `04-form` | Guide: "You have a lead form" | And you need a lead form on Facebook. Facebook calls it an Instant Form. | 5 s |
| `05-leads` | Leads page, "Connect now" ringed | Now open Wedding Yantra. Go to Leads, and tap Connect now. | 4 s |
| `06-continue` | "Continue with Facebook" ringed | Tap the orange button: Continue with Facebook. | 3 s |
| `07-login` | Facebook login picture | Facebook opens. Log in, and tap Continue as your name. | 4 s |
| `08-choose` | Facebook "choose Pages" picture | Tick your business Page. Keep every switch on, and tap Save. | 5 s |
| `09-switch-on` | "Switch on" ringed | You come back to Wedding Yantra. Tick your Page, and tap Switch on. | 5 s |
| `10-receiving` | Green "Receiving leads" | When it says Receiving leads, you're connected. | 3 s |
| `11-who-gets` | "Who gets these leads" | Each new lead goes to the salesperson with the fewest open leads. They get an alert on their phone. | 6 s |
| `12-test` | "Send a test lead" ringed | Now let's test it. Tap Send a test lead. | 3 s |
| `13-received` | "Test lead received" | Test lead received. It works! | 2.5 s |
| `14-done` | Leads list with the new lead | That's it. New leads from your ads now come into Wedding Yantra by themselves, with an alert. | 6 s |
| `15-help` | "Need help?" end card | Need help? Open Leads, and tap See how. Every step is there, with pictures. | 5 s |

The whole voice-over is about 70 seconds; the finished video is 1 minute 25 seconds. The ids in the first column are the names `scripts/guide-video/` uses for each line.

## Make it

Paste all 15 lines into one ElevenLabs text box in this order, with `<break time="1.5s" />`
between lines, and download one MP3. It is cut into the 15 lines at the breaks, so keep exactly
one break between lines and none inside a line.

## Send the file

Any one of these:
- **Google Drive:** put it in a folder (for example "Wedding Yantra voice-over") and say its
  name.
- **GitHub:** upload it to `assets/voiceover/connect-facebook/` (Add file → Upload files).
- **Here:** attach it in the chat.
