# Build spec: Enquiry form, QR codes for partners and vendors, and WhatsApp after sending

**For:** the Studio AutoPilot team (or any AI coding agent building it in another repository).
**From:** Wedding Yantra, where this is live and in daily use.
**Goal:** rebuild this feature in your app so it looks and behaves the same: the same fonts,
the same colours, the same simple screens, the same words, the same rules.

Your app has already built some of this. Keep what you have, and use this file to bring the
rest into line. Where your version differs from this file, follow this file.

---

## 0. How to read this file

- Everything here is **exact**: hex colours, sizes, wording on buttons, URL formats, limits.
  Copy them as written. Text in "quotes" is the exact text people see.
- The people using it are wedding businesses in India (planners, photographers, decorators,
  makeup artists…) and their clients. Many are not technical and use a phone. So:
  - Short sentences. Simple English. No jargon ("lead form", not "lead capture widget").
  - One clear main action per screen.
  - Every screen works on a 320 px wide phone with no sideways scrolling.
- The words "enquiry" and "lead" mean the same thing (a person who asked about a booking).
  Screens say "enquiry" to clients and "lead" inside the business's app.
- "Business" = your customer (the studio or planner using your app).
  "Client" = the person filling the form. "Partner" = another business that keeps the
  business's QR code at their counter (a boutique, jeweller, salon, venue). A partner can
  also be one of the business's **vendors**.

### What the whole feature does, in one paragraph

Each business gets **one enquiry form** with its own link and QR code. A client opens it,
fills in a few questions (the business chooses which), taps "Send enquiry", and lands
straight in a **WhatsApp chat with the business**, with their details already typed in. The
enquiry becomes a lead in the business's Leads screen, due for a call today, with an alert.
The business can also give **each partner or vendor their own QR code** for the same form.
Enquiries through that code are marked as that partner's, the partner gets a **private
page** to see their enquiries and where each stands, and the business can **download** any
of these leads as **Excel or CSV**.

---

## 1. Design system (copy exactly)

### 1.1 Fonts

| Use | Font | Weights | Notes |
|---|---|---|---|
| Body, buttons, inputs, labels | **Plus Jakarta Sans** (Google Fonts) | 400, 500, 600, 700, 800 | The default font everywhere |
| Headings (h1–h4), big numbers, card titles | **Bricolage Grotesque** (Google Fonts) | 600, 700, 800 | Letter spacing `-0.02em` on all headings |

- Load both with `font-display: swap` (in Next.js: `next/font/google`, variables
  `--font-jakarta` and `--font-bricolage`).
- Body text is antialiased (`-webkit-font-smoothing: antialiased`,
  `text-rendering: optimizeLegibility`).
- Numbers in counts, money and phone numbers use tabular figures
  (`font-variant-numeric: tabular-nums`).

**Type scale used on these screens**

| Element | Font | Size | Weight |
|---|---|---|---|
| Page title (h1) | Bricolage | `clamp(28px, 4vw, 38px)`, line-height tight | 800 |
| Card title (h2) | Bricolage | 18 px (`text-lg`) | 800 |
| Public form title "Tell us about your event" | Bricolage | 24 px | 800 |
| Business name on public pages | Bricolage | 30 px | 800 |
| Big stat number (Scans/Enquiries/Booked) | Bricolage | 24 px (in app), 30 px (partner page) | 800 |
| Body / descriptions | Jakarta | 15 px | 400 |
| Input text | Jakarta | 16 px (never smaller: stops iPhone zoom) | 400 |
| Field label | Jakarta | 14 px | 600 |
| Hint / small print | Jakarta | 14 px or 12 px | 400 |
| Buttons | Jakarta | 15 px (md), 14 px (sm), 16 px (lg) | 700 |
| Eyebrow / badge | Jakarta | 11 px, UPPERCASE, wide tracking | 800 |

### 1.2 Colours ("Sunburst" palette)

Only these colours are used. Do not add others.

| Token | Hex | Used for |
|---|---|---|
| `surface` | `#FFFFFF` | Cards, inputs, page background inside the app |
| `cream` | `#FFF8EE` | Soft fills: icon squares, hover rows, selected radio card, link box |
| `line` | `#F1E6D2` | All borders and dividers |
| `line-strong` | `#E6D5B8` | Switch "off" track, radio ring when not chosen |
| `ink` | `#241803` | Main text |
| `ink-muted` | `#7C6A45` | Secondary text, hints |
| `ink-subtle` | `#B3A284` | Placeholders, chevrons |
| `brand` | `#FF6A00` | Saffron: switch "on", chosen chip fill, radio dot, focus outline |
| `brand-strong` | `#E85C00` | Saffron text and icons (links, card-title icons) |
| `brand-deep` | `#C9430A` | Text on a chosen trade/kind card |
| `brand-soft` | `#FFEFD6` | Text selection, soft badges |
| `on-brand` | `#FFFFFF` | Text on saffron or gradient |
| `success` | `#0E9C6C` | "Accepting enquiries" dot, "Booked", "Best" badge text |
| `success-soft` | `#E6F6EF` | "Booked" badge fill, "Best" badge fill |
| `danger` | `#C9430A` | Error text and error border |
| `danger-soft` | `#FDEEE6` | Error notice fill |
| `warning` | `#B45309` | Warning notice text |
| `warning-soft` | `#FFF4DC` | Warning notice fill |
| `sun-100` | `#FFEFD6` | "New" status badge fill |
| `sun-300` | `#FFC02E` | Input focus border, card hover border, soft rings |

**Gradients and effects**

| Name | Value | Used for |
|---|---|---|
| Primary gradient | `linear-gradient(135deg, #FF7A1A, #FFB020)` | The one main button on a screen, active menu item, icon tiles, "Main" check badge |
| Hero background (public pages only) | `radial-gradient(1100px 720px at 78% -12%, #FFD24D 0%, #FFAE1F 20%, #FF7A12 36%, rgba(255,247,236,0) 66%), radial-gradient(700px 500px at 100% 30%, rgba(255,138,43,0.3), transparent 60%), linear-gradient(180deg, #FFF8EE 0%, #FFFFFF 58%)` | Behind the public enquiry form and the partner's page: a golden-hour glow at the top |
| Shadow soft | `0 10px 26px rgba(150, 90, 20, 0.14)` | Cards, primary button |
| Shadow warm | `0 22px 50px rgba(255, 120, 20, 0.2)` | Primary button on hover |
| Focus glow | `0 0 0 4px rgba(255, 138, 43, 0.14)` | Inputs when focused |
| Dialog backdrop | `rgb(36 24 3 / 0.4)` | Behind sheets |
| WhatsApp message preview bubble | fill `#E7F8E1`, text `#112B1A` | Only in the "What they'll send you" preview |

