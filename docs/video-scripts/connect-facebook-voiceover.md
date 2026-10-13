# Voice-over for the tutorial video: "Connect Facebook & Instagram leads"

This is the narration for the built-in tutorial video
(`apps/web/public/videos/connect-facebook.mp4`), one line per scene, in simple English. Make each
line as its own clip in ElevenLabs. The video is then re-made so every scene lasts as long as its
line, so the voice and the screen always match.

## ElevenLabs settings

- **Voice:** one warm Indian English voice from the Voice Library. Use the same voice for every
  clip.
- **Model:** Eleven Multilingual v2.
- **Settings:** speed 0.9 · stability about 50% · similarity about 75% · style 0–10%.
- **Output:** MP3, 44.1 kHz.
- **Check one word first:** play "Wedding Yantra" once. If it sounds wrong, type it as
  "Wedding Yuntra" in ElevenLabs only. Don't change it anywhere else.
- **File names:** save each clip with the name in the first column, e.g. `01-title.mp3`.

## The lines

| Clip (file name) | What's on screen | Line to paste into ElevenLabs | About |
|---|---|---|---|
| `01-title.mp3` | Orange title card | Let's connect your Facebook and Instagram leads to Wedding Yantra. It's easy. | 4 s |
| `02-page.mp3` | Guide: "You have a Facebook Page" | Before you start, you need a Facebook Page for your business. Not your personal profile. | 6 s |
| `03-admin.mp3` | Guide: "You are an admin of that Page" | You must be an admin of that Page, with full control. | 4 s |
| `04-form.mp3` | Guide: "You have a lead form" | And you need a lead form on Facebook. Facebook calls it an Instant Form. | 5 s |
| `05-leads.mp3` | Leads page, "Connect now" ringed | Now open Wedding Yantra. Go to Leads, and tap Connect now. | 4 s |
| `06-continue.mp3` | "Continue with Facebook" ringed | Tap the orange button: Continue with Facebook. | 3 s |
| `07-login.mp3` | Facebook login picture | Facebook opens. Log in, and tap Continue as your name. | 4 s |
| `08-choose.mp3` | Facebook "choose Pages" picture | Tick your business Page. Keep every switch on, and tap Save. | 5 s |
| `09-switch-on.mp3` | "Switch on" ringed | You come back to Wedding Yantra. Tick your Page, and tap Switch on. | 5 s |
| `10-receiving.mp3` | Green "Receiving leads" | When it says Receiving leads, you're connected. | 3 s |
| `11-who-gets.mp3` | "Who gets these leads" | Each new lead goes to the salesperson with the fewest open leads. They get an alert on their phone. | 6 s |
| `12-test.mp3` | "Send a test lead" ringed | Now let's test it. Tap Send a test lead. | 3 s |
| `13-received.mp3` | "Test lead received" | Test lead received. It works! | 2.5 s |
| `14-done.mp3` | Leads list with the new lead | That's it. New leads from your ads now come into Wedding Yantra by themselves, with an alert. | 6 s |
| `15-help.mp3` | "Need help?" end card | Need help? Open Leads, and tap See how. Every step is there, with pictures. | 5 s |

The whole voice-over is about 70 seconds. The finished video will be about 1 minute 25 seconds.

### Prefer one file?

Paste all 15 lines into one ElevenLabs text box in this order, with `<break time="1.5s" />`
between lines, and download one MP3. It will be cut into the 15 clips at the pauses, so keep
exactly one pause between lines and none inside a line.

## Send the clips

Any one of these:
- **Google Drive:** put them in a folder (for example "Wedding Yantra voice-over") and say its
  name.
- **GitHub:** upload them to `assets/voiceover/connect-facebook/` on the
  `claude/upbeat-lamport-p8fu4j` branch (Add file → Upload files).
- **Here:** attach them in the chat, if the app lets you.
