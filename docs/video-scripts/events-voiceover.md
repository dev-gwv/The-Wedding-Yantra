# Voice-over for the tutorial video: "Add an event and run it"

This is the narration for the Events tutorial video (`apps/web/public/videos/events.mp4`), one
line per scene, in simple English. Make all 17 lines as **one file** in ElevenLabs (see "Make it"
below). The video is made so every scene lasts as long as its line, so the voice and the screen
always match.

**Until the voice comes,** the video runs with captions only, timed as if spoken. With the
voice, it is re-made with `scripts/guide-video/README.md`.

## ElevenLabs settings

The same as the Facebook video, so both sound like one person:

- **Voice:** "Nimmo – Clear Hinglish Customer Care", from the Voice Library.
- **Model:** Eleven Multilingual v2.
- **Settings:** speed 0.97 · stability 33% · similarity 66% · style 0 · speaker boost on.
- **Output:** MP3, 44.1 kHz.

## The lines

| Line | What's on screen | Line to paste into ElevenLabs | About |
|---|---|---|---|
| `01-title` | Orange title card | Let's see how to add an event in Wedding Yantra, and run it from start to finish. | 4.5 s |
| `02-events` | Events: upcoming events by month | Open Events. Your upcoming events are here, month by month. | 3.5 s |
| `03-calendar` | Calendar, a busy day tapped | Tap Calendar to see every booking by date. Red dots mean a busy day. | 4 s |
| `04-quotes` | Events list | When a client accepts your quote, the event is made for you. | 3.5 s |
| `05-new` | "New event" ringed | To add one yourself, tap New event. | 2 s |
| `06-client` | Choosing the client | First, choose the client. If they're new, tap New and type their name and number. | 5 s |
| `07-details` | Name, type, value and venue typed in | Give the event a name, and choose the type. Add the booking value and the main venue. | 5 s |
| `08-functions` | Mehendi, Sangeet and Wedding, with dates and times | Now add each function, like Mehendi, Sangeet and the wedding, with its date and time. | 5 s |
| `09-create` | "Create event" ringed | Check everything, and tap Create event. | 2 s |
| `10-event` | The event page: functions and venue | This is your event. Every function, with its date, time and venue, is in one place. | 5 s |
| `11-team` | "Choose the team": tick, role, time to reach | Tap Choose the team. Tick who works this event, add their role and the time to reach, and tap Save team. | 6 s |
| `12-their-day` | The team on the event | Your team sees this event, with their role and the time to reach. | 3.5 s |
| `13-checklist` | "Add 8 steps", then the checklist | Add your checklist in one tap. Each step gets its own date, counted from the event. | 5 s |
| `14-client` | "For the client": add a deliverable | Under For the client, add what you'll hand over, and by when. | 3.5 s |
| `15-money` | "Money received", then paid and due | When the client pays, tap Money received. You always see what's paid and what's due. | 5 s |
| `16-edit` | "Edit dates and details" and "Mark done" ringed | To change anything, tap Edit dates and details. After the event, tap Mark done. | 4.5 s |
| `17-help` | "Need help?" end card | Need help? Open More, then Help, and watch this video again, any time. | 4 s |

The whole voice-over is about 70 seconds; the finished video is about 1 minute 45 seconds, because some
scenes show typing. The ids in the first column are the names `scripts/guide-video/` uses for each
line, and the third column is also the video's captions, so keep it word for word what was
voiced.

## Make it

Copy this whole block into one ElevenLabs text box and download one MP3. It is cut into the 17
lines at the breaks, so keep exactly one break between lines and none inside a line.

```
Let's see how to add an event in Wedding Yantra, and run it from start to finish. <break time="1.5s" />
Open Events. Your upcoming events are here, month by month. <break time="1.5s" />
Tap Calendar to see every booking by date. Red dots mean a busy day. <break time="1.5s" />
When a client accepts your quote, the event is made for you. <break time="1.5s" />
To add one yourself, tap New event. <break time="1.5s" />
First, choose the client. If they're new, tap New and type their name and number. <break time="1.5s" />
Give the event a name, and choose the type. Add the booking value and the main venue. <break time="1.5s" />
Now add each function, like Mehendi, Sangeet and the wedding, with its date and time. <break time="1.5s" />
Check everything, and tap Create event. <break time="1.5s" />
This is your event. Every function, with its date, time and venue, is in one place. <break time="1.5s" />
Tap Choose the team. Tick who works this event, add their role and the time to reach, and tap Save team. <break time="1.5s" />
Your team sees this event, with their role and the time to reach. <break time="1.5s" />
Add your checklist in one tap. Each step gets its own date, counted from the event. <break time="1.5s" />
Under For the client, add what you'll hand over, and by when. <break time="1.5s" />
When the client pays, tap Money received. You always see what's paid and what's due. <break time="1.5s" />
To change anything, tap Edit dates and details. After the event, tap Mark done. <break time="1.5s" />
Need help? Open More, then Help, and watch this video again, any time.
```

If "Wedding Yantra" sounds wrong, type it as "Wedding Yuntra" in ElevenLabs only.

## Send the file

Attach it in the chat, put it in a Google Drive folder and say its name, or upload it to
`assets/voiceover/events/` on GitHub (Add file → Upload files).