### 1.3 Radius, spacing, sizes

| Thing | Value |
|---|---|
| Cards | radius 24 px, 1 px `line` border, shadow soft, padding 20 px (24 px on ≥640 px) |
| Inputs | height 48 px, radius 15 px, padding 0 16 px, 1 px `line` border; focus: border `sun-300` + focus glow; error: border `danger` |
| Buttons | radius 15 px, bold. Heights: sm 36 px, md 44 px, lg 52 px (lg is full width) |
| Chips (multi-select) | full pill, min height 40 px, padding 0 16 px, 14 px semibold |
| Radio cards | radius 20 px, padding 16 px, 1 px border |
| Icon square | 40 px, radius 15 px, `cream` fill, `brand-strong` icon 20 px |
| Gradient icon tile | 44 px, radius 20 px, primary gradient, white icon |
| Page gutter | 16 px on phones, 24 px from 640 px |
| Space between cards | 24 px |
| Public pages | single column, max width 448 px (form) / 672 px (partner page), centred |

### 1.4 Components (build these once, reuse everywhere)

**Button** (4 variants)
- *Primary*: primary gradient, white text, shadow soft; on hover lifts 2 px and gets shadow
  warm. **Only one primary button per screen or per card.**
- *Secondary*: white, `ink` text, `line` border; hover: `sun-300` border + `cream` fill.
- *Ghost*: no border; hover `cream` fill.
- *Danger*: `danger` text; hover `danger-soft` fill.
- Loading: a small spinner before the text, the button disabled, `aria-busy`.
- Disabled: 50 % opacity, no clicks.
- Icons from **lucide** at 16 px, 8 px gap before the text.

**Field** = label (14 px semibold) → input → one line under it: the hint in `ink-muted`, or
the error in `danger` (the error replaces the hint). Errors set `aria-invalid` and link to
the note with `aria-describedby`.

**Phone field**: a fixed "+91" shown inside the input on the left (`ink-muted`), the person
types 10 digits. Store numbers as `+91XXXXXXXXXX`.

**Switch**: 48×28 px pill, knob 20 px white with a shadow. On = `brand` track, off =
`line-strong`. Always has an `aria-label`, `role="switch"`, `aria-checked`.

**Chips (tick several)**: buttons with `aria-pressed`. Off = white, `line` border, hover
`sun-300` border. On = `brand` fill, white text, a ✓ (lucide `Check` 16 px) before the text.
Under the chips, 12 px `ink-muted`: "Tick all that apply."

**Radio cards**: the whole card is the button (`role="radio"`, inside a
`role="radiogroup"`). Chosen = `brand` border, `cream` fill, shadow soft; a 20 px ring with a
10 px `brand` dot. Not chosen = `line` border, empty ring in `line-strong`.

**Notice**: a box (radius 15 px, padding 12 × 16 px, 14 px text, no border) with one or two
sentences. Tones: neutral (`cream` fill, `ink` text), warning (`warning-soft` fill,
`warning` text), danger (`danger-soft` fill, `danger` text).

**Sheet**: a panel that slides up from the bottom on phones and sits centred on larger
screens (native `<dialog>`). Title, optional one-line description, an × to close. If the
form inside has unsaved changes, closing asks "Discard changes?".

**Toast**: a dark pill at the bottom centre, white text, a ✓ icon, 3 s. Error toasts use a
warning icon.

**Empty state**: centred, padding 56 px top and bottom: a 56 px `cream` square (radius 20 px)
holding a 24 px `brand-strong` icon, then the title (Bricolage 20 px 800, 20 px above), one
sentence (15 px `ink-muted`, max 384 px wide), and at most one button (24 px above).

**Stat tiles**: three equal tiles in one row (`grid-cols-3`, 12 px gap): big Bricolage number
on top, 14 px `ink-muted` label under it.

### 1.5 Icons (lucide)

| Where | Icon |
|---|---|
| Enquiry form & QR (menu, cards) | `QrCode` |
| Partners | `Handshake` |
| Vendors | `Store` |
| WhatsApp | `MessageCircle` |
| Copy link | `Copy` |
| Open link | `ExternalLink` |
| Download | `Download` (QR), `FileSpreadsheet` (Excel) |
| Partner's page (send it) | `Eye` |
| Questions card | `ListChecks` |
| After sending card | `Send` |
| Thank-you only | `CircleCheck` |
| Open a link | `Link2` |
| Stop sharing | `Link2Off` |
| New link | `RefreshCw` |
| Archive / bring back | `Archive` / `ArchiveRestore` |
| Edit | `Pencil` |

### 1.6 Writing style

- Talk to the business as "you". Talk to the client as "you" on the public form.
- Sentences of 6–15 words. One idea per line.
- Buttons say exactly what happens: "Download for print (HD)", "Make their QR code",
  "Send on WhatsApp", "Save questions". Never "Submit", "OK" or "Proceed".
- Success toasts say what happened next: "Saved. After sending the form, people land in a
  WhatsApp chat with you."

---

## 2. Where people find it (navigation)

People could not find this feature when it was buried in Settings. Put it in **every** one of
these places:

1. **Side menu (computer):** "Leads" is a group that opens into three parts:
   - "All leads" (`Inbox` icon)
   - "Enquiry form & QR" (`QrCode`)
   - "Partner QR codes" (`Handshake`), only for owners and managers

   The Leads group is highlighted on any of these pages, and on a partner's page.
2. **Leads page header:** a secondary button **"Form & QR"** (`QrCode` icon) to the left of
   the primary "Add lead" button. It is always shown, not only when the list is empty.
   Both buttons must fit side by side on a 320 px phone.
3. **Phone "More" page:** a row "Enquiry form & QR codes" (`QrCode`) in the daily rows,
   right after Leads.
4. **Settings → Sales and enquiries:** a row "Enquiry form & QR codes", with the line "A link
   and QR code anyone can fill; each enquiry becomes a lead".
5. **Each vendor's page:** an "Enquiry QR code" card (see 3.8).
6. **Empty Leads screen:** a secondary button "Share enquiry form".

**URLs**

| Page | URL |
|---|---|
| Enquiry form & QR codes (hub) | `/app/leads/enquiry-form` |
| Partner QR codes (full list) | `/app/partners` |
| One partner | `/app/partners/<id>` |
| Public enquiry form | `/f/<slug>` |
| Public form through a partner's QR | `/f/<slug>?p=<code>` |
| Partner's private page | `/p/<token>` |

