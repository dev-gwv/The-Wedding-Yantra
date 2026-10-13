# AI presenter video: "Connect your Facebook & Instagram leads"

A script for an AI presenter video (HeyGen, Synthesia, InVideo AI, or similar), in simple English,
for wedding business owners who are not technical. About 1 minute 50 seconds.

When it's ready, it replaces the built-in tutorial everywhere: the bottom-right corner of Leads
and the top of the Facebook guide. See "Switch it on" at the end.

## Settings in the AI video tool

- **Size:** 16:9 (landscape), 1080p.
- **Presenter:** a friendly Indian presenter, smart-casual, looking at the camera. The presenter
  is in a corner (picture-in-picture) while the screen shows the steps, and full screen for the
  start and the end.
- **Voice:** clear Indian English, **slow** (about 0.9× speed), warm. Short pauses between
  sentences.
- **Captions:** on, large, at the bottom.
- **Screen footage:** use our built-in tutorial (`apps/web/public/videos/connect-facebook.mp4`)
  as background footage. Each scene below says which part. The times are from that video.
- **Music:** soft and low, or none.
- **Export:** MP4. Upload it to YouTube as **Unlisted**, or keep the MP4 link from the tool.

## The script

**Scene 1. Welcome** (presenter full screen, about 10 s)
- **Say:** "Namaste! Do you run ads on Facebook or Instagram? Then this is for you. In the next
  two minutes, I'll show you how every new lead from your ads can come straight into Wedding
  Yantra, all by itself."
- **Caption:** Get your Facebook & Instagram leads in Wedding Yantra

**Scene 2. Before you start** (screen: tutorial 0:05–0:20, about 20 s)
- **Say:** "First, check three things on Facebook. One: you have a Facebook Page for your
  business. Not your personal profile, your business Page. Two: you are an admin of that Page,
  with full control. Three: you have a lead form, which Facebook calls an Instant Form. If you
  already run lead ads, you already have one."
- **Caption:** You need: a business Page · full control · a lead form

**Scene 3. Open Leads** (screen: tutorial 0:21–0:26, about 8 s)
- **Say:** "Now open Wedding Yantra. Go to Leads, and tap 'Connect now'."
- **Caption:** Open Leads → tap "Connect now"

**Scene 4. Continue with Facebook** (screen: tutorial 0:26–0:32, about 8 s)
- **Say:** "Tap the big orange button, 'Continue with Facebook'. Don't worry. Nothing will be
  posted on your Page."
- **Caption:** Tap "Continue with Facebook"

**Scene 5. On Facebook** (screen: tutorial 0:32–0:45, about 15 s)
- **Say:** "Facebook will open. Log in with the account that manages your Page, and tap
  'Continue'. Then tick your business Page. If you run Instagram ads, tick the Page your
  Instagram is linked to. Keep every switch on, and tap 'Save'."
- **Caption:** Log in → tick your Page → keep every switch ON → Save

**Scene 6. Switch on** (screen: tutorial 0:46–0:55, about 9 s)
- **Say:** "You'll come back to Wedding Yantra. Tick your Page and tap 'Switch on'. When you see
  'Receiving leads' in green, you're connected."
- **Caption:** Tap "Switch on" → "Receiving leads"

**Scene 7. Who gets the leads** (screen: tutorial 0:55–1:02, about 12 s)
- **Say:** "Next, choose who gets the leads. Each new lead goes to the salesperson with the
  fewest open leads, so the work is shared fairly. They get an alert on their phone straight
  away."
- **Caption:** Each lead goes to the salesperson with the fewest open leads

**Scene 8. Test it** (screen: tutorial 1:02–1:10, about 10 s)
- **Say:** "Now let's test it. Tap 'Send a test lead'. In a few seconds you'll see 'Test lead
  received'. That means everything works."
- **Caption:** Tap "Send a test lead" → "Test lead received"

**Scene 9. Done** (screen: tutorial 1:10–1:17, about 10 s)
- **Say:** "That's it! From now on, when someone fills your ad's form, the lead comes into
  Wedding Yantra in seconds. No more downloading leads from Facebook."
- **Caption:** Done! New leads come in by themselves

**Scene 10. Help** (presenter full screen, about 10 s)
- **Say:** "If you get stuck, open Leads and tap 'See how'. Every step is there, with pictures.
  And if someone else runs your ads, you can send them the guide on WhatsApp. Happy selling!"
- **Caption:** Need help? Leads → "See how"

## Switch it on

1. Copy the video's link: the YouTube link (for example `https://youtu.be/abc123XYZ`), or the
   direct `.mp4` link from the AI tool.
2. In Vercel: Project → Settings → Environment Variables. Set
   `NEXT_PUBLIC_FACEBOOK_GUIDE_VIDEO_URL` to that link, for Production and Preview.
3. Redeploy. The new video now plays in the corner of Leads and at the top of the guide. Or send
   the link to your developer.

To go back to the built-in tutorial, delete the variable and redeploy.