Keep any old settings URL for the form working by redirecting it to the hub.

---

## 3. Screens (exact layout and wording)

### 3.1 Enquiry form & QR codes (the hub) — `/app/leads/enquiry-form`

Back link "← Leads". Title **"Enquiry form & QR codes"**. Subtitle "Share one link or QR
code. Every enquiry comes into Leads, due today."

Cards from top to bottom, 24 px apart:

**Card A: the on/off switch** (one row)
- Left: a 10 px dot (`success` when on, `line-strong` when off) and bold
  "Accepting enquiries" / "Switched off".
- Under it, 14 px `ink-muted`: on = "Anyone with the link or a QR code can send you an
  enquiry." off = "The link and every QR code show a 'not available' page."
- Right: the Switch (`aria-label` "Accept enquiries through the form"). Only owners and
  managers see it. Toast: "Form switched on" / "Form switched off".

**Card B: "Your QR code"** (title with a `QrCode` icon in `brand-strong`)
- **Left (or top on phones): a preview of the printed card.** A white card (max 240 px wide,
  radius 24 px, `line` border, shadow soft, padding 20 px, text `#241803`, centred) holding
  the QR code (square, full width), then the business name (Bricolage 18 px 800), then
  "Scan to send us your enquiry" (14 px, `#5C4A2A`). It must look like what gets printed.
- **Right:**
  1. "Print it for your studio, stall or wedding expo. People scan it, fill in their details,
     and the enquiry is in Leads at once."
  2. Buttons: primary **"Download for print (HD)"** (`Download` icon) and secondary **"SVG"**.
  3. "Or share the link" (14 px semibold `ink-muted`), the full link in a cream box (14 px
     bold, breaks anywhere), then three small secondary buttons: **"WhatsApp"**,
     **"Copy link"**, **"Open form"**.
     - WhatsApp opens `https://wa.me/?text=` + "Tell us about your event and we'll get back
       to you: <link>".
     - Copy toasts "Link copied". If copying fails: "Couldn't copy. Press and hold the link to
       copy it."
  4. (Owners and managers only) "Leads from this QR code and link", then **"Excel"** and
     **"CSV"** download buttons (see 3.12). This downloads the leads that came from the
     form itself, not through partners.
  5. "Put the link in your Instagram bio, WhatsApp Business profile and Google listing."

**Card C: "After they send the form"** (owners and managers only). See 3.2.

**Card D: "Questions on your form"** (owners and managers only). See 3.3.

**Section E: "A QR code for each partner or vendor"** (owners and managers only). See 3.4.

**Section F: "Your vendors"** (owners and managers who can see vendors). See 3.4.

Staff (people who only work their own leads) see Cards A (no switch) and B (no download
buttons) only.

### 3.2 Card: "After they send the form" (WhatsApp redirect)

Title with a `Send` icon: **"After they send the form"**. Three radio cards:

| Choice | Title | Line under it | Extra |
|---|---|---|---|
| `whatsapp` (**default**) | "Chat with you on WhatsApp" (`MessageCircle`) | "WhatsApp opens with their enquiry typed in. One tap sends it to you." | A small badge "Best" (`success-soft` fill, `success` text, 11 px bold) |
| `thanks` | "Just say thank you" (`CircleCheck`) | "A thank-you message, and you call them back." | |
| `link` | "Open a link" (`Link2`) | "Your WhatsApp Business short link, a WhatsApp group, Instagram or your website." | |

**When "Chat with you on WhatsApp" is chosen**, show under the radio cards:

1. Phone field **"Your WhatsApp number"** (+91 prefix).
   - The placeholder is the default number (see 4.4) without +91, or "98765 43210".
   - Hint when the field is empty and a default exists: "Leave it empty to use +91 98769
     21126." (formatted `+91 XXXXX XXXXX`).
   - Hint when filled: "Chats open with this number." With no default at all: "The number you
     chat with clients on."
2. Text area **"Their first message (optional)"**, max 300 characters.
   - Placeholder: "Hi <Business name>! I just sent you an enquiry."
   - Hint: "Their name and event are added under it, so you know who it is."
3. "What they'll send you" (14 px semibold `ink-muted`) and a **WhatsApp-style preview
   bubble** (`#E7F8E1` fill, `#112B1A` text, radius 20 px, padding 16 px, keeps line
   breaks) showing the first message followed by a sample:
   ```
   Hi Shubh Vivah Weddings! I just sent you an enquiry.

   Name: Priya Sharma
   Event: Wedding, 14 Feb 2027
   ```
4. A link "Try it: wa.me/919876921126" (`ExternalLink` icon, `brand-strong`, bold 14 px). It
   opens that exact chat in a new tab.

**When "Open a link" is chosen:**
1. Field **"The link to open"**, `type=url`, placeholder "https://wa.me/message/…", hint
   "Starts with https://". Only `https://` links are accepted (see 4.4).
2. **A short-link guide** (cream box, radius 20 px, padding 16 px):
   - **Left:** a small drawn phone (176 px wide, dark 4 px border, radius 22 px, `#F4F4F4`
     screen). It shows the WhatsApp Business "Tools" screen: the title "Tools", the label
     "Manage your account", and white rows "Profile", "Facebook and Instagram", then
     **"Short link"** ringed in `brand` with "Invite to chat via link or QR code" under it and
     a small saffron "Tap" tag. Along the bottom: "Chats · **Tools** · Settings".
   - **Draw it in HTML/CSS. Do not use a real screenshot**: a screenshot carries someone's
     private chats and counts.
   - **Right:** numbered steps:
     1. "Open the WhatsApp Business app."
     2. "Tap **Tools** at the bottom."
     3. "Tap **Short link**, then copy the link."
     4. "Paste it in the box above and tap Save."

**When "Just say thank you" is chosen:** one line: They see "Thank you! <Business name> has
your details and will get in touch with you soon."

**Saving:** a primary **"Save"** and a ghost **"Undo"** appear only after something
changes. Server errors show under the right field ("Add your WhatsApp number", "Paste the
link to open", "Paste a link that starts with https://"). Success toasts:
- WhatsApp: "Saved. After sending the form, people land in a WhatsApp chat with you."
- Otherwise: "Saved"

If the form is switched off, a warning notice under the card: "The form is switched off, so
nobody can send it right now."

### 3.3 Card: "Questions on your form"

Title with a `ListChecks` icon: **"Questions on your form"**. Line: "Keep it short: fewer
questions, more enquiries. Name and mobile are always asked."

A bordered list (radius 20 px, dividers). The first two rows are fixed:

| Row | Right side |
|---|---|
| "Name" | "Always asked" (12 px bold `ink-muted`) |
| "Mobile number" | "Always asked" |

Then one row per optional question, **always in this order**:

| Key | Label in the list | Asked on the form as | Input |
|---|---|---|---|
| `email` | "Email" | "Email" | email input |
| `event_type` | "Event" | "Event" | select: Wedding, Engagement / Roka, Pre-wedding, Haldi, Mehendi, Sangeet, Reception, Birthday, Anniversary, Baby shower, Corporate, Other |
| `event_date` | "Event date" | "Date" | date picker |
| `city` | "City" | "City" | text, 60 max |
| `services` | "What they need (they can tick several)" | "What do you need?" | chips (tick several) |
| `guests` | "Number of guests" | "Guests" | number, placeholder "300" |
| `budget` | "Budget" | "Budget (₹)" | number, placeholder "5,00,000" |
| `message` | "Anything else?" | "Anything else?" | text area, 1000 max, placeholder "Venue, number of people, what you're looking for" |

- Each row has a Switch on the right (`aria-label` 'Ask "<label>"').
- When a row is on, a small checkbox **"Must answer"** appears before the switch.
- Under the "What they need" row, 12 px: "The choices are your **service categories**." It
  links to where the business edits its service categories. The chips on the form are those
  categories, in the business's order.
- An off row's label is `ink-muted`.
- **Default for a new form:** Email, Event, Event date, Anything else? (all optional). City,
  What they need, Guests and Budget are off.
- **Save questions** (primary) + **Undo** (ghost) appear only after a change. Toast:
  "Questions saved. The form asks these now."

### 3.4 Section: "A QR code for each partner or vendor" + "Your vendors"

**Header row:**
- Left: a `Handshake` icon and **"A QR code for each partner or vendor"**, with the line "Each
  has its own code. Enquiries through it are marked as theirs, so you see who sends you
  work."
- Right: **Excel**/**CSV** (all partner leads; shown only when any partner has an enquiry)
  and a primary **"Add partner"** (`Plus`).

If the form is switched off and there are partners: a warning notice "The form is switched
off, so these QR codes show a "not available" page."

**No partners yet**, an empty state:
- `QrCode` icon, title "No partner QR codes yet".
- Text: "A boutique, jeweller, salon or venue keeps your QR at their counter. Their enquiries
  are marked as theirs, and they can see them too."
- Button: "Add your first partner".

**With partners:**
1. Three stat tiles: **Scans · Enquiries · Booked** (totals across partners).
2. A card list, one row per partner (see "Partner row" below).
3. A last row link: "All partners, and ones you've ended →" to `/app/partners`.

**Partner row (reused on the partners page):**
- 56 px QR thumbnail (white, radius 15 px, `line` border, 4 px padding) of the partner's form
  link `/f/<slug>?p=<code>`.
- Name (bold, one line) and, under it, `ink-muted` 14 px: "<kinds> · 12 scans · 4 enquiries
  · 1 booked". Use singulars at 1 ("1 scan", "1 enquiry"); leave out "booked" at 0.
- Chevron on wider screens.
- Then two 40 px square icon buttons (`line` border, `brand-strong` icon):
  - **Eye**: "Send <Name> their page on WhatsApp". Opens
    `https://wa.me/<their number>?text=<partner page message>` (see 4.6). Shown only while
    their page is on.
  - **Download**: "Download <Name>'s QR code". Downloads the HD print PNG (see 3.13). Toast
    "<Name>'s QR code downloaded, ready to print".
- Tapping the row opens the partner's page.

**"Your vendors"** (only vendors that **don't** have a partner QR yet):
- A `Store` icon and title "Your vendors". Line: "Give a vendor you work with their own QR code
  in one tap. Enquiries from it are marked as theirs."
- One row per vendor: name (bold), "<what they do> · <city>" under it, and a secondary small
  button **"Make QR"** (`QrCode`).
- Show 5 rows, then "Show all N vendors" / "Show fewer".
- "Make QR" creates a partner with the vendor's name, phone, what they do (as the partner's
  kinds), and the vendor link. It then opens that partner's page. Toast "QR code made for
  <Vendor>".

### 3.5 Partner QR codes (full list) — `/app/partners`

- Back link "← Enquiry form & QR codes".
- Title "Partner QR codes". Subtitle: "Give each partner you collaborate with their own QR
  code. Every enquiry through it is credited to them, and they see their enquiries on their
  own page."
- Header button: primary **"Add partner"**.
- Two pill tabs: "Partners" / "Archived" (on = `ink` fill with white text; off = white with a
  `line` border).
- Stat tiles (Partners tab only), then partner rows (3.4).
- Busiest partners first: by enquiries, then scans, then name.
- Archived empty state: "No archived partners". Text: "Partnerships you end show here. Their
  QR codes still open your form."
- Staff without permission see a lock empty state: "Partner QR codes aren't on your screens".
  Text: "Ask the owner if you need them."

### 3.6 One partner — `/app/partners/<id>`

Back link "← Partner QR codes". Cards in this order:

1. **Header card:**
   - A 56 px gradient tile with a `Handshake` icon, the name (Bricolage, 24–32 px).
   - Under it, `ink-muted`: "<kinds> · Vendor: <vendor name> · +91 98123 45670". Show "Vendor:
     …" only when the vendor's name differs from the partner's.
   - A "Partnership ended" badge if archived.
   - Three stat tiles: Scans · Enquiries · Booked (cream fill).
   - A secondary **"Edit"** button. Notes, if any, in a cream box.
2. **"<First name>'s page: every enquiry, open to them"**. This sits second, right under the
   header, so it's easy to find.
   - Text: "A private link where <Name> sees every enquiry from their QR code and where it
     stands: new, in talks, booked or not booked. Never prices or payments."
   - **When the page is on:**
     - The link in a cream box.
     - Primary **"Send on WhatsApp"** (opens `wa.me/<their number>?text=<message>`, 4.6).
     - Secondary **"Copy link"** and **"See their page"**.
     - Ghost small buttons **"New link"** (toast "New link made. The old one no longer works.")
       and **"Stop sharing"** (toast "Sharing stopped. Their link no longer works.").
   - **When it's off:** primary **"Make their page link"**, toast "Their page is on".
   - A bordered row with a Switch: **"Show full phone numbers"**. Under it: "They see each
     client's number in full." / "Numbers show as 98xxxxx123, enough to recognise, not to
     call."
3. **"Their QR code"** card:
   - If the form is off, a warning notice: "Your enquiry form is switched off, so this QR shows
     a "not available" page. **Switch it on**" (a link to the hub).
   - A 176 px QR, the text "Print it for <Name>'s counter, trial room or table. People scan it,
     fill in your enquiry form, and the enquiry is marked as theirs.", the download buttons
     (3.13), and the link with a small "Copy" button.
4. **"Enquiries from <Name>"**: a heading with **Excel**/**CSV** on the right (only this
   partner's leads), then lead cards. Empty: "None yet. They show here the moment someone
   enquires through this QR code."
5. At the bottom, a ghost button: **"End partnership"** (`Archive`; toast "Partnership ended.
   Their QR still opens your form, uncredited.") or **"Bring back"** (`ArchiveRestore`).

Cards 2 and 3 are hidden for an archived partner.

### 3.7 Add / Edit partner (sheet)

- Title: "Add a partner" / "Edit partner". Description: "They get their own QR code for your
  enquiry form."
- **"Partner's name"**: text, 2–80 characters, placeholder "Riya Boutique", focused on open.
- **"What they are (tick all that apply)"**: chips for Boutique, Jeweller, Venue, Salon,
  Photographer, Decorator, Wedding planner, Caterer, Influencer, Store.
  - Under the chips, **"Something else"**: an input (placeholder "Mehendi artist") and an
    **"+ Add"** button (Enter works too). This adds a ticked custom chip.
  - Saved as one text, the ticked kinds joined with ", " (max 120 characters).
  - When editing, split the saved text on "," to tick the chips again. Parts that aren't in
    the list become custom chips.
- **"Their mobile"**: phone field, hint "To send them their page on WhatsApp".
- **"Also one of your vendors?"**: a select of the business's vendors, "No" first. Shown only
  if they have vendors. Picking a vendor fills in the name and mobile if they're still empty,
  and ticks the vendor's kinds if none are ticked.
- **"Notes"**: text area, placeholder "What you agreed: where the QR is placed, any
  commission".
- The button is **"Add partner and make QR"** (or "Save" when editing).
- A new partner's page link is **on from the start**.
- Same name twice gives the error "You already have a partner with this name", or "An archived
  partner has this name. Bring them back instead."

### 3.8 Vendor page — "Enquiry QR code" card

Shown to owners and managers on each vendor's page (not for archived vendors).

- **The vendor has no QR yet:** a row with a cream icon square (`QrCode`), the title
  "Enquiry QR code" and the text "Give <Vendor> their own QR code for their counter. Enquiries
  from it are marked as theirs.", then a primary **"Make their QR code"**. It works the same
  as "Make QR" in 3.4.
- **The vendor has one:** a 128 px QR, then "1 scan · 1 enquiry through <First name>'s QR
  code.", the small download buttons (3.13), and the link "Their enquiries and page →" to the
  partner page.

A vendor can do several kinds of work. "What they do (tick all that apply)" is a chip list of
the business's vendor categories, with "+ Add a category"; the first ticked is the main one.
The vendor list filter matches a vendor under any of its categories.

### 3.9 Public enquiry form — `/f/<slug>` (no sign-in)

**Page:** hero background (1.2), one centred column, max 448 px, padding 40 px top/bottom.

**Header (centred):**
- The business logo (or its trade icon in a gradient tile), large.
- The business name (Bricolage 30 px 800).
- `ink-muted`: "<kinds of work> · <city>", e.g. "Wedding planner · Photographer &
  filmmaker · Jaipur".
- Opened through a partner's QR: a pill "**Sent via <Partner name>**" (`Handshake`; white 80 %
  fill, `brand-strong` text, `sun-300` ring).
- Opened from a client's "recommend us" link: "**Recommended by <first name>**" (`Heart`).

**Form card** (white, radius 24 px, shadow soft, padding 24–32 px):
- Title **"Tell us about your event"**, then "We usually reply the same day."
- **"Your name"** (autocomplete name). Always asked.
- **"Mobile number"** (+91), hint "We'll reach you on WhatsApp or a call." Always asked.
- Then only the questions the business switched on, in the order of 3.3:
  - Labels of optional questions end with " (optional)"; must-answer ones don't.
  - Event + Date share one row (two columns) when both are asked.
  - So do Guests + Budget.
  - "What do you need?" is a chip group (a fieldset with a legend), then "Tick all that
    apply." Hide it if the business has no service categories.
- A hidden honeypot input `website` (visually hidden, `tabindex=-1`, `aria-hidden`,
  autocomplete off).
- Primary large full-width **"Send enquiry"**.
- Under the card: a small "Powered by <your app name>" with its logo.

**Checks before sending** (show the errors under the fields, don't send):
- Name: at least 2 characters → "Enter your name".
- Mobile: a valid 10-digit Indian mobile → "Enter a valid 10-digit mobile number".
- Email (if given): valid → "Enter a valid email".
- A must-answer question left empty → "Please fill this in" ("Tick at least one" for chips).
- Server-side errors come back per field and show the same way. Anything else shows in a
  danger notice above the button.

**If the form is off or the link is wrong:** a card with the empty state "This form isn't
available". Text: "The link may be old or switched off. Please contact the business directly."

### 3.10 After sending: thank-you, then WhatsApp

The form card is replaced by an empty state with a `CircleCheck` icon and **"Thank you!"**.

- **When there is a redirect** (WhatsApp, the default):
  1. "Opening WhatsApp, so you can chat with <Business> right away…" (for a link: "Taking you
     to <Business>…").
  2. A large primary button **"Chat on WhatsApp"** (`MessageCircle`) or **"Continue"**
     (`ExternalLink`), linking to the same address.
  3. **After 1.5 seconds, go there automatically** (`window.location.assign(url)`, same tab).
     The button is the fallback if the phone blocks it.
- **No redirect:** "<Business> has your details and will get in touch with you soon."

The client then lands in WhatsApp with the message typed in (4.5). One tap on send starts the
chat, and the business has the client's WhatsApp.

### 3.11 Partner's private page — `/p/<token>` (no sign-in)

**Page:** hero background, max width 672 px.

**Header (centred):** the business logo, the business name (Bricolage 30 px), the city, and a
pill "**Enquiries via <Partner name>**" (`Handshake`).

**Stat tiles:** Scans · Enquiries · Booked (centred, 30 px numbers).

**List:** one row per enquiry, newest first, max 500:
- **Name** (bold).
- Under it, `ink-muted` tabular: "98xxxxx123 · Enquired 18 Oct 2026". The number is masked
  unless "Show full phone numbers" is on.
- The event and date when known, e.g. "Wedding · 14 Feb 2027".
- A status badge on the right:

  | Status | Badge colours | Rule |
  |---|---|---|
  | "New" | `sun-100` fill, `brand-strong` text | The lead is in the first open sales stage |
  | "In talks" | `cream` fill, `ink` text | Any later open stage |
  | "Booked" | `success-soft` fill, `success` text | The stage counts as won |
  | "Not booked" | `line` fill, `ink-muted` text | The stage counts as lost |

**Never shown here:** prices, budgets, quotes, payments, notes, or who handles the lead.

**Empty:** "No enquiries yet". Text: "Every enquiry from your QR code shows here as soon as it
comes in."

**Bad, old or stopped link:** "This page isn't available". Text: "The link may be old or
sharing was stopped. Please ask the business for a new link."

### 3.12 Download leads (Excel and CSV)

The same pair of secondary small buttons everywhere: **"Excel"** (`FileSpreadsheet`) and
**"CSV"**.

| Where | What it downloads |
|---|---|
| A partner's page ("Enquiries from <Name>") | That partner's QR leads |
| Hub, "Your QR code" card | Leads from the form itself (source = enquiry form) |
| Hub, partners header | All partner QR leads (source = partner) |
| Leads page, right-aligned under the filters ("Download all leads" / "Download leads from <source>" / "Download these leads") | Whatever the list shows: the source filter and search |

- Toast "<n> leads downloaded"; with none: "No leads to download yet".
- Google Sheets opens either file: File → Import → Upload.

**Columns, in this order:**

| # | Column | Content |
|---|---|---|
| 1 | Enquired on | `DD-MM-YYYY HH:MM`, in the business's time zone |
| 2 | Name | |
| 3 | Mobile | 10 digits, no +91 |
| 4 | Email | |
| 5 | Event | e.g. "Wedding" |
| 6 | Event date | `DD-MM-YYYY` |
| 7 | City | |
| 8 | Venue | |
| 9 | Guests | |
| 10 | Budget (₹) | A number |
| 11 | What they said | "Looking for: …" and their note |
| 12 | Came from | Enquiry form / Partner QR / Referral / Facebook ad… |
| 13 | Partner / QR code | |
| 14 | Stage | |
| 15 | Handled by | |
| 16 | Next follow-up | `DD-MM-YYYY HH:MM` |

**Excel (.xlsx) file:**
- One sheet called "Leads".
- A bold heading row that stays put while scrolling (frozen), and a filter on every column.
- Set column widths. Numbers use format `#,##0`.
- Text is stored as text, never formulas.

**CSV file:** UTF-8 with a byte-order mark (so ₹ and Hindi names show in Excel), CRLF line
ends. Any text starting with `= + - @` or a tab gets a leading `'`, so a name like
"=HYPERLINK(…)" can't run.

**File name:** `<business-slug>-leads[-<partner-slug>|-<source>]-<YYYY-MM-DD>.xlsx|.csv`,
e.g. `shubh-vivah-weddings-leads-kiran-florist-2026-10-18.xlsx`.

- Up to 20,000 rows, newest first.
- People who see only their own leads download only their own.
- People without Leads get 403.

### 3.13 The printed QR card (download)

**"Download for print (HD)"** makes a PNG in the browser:
- 2400 px wide (8 in at 300 dpi), white.
- 200 px margin, and the QR at 2000×2000 in `#241803`, error correction M.
- Under it, centred:
  - the title (the business name), 120 px weight 800;
  - the line ("Scan to send us your enquiry", or for a partner "Scan to enquire · via
    <Partner>"), 76 px weight 500, `#5C4A2A`.
- Long text wraps.
- File name: `<business>-enquiry-qr.png` / `<business>-x-<partner>-qr.png`, lowercased with
  dashes.

**"SVG"** gives a vector QR (4-module margin) for designers. Toasts: "QR code downloaded,
ready to print" / "QR code downloaded as SVG".

---

## 4. Rules (the behaviour must match)

### 4.1 Enquiry form link

- One form per business, made when the business is created.
- Slug: the business name lowercased, non-letters → "-", trimmed to 40 characters, then "-" +
  6 random hex characters (e.g. `shubh-vivah-weddings-649a72`). The random end makes links
  unguessable.
- `enabled` defaults to true. When off, the public endpoints answer 404 and the page shows
  "This form isn't available".

### 4.2 Partner codes and the partner page token

- **Code:** 6 characters from `abcdefghjkmnpqrstuvwxyz23456789` (no look-alikes such as 0/o,
  1/l/i). Unique per business; retry on a clash.
- **Page token:** a long random URL-safe token (32 random bytes, base64url). "New link"
  replaces it; "Stop sharing" sets it to null. Both take effect immediately.
- A new partner starts with sharing on and full numbers hidden.
- **Opening the form through a code** (`GET` the public form with `p=<code>`):
  - counts one scan for that partner;
  - shows "Sent via <name>" on the form.

  Only live (not archived) partners count. Codes are matched lowercased and must fit
  `^[a-z0-9]{6,12}$`.
- **Sending through a code:** the new lead's source is "partner" and it links to that partner.
  - An archived or unknown code still makes the lead, just without credit.
  - A partner code beats a referral code.

### 4.3 What happens when the form is sent

1. **Honeypot:** if `website` has anything, answer success with no redirect and do nothing.
2. **Rate limit:** at most 10 sends per IP address per hour. The 11th gets 429: "Too many
   enquiries from this device. Please try again later."
3. **Answers:**
   - Only questions the form asks count; anything else sent is dropped.
   - A must-answer question left empty gives 400 with per-field errors: "Please fill this in",
     and "Tick at least one" for chips.
   - "What they need" keeps only the business's own categories (matched ignoring capitals),
     each once, in the business's label.
4. **Same number again within 1 day,** and that lead is still open:
   - no new lead;
   - a note is added to the open lead ("Looking for: … / their message / Event date: …");
   - whoever handles that lead gets the alert "Enquired again: <name>".
   - The same number means the same last 10 digits, whatever the spacing or +91.
5. **Otherwise a new lead:**
   - It's in the first open sales stage and given to the business owner.
   - Its follow-up is due **now**, so it's at the top of today's list.
   - Fields saved: name, mobile, email, city, event, date, guests, budget, and "What they
     said". That is "Looking for: A, B" on one line, then their message.
   - The owner gets the alert "New enquiry: <name>", with the line "Wedding · 14 Feb 2027 ·
     Jaipur · via <Partner>" (push and in-app).
6. **Answer** `201 { received: true, redirectUrl }` (4.4).

### 4.4 Where they go after sending (redirect rules)

| `after_submit` | `redirectUrl` |
|---|---|
| `whatsapp` (default) | `https://wa.me/<digits>?text=<url-encoded message>` (4.5). Number: the form's WhatsApp number → else the business profile phone → else the owner's sign-in phone. If none exists: null (plain thank-you) |
| `link` | The saved link, as is |
| `thanks` | null |

**Saving the setting:**
- `whatsapp` with no number and no default gives 400 `whatsappPhone`: "Add your WhatsApp
  number".
- `link` with no link gives 400 `redirectUrl`: "Paste the link to open".
- The link must be `https://`, at most 500 characters, with no spaces or `< > "`. Anything
  else (`http://`, `javascript:`) gives "Paste a link that starts with https://". Also enforce
  this with a database check.
- `wa.me/<digits>`: the number with every non-digit removed, country code included
  (`919876543210`).

The public form's GET also returns `goesTo: "whatsapp" | "link" | null`, so the thank-you
screen picks the right words before sending.

### 4.5 The WhatsApp message (exact format)

```
<first line>

Name: <name>
Event: <Event label>, <D Mon YYYY>
City: <city>
Looking for: <A>, <B>
Guests: <n>
```

- `<first line>` is the business's own text, or by default "Hi <Business name>! I just sent
  you an enquiry."
- One blank line after it. Leave out any line with no answer. "Event" shows the type, the
  date, or both, comma-joined.
- Dates look like "14 Feb 2027".
- No email, budget or note in the message: they're in the lead.
- Example:
  ```
  Namaste! I filled your form. Please share your packages.

  Name: Meera Joshi
  Event: Wedding, 14 Feb 2027
  City: Jaipur
  Looking for: Planning, Hospitality and logistics
  ```

### 4.6 Sending a partner their page

The WhatsApp message (to the partner's number when known):

"Hi <First name>, here is your page for enquiries that come to <Business> through your QR
code. You can see each one and where it stands: <link>"

### 4.7 Who can do what

| Action | Owner | Manager (sees every lead) | Staff (own leads only) | No Leads access |
|---|---|---|---|---|
| See the hub, copy and share the form link, download the form QR | ✓ | ✓ | ✓ | ✗ (lock screen "Leads aren't on your screens") |
| Switch the form on/off, choose questions, set "After they send the form" | ✓ | ✓ | ✗ (403) | ✗ |
| Partners: list, add, edit, archive, share their page, make vendor QR | ✓ | ✓ | ✗ | ✗ |
| Download leads | ✓ all | ✓ all | ✓ only their own leads | ✗ (403) |

### 4.8 Several kinds of work (related)

- **At sign-up,** a business ticks every kind of work it does. A tile grid uses the same chip
  logic: the first ticked gets a small "Main" badge; tap again to untick. It can change them
  later in Business profile.
- The public form header shows all of them joined with " · ".
- **Partners and vendors** can have several kinds too (3.7, 3.8).

---

## 5. Data model (PostgreSQL)

```sql
-- One enquiry form per business.
CREATE TABLE lead_forms (
  workspace_id   UUID PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  slug           TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{4,60}$'),
  enabled        BOOLEAN NOT NULL DEFAULT true,
  -- Questions besides name and mobile, in order: [{"key":"email","required":true}, …]
  fields         JSONB NOT NULL DEFAULT '[{"key":"email"},{"key":"event_type"},{"key":"event_date"},{"key":"message"}]',
  after_submit   TEXT NOT NULL DEFAULT 'whatsapp' CHECK (after_submit IN ('thanks', 'whatsapp', 'link')),
  whatsapp_phone TEXT,            -- +91XXXXXXXXXX; null = business phone, else owner's
  whatsapp_text  TEXT,            -- their first line, ≤ 300
  redirect_url   TEXT CHECK (redirect_url IS NULL OR redirect_url ~ '^https://'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For the rate limit: 10 sends per IP per hour.
CREATE TABLE lead_form_submissions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE partners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                -- 2–80, unique per business ignoring capitals
  label        TEXT,                         -- their kinds, ", "-joined, ≤ 120
  vendor_id    UUID REFERENCES vendors (id), -- when they're also a vendor
  phone        TEXT,
  notes        TEXT,                         -- ≤ 1000
  code         TEXT NOT NULL CHECK (code ~ '^[a-z0-9]{6,12}$'),
  view_token   TEXT UNIQUE,                  -- their page /p/<token>; null = sharing stopped
  show_phone   BOOLEAN NOT NULL DEFAULT false,
  scans        INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at  TIMESTAMPTZ,
  UNIQUE (workspace_id, code)
);

ALTER TABLE leads ADD COLUMN partner_id UUID REFERENCES partners (id);
CREATE INDEX leads_partner_idx ON leads (partner_id) WHERE partner_id IS NOT NULL;
-- leads already has: name, phone, email, city, venue, event_type, event_date, guest_count,
-- budget, requirements ("What they said"), source ('enquiry_form' | 'partner' | 'referral' | …),
-- stage_id, assigned_to, next_follow_up_at, created_at, deleted_at.

-- Vendors with several kinds of work: category stays the first one.
ALTER TABLE vendors ADD COLUMN categories TEXT[] NOT NULL DEFAULT '{}';
```

- **Counts on partner lists** are computed live: enquiries = the partner's non-deleted leads;
  booked = those in a "won" stage.
- **Every change is written to the activity log:** partner added/updated/archived/restored,
  shared/sharing stopped.

---

## 6. API

All app routes need a signed-in member of the business (`/workspaces/:workspaceId/...`). The
public routes need no sign-in. Responses look like `{ success, data }` or
`{ success: false, error: { code, message, fields? } }`; `fields` maps each input name to its
message.

### 6.1 The form's settings

`GET /workspaces/:ws/lead-form` (anyone with Leads) →
```json
{
  "slug": "shubh-vivah-weddings-649a72",
  "enabled": true,
  "fields": [{ "key": "email", "required": true }, { "key": "event_type" }],
  "afterSubmit": "whatsapp",
  "whatsappPhone": null,
  "defaultWhatsappPhone": "+919876921126",
  "whatsappText": null,
  "redirectUrl": null
}
```

`PATCH /workspaces/:ws/lead-form` (owner/manager): any of `enabled`, `fields`,
`afterSubmit`, `whatsappPhone` ("" clears it), `whatsappText` (≤ 300), `redirectUrl` → the
same shape.

**Checks:**
- `fields` keys must be from the list in 3.3, each once (otherwise 400).
- The redirect rules are in 4.4.

### 6.2 The public form

`GET /public/forms/:slug?p=<code>&ref=<code>` →
```json
{
  "businessName": "Shubh Vivah Weddings",
  "businessTypeName": "Wedding planner · Photographer & filmmaker",
  "businessTypeIcon": "clipboard-list",
  "city": "Jaipur",
  "logoUrl": null,
  "referrer": null,
  "partner": "Kiran Florist",
  "fields": [{ "key": "email", "required": true }, { "key": "services" }],
  "services": ["Planning", "Coordination", "Hospitality and logistics"],
  "goesTo": "whatsapp"
}
```

- Counts a scan when `p` is a live partner code.
- Answers 404 when the form is off or the slug is unknown.
- The client should fetch it once per visit (no refetch on focus), so scans aren't
  over-counted.

`POST /public/forms/:slug` with:
```json
{
  "name": "Meera Joshi",
  "phone": "9810000001",
  "email": "meera@example.com",
  "eventType": "wedding",
  "eventDate": "2027-02-14",
  "city": "Jaipur",
  "services": ["Planning"],
  "guests": 300,
  "budget": 500000,
  "message": "…",
  "website": "",
  "ref": null,
  "p": "k7m2qa"
}
```
→ `201 { "received": true, "redirectUrl": "https://wa.me/919876921126?text=…" }`.

**Errors:** 400 with `fields`, 404 when the form is off, 429 for the rate limit.

### 6.3 Partners (owner/manager)

| Method & path | What |
|---|---|
| `GET /workspaces/:ws/partners?archived=true` | List: `{ id, name, label, vendorId, vendorName, phone, code, sharing, viewToken, showPhone, scans, enquiries, booked, lastEnquiryAt, archived }[]` |
| `POST /workspaces/:ws/partners` | Create `{ name, label?, phone?, vendorId?, notes? }` → 201 + the partner; 409 on a duplicate name |
| `GET /workspaces/:ws/partners/:id` | One partner, with `notes` and `leads` (their lead cards) |
| `PATCH /workspaces/:ws/partners/:id` | Change any field, `showPhone`, or `archived: true/false` |
| `POST /workspaces/:ws/partners/:id/sharing` `{ on }` | `on: true` makes a new page link (the old one dies); `on: false` stops sharing |
| `GET /public/partners/:token` | The partner page: `{ businessName, businessTypeIcon, businessCity, logoUrl, partnerName, scans, enquiries, booked, leads: [{ name, phone (masked unless allowed: 98xxxxx123), enquiredOn, eventType, eventDate, status }] }`; 404 if the token is unknown, stopped or archived |

### 6.4 Leads download

`GET /workspaces/:ws/leads/export?format=xlsx|csv&partnerId=&source=&stageId=&q=` →
`{ filename, contentType, data (base64), rows }`.

- The app decodes `data` into a Blob and saves it with `filename`.
- `format` other than xlsx/csv gives 400.

---

## 7. Edge cases to handle

- **Partner archived:** their QR still opens the form, but enquiries aren't credited and scans
  aren't counted. Their page link stops working (404 page).
- **Form switched off:**
  - the public form and every QR show "This form isn't available";
  - the hub shows the off state;
  - partner pages warn.
- **Same number sends twice in a day:** one lead, plus a note (4.3).
- **Number written differently** (`+91 98765 12345`, `09876512345`): treated as the same
  number.
- **No business phone and no owner phone:** WhatsApp mode can't be saved without a number. A
  form already in WhatsApp mode falls back to the thank-you.
- **A WhatsApp Business short link** (`https://wa.me/message/XXXX`) has its own preset message
  set inside WhatsApp, so we don't add text to it: use "Open a link".
- **A chosen service category removed later:** it no longer shows on the form; old leads keep
  the text.
- **Long names on phones:** truncate rows with an ellipsis; never scroll sideways.
- **Phones that block the automatic jump to WhatsApp:** the "Chat on WhatsApp" button is
  always there.
- **Scans count opens, not unique people;** say "Scans" without promising uniqueness.

---

## 8. Acceptance checklist (test all of these)

**Finding it**
1. Leads in the side menu opens into "All leads / Enquiry form & QR / Partner QR codes". The
   right one is highlighted on each page, including a partner's page.
2. On a 320 px phone the Leads header shows "Form & QR" and "Add lead" side by side, with no
   sideways scrolling.

**The hub**
3. On the hub, the preview card matches the downloaded PNG (business name, the line under it).
4. A new business's form asks name, mobile, email, event, date and "Anything else?". After a
   client sends it, WhatsApp opens to the owner's number with the message exactly as in 4.5.

**Questions**
5. Turn on City and "What they need", make Email must-answer, and save. The public form asks
   exactly: name, mobile, email, event (optional), date (optional), city (optional), "What do
   you need?" (optional), anything else (optional). Sending without email shows "Please fill
   this in".
6. Ticking two chips puts "Looking for: A, B" in the lead's "What they said" and in the
   WhatsApp message. A made-up value sent to the API is dropped.

**After sending**
7. Choosing "Open a link" with `http://…` or `javascript:` is refused. An `https://wa.me/message/…`
   link redirects there after sending.
8. "Just say thank you" shows the thank-you with no redirect.

**Partners and vendors**
9. Add a partner with two kinds ("Boutique, Salon"). Their QR opens the form with "Sent via
   <name>". Scans go up by one per open, and a sent enquiry is credited to them (source
   Partner QR).
10. "Make QR" on a vendor creates a partner with the vendor's name, phone and kinds, and opens
    its page. The vendor's own page then shows the QR card.
11. The partner's page link (at the top of the partner page) shows the enquiry with a masked
    number and status "New". Moving the lead to a won stage shows "Booked". "Stop sharing"
    makes the link show "This page isn't available".

**Downloads and limits**
12. "Excel" on a partner page downloads only that partner's leads. The file opens in Excel and
    in Google Sheets with a bold frozen header and filters. The CSV shows ₹ and Hindi
    correctly, and "=HYPERLINK(…)" appears as text.
13. Staff see the hub without the switch, the questions, the partners or the downloads. The
    settings API answers them 403.
14. An 11th send from one device within an hour is refused with the friendly message.

---

## 9. Don'ts

- **Don't** ask more than name and mobile by default beyond the four defaults. Every extra
  question loses enquiries.
- **Don't** show prices, budgets, quotes or payments on the partner's page.
- **Don't** use a real WhatsApp screenshot in the short-link guide; draw it.
- **Don't** open WhatsApp in a popup or new window from the public form: phones block popups.
  Use a same-tab jump plus the button.
- **Don't** accept `http:` or any non-https redirect link.
- **Don't** add colours outside the palette, or a second primary (gradient) button in a card.
- **Don't** hide this feature only in Settings; it must be reachable in one tap from Leads.
