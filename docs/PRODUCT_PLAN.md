# Wedding Yantra — Product & Build Plan

## 1. Context

Wedding businesses in India (makeup artists, planners, decorators, photographers, caterers,
DJs, choreographers, gifting, fireworks, bars, content creators, and more) run on WhatsApp,
notebooks and memory. They have no billing, no CRM, no task system, no clear view of profit.

Wedding Yantra is one SaaS that any of these businesses can sign up for and run their whole
business from: marketing, sales, operations, finance and team. It is sold as a monthly
subscription. It must be **universal**: not built for one trade, but for the way every
wedding business actually works.

**Status:** Phase 0 (Foundation) is built: phone sign-in, business setup with starter packs
for 14 trades, team invites over WhatsApp, roles, the app shell and an installable web app.
See section 12 for what it contains and section 13 for what changed from the first plan.

---

## 2. The one idea that makes it universal

Every wedding business, whatever it sells, follows the same loop:

```
Enquiry  →  Quote  →  Booking (an Event on a date)  →  Work (tasks, team, vendors)
         →  Money (invoice, payments, expenses)  →  Profit  →  Review & referral
```

Only **what they sell** differs. A makeup artist sells "Bridal HD makeup". A DJ sells
"Sound package 5000W". A caterer sells "Veg buffet, per plate".

So the system has one shared core and one flexible part:

- **Shared core (same for everyone):** Leads, Clients, Events, Quotes, Invoices, Payments,
  Expenses, Tasks, Team, Reports.
- **Flexible part (each business fills their own):** the **Service Catalogue** (what they
  sell, with price and unit: per event, per day, per plate, per hour, per piece) and
  **Checklists** (what must be done before, during and after each event).

At sign-up the owner picks their **business type**. That pre-fills a starter catalogue,
pipeline stages and checklists for that trade. They can change anything. This is how a
makeup artist and a fireworks vendor get the same product but feel it was made for them.

---

## 3. Who uses it (roles)

| Role | Who | What they can do |
|---|---|---|
| Owner | The business owner | Everything, including money and subscription |
| Manager | Senior staff | Everything except subscription, payroll and deleting data |
| Staff | Team members | See events and tasks assigned to them, update status, log expenses |
| Freelancer | Per-event hired hands | See only the events they are booked on |
| Accountant | Their CA / bookkeeper | Read-only finance, export data |
| Client | The couple / family | Portal: view quote, pay online, see event details (later phase) |

One business = one **workspace**. A person can belong to more than one workspace
(a freelancer makeup artist works with three studios).

---

## 4. Modules and screens (what the product contains)

### 4.1 Home — "Today"
- Today's and this week's events, payments due, tasks overdue, new leads waiting.
- One glance answer to: *what needs my attention right now?*

### 4.2 Marketing — bring leads in
- **Lead capture form**: a public link/QR for the business (share on Instagram bio,
  WhatsApp, website). Fills the CRM directly.
- **Lead sources**: Instagram, WhatsApp, referral, walk-in, wedding portal, ads. Tracked so
  the owner sees which source brings bookings and money.
- **Referral tracking**: which past client / vendor referred this lead.
- **WhatsApp templates**: pre-written replies (price list, availability, thank you) sent
  from the lead screen in one tap.
- Later: broadcast to past clients (festival wishes, offers), reviews collection link.

### 4.3 Sales — turn leads into bookings
- **Pipeline board**: New → Contacted → Quote sent → Negotiation → Booked / Lost.
  Stages are editable per business.
- **Lead card**: name, phone, event date, venue, budget, requirements, source, notes,
  call log, next follow-up date and reminder.
- **Follow-up list**: everything due today, one tap to call or WhatsApp.
- **Quote / proposal**: pick items from the catalogue, adjust price, add terms, generate a
  branded PDF, share on WhatsApp. Client can accept online.
- **Convert to booking**: quote accepted + advance received = Event created, client created,
  invoice raised, date blocked on calendar.
- **Lost reasons**: price, date clash, chose another vendor — so the owner learns.

### 4.4 Operations — deliver the event
- **Calendar**: all events by date. **Date clash warning** when the team is already booked.
- **Event sheet**: venue, functions (haldi, mehendi, sangeet, wedding, reception) with
  timings, client contacts, requirements, special notes, files (mood boards, contracts).
- **Checklist per event**: created from the business's template (e.g. decorator: site
  visit, design approval, material order, setup day, dismantle). Each item has an owner and
  due date.
- **Team assignment**: who is on this event, with call time and role.
- **Vendors / sub-contractors**: the people the business hires (florist, generator,
  helpers), with their cost per event.
- **Deliverables**: for photographers, content creators, gifting — a list of what has to
  be delivered and when (edited photos, reel, 500 gift boxes), with status.
- **Inventory / equipment** (optional module): for decor, sound & lighting, bar — items,
  quantities, what is out on which event.

### 4.5 Finance — know the money
- **Invoices**: GST or non-GST, branded, numbered automatically, PDF, share on WhatsApp.
  Advance / milestone / final invoices for the same event.
- **Payments received**: online (Razorpay payment link, UPI) or manual (cash, bank
  transfer, cheque). Automatic reminders for dues before the event.
- **Expenses**: per event (vendor payments, travel, materials) and general (rent, salaries,
  ads). Photo of the bill attached. Staff can submit, owner approves.
- **Profit per event**: revenue minus expenses, shown on every event. This is the number
  wedding business owners have never seen clearly.
- **Reports**: monthly income, expenses, profit, dues outstanding, revenue by service, by
  lead source, by team member. Export to Excel and a Tally-friendly format for the CA.
- **Payouts**: what is owed to freelancers and vendors per event, mark as paid.

### 4.6 Team — delegation and accountability
- **Members and roles** (see section 3), invite by phone number / WhatsApp.
- **Tasks**: create, assign, due date, priority, attach to an event or standalone.
  Recurring tasks (post 3 reels every week, follow up all leads daily).
- **My Day** for staff: their tasks and events, one screen, mobile-first.
- **KRA / KPI**: each role has 3 to 5 key results (leads converted, events delivered on
  time, tasks completed on time, expenses submitted within 24h). Score is calculated
  automatically from the data already in the system, shown monthly.
- **Accountability**: overdue task alerts to the assignee and the owner, daily end-of-day
  summary on WhatsApp, activity log (who did what, when).
- **Availability**: staff mark leave / unavailable dates; the calendar respects it.

### 4.7 Clients
- Client list with full history: every event, quote, invoice, payment and conversation
  note in one place.
- Later: **Client portal** link — view quote, accept, pay, see event schedule, download
  invoices, leave a review.

### 4.8 Settings
- Business profile, logo, address, GST number, bank/UPI details (printed on invoices).
- Service catalogue, checklist templates, pipeline stages, WhatsApp templates.
- Invoice numbering and terms. Subscription and billing.

---

## 5. How one system fits every trade (the flexibility rules)

1. **Catalogue with units**: every service item has a unit (per event, per day, per plate,
   per hour, per piece, per set). Quotes multiply quantity × rate. This covers caterers
   (per plate), photographers (per day), gifting (per piece), DJs (per event).
2. **Business type templates**: at sign-up we install a starter pack for the chosen type:
   catalogue items, checklist, pipeline stages, KRAs. Starter packs are just data in the
   database, so adding a new trade never needs new code.
3. **Custom fields**: owner can add fields to leads, events and clients (e.g. "skin type"
   for makeup, "power requirement" for sound). Stored as JSON, searchable.
4. **Functions inside an event**: an Indian wedding is many functions across days. Every
   event holds a list of functions with date, time, venue. A birthday decorator has one.
5. **Optional modules**: inventory, deliverables and client portal can be switched on or
   off per workspace so a small makeup artist is not overwhelmed.
6. **Simple language**: the UI uses plain words (Enquiry, Booking, Bill, Received, Due),
   never accounting jargon. English first; Hindi labels can be added later because all
   text lives in one translation file.

---

## 6. Technical design (kept simple, built for mobile from day one)

**Keep what is already built.** Next.js web app on Vercel, Fastify API + Postgres on the
VPS, shared types package, existing CI and deploy.

### 6.1 The rule that makes a phone app easy later

**The API is the product. The web app is only a screen on top of it.**

- Every rule, calculation and permission lives in the Fastify API. The web app never has
  business logic of its own (no Next.js server actions holding logic, no calculations in
  React). A future Android/iPhone app calls the exact same API and gets the exact same
  behaviour.
- Everything that is not a screen is a shared package, written in plain TypeScript with
  no browser or server dependency, so web and mobile import the same code:

| Package | Holds | Used by |
|---|---|---|
| `packages/types` | Zod schemas for every request and response, enums, role names | API, web, mobile |
| `packages/api-client` | One typed client (`api.leads.list()`, `api.invoices.create()`), built on `fetch` + TanStack Query hooks | web, mobile |
| `packages/core` | Money formatting, GST maths, date helpers, KRA scoring, pipeline rules | API, web, mobile |
| `packages/design-tokens` | Colours, spacing, radii, font sizes as one JSON | web (Tailwind), mobile (React Native styles) |

- **Auth works with tokens, not only cookies.** Web uses a secure cookie; mobile uses a
  bearer token. The API accepts both from day one.
- **API is versioned** (`/api/v1/...`) so an installed phone app keeps working while the
  web app moves ahead.
- **Files upload straight to storage** with pre-signed URLs, which works the same from a
  browser and from a phone camera.
- **Notifications have channels** (WhatsApp, push, email) behind one interface. Adding
  Android/iOS push later is a new channel, not a rewrite.
- **The web app is a PWA from Phase 0**: installable on the home screen, works offline for
  reading, sends web push. Most owners will never need the store app, and the ones who do
  get it in Phase 6 with the same look and the same data.

**Mobile path chosen:** Next.js web now, **Expo (React Native) app in Phase 6** sharing
the four packages above; only the screens are written again. Alternative considered and
rejected: one Expo codebase for web + mobile from day one. It makes the desktop side
(tables, invoices, reports) noticeably weaker, and desktop is where owners do finance.

### 6.2 Stack

| Concern | Choice | Why |
|---|---|---|
| Web app | Next.js 15 (App Router, React 19), Tailwind v4, shadcn/ui, TanStack Query | Already set up; fast; PWA-capable; TanStack Query works in React Native too |
| API | Fastify 5 on the VPS (existing), Node 22 | Already deployed with rollback and backups; no serverless time limits for PDFs and jobs |
| Database | PostgreSQL 16 (existing) + **Drizzle ORM**; **every table carries `workspace_id`** | Typed queries, migrations stay plain SQL; strict tenant separation in every query |
| Auth | Phone OTP (WhatsApp/SMS) + email/password via `better-auth` (cookie + bearer) | Indian owners live on phone numbers; same auth for web and mobile |
| File storage | Cloudflare R2 (S3-compatible), pre-signed uploads | Invoices, bill photos, mood boards; cheap, no egress fees |
| PDF | Server-side HTML → PDF (Chromium in the API container) | Branded quotes and invoices |
| WhatsApp | WhatsApp Cloud API (Meta) behind the `notifications` module | Reminders, OTPs, sharing quotes; provider swappable |
| Payments | Razorpay: payment links for client dues, subscriptions for the SaaS plan | Indian standard, UPI, already connected |
| Background jobs | pg-boss worker in the API container | Reminders, daily summaries, KRA scoring; no extra infra |
| Email | Resend (transactional) | Invoices and login fallback |
| Mobile (Phase 6) | Expo + Expo Router, NativeWind (Tailwind classes on native) | Same tokens, same API client, same query hooks |
| Analytics/errors | PostHog + Sentry | Know what users do and what breaks |

**API shape**: `apps/api/src/modules/<module>/` (routes, service, repository) per module:
`auth`, `workspaces`, `leads`, `clients`, `events`, `catalogue`, `quotes`, `invoices`,
`payments`, `expenses`, `tasks`, `team`, `reports`, `notifications`, `billing`.
Validation with the Zod schemas from `packages/types` so web, mobile and API never disagree.

**Core tables** (all with `workspace_id`, `created_at`, `updated_at`, soft delete):
`workspaces`, `users`, `memberships` (user × workspace × role), `business_types`,
`leads`, `clients`, `events`, `event_functions`, `catalogue_items`, `quotes`,
`quote_items`, `invoices`, `invoice_items`, `payments`, `expenses`, `vendors`,
`tasks`, `checklist_templates`, `kra_definitions`, `kra_scores`, `custom_fields`,
`files`, `notifications`, `activity_log`, `subscriptions`.

The existing `bookings` table is replaced by `events` in migration 0002 onward.

---

## 7. Build in phases (each phase ships something usable)

| Phase | Name | What the owner can do at the end | Rough size |
|---|---|---|---|
| 0 | Foundation | Sign up with phone, create business, pick type, invite team, see empty Home. Design system, shared packages (`types`, `api-client`, `core`, `design-tokens`) and PWA install in place. | 2 weeks |
| 1 | Sales core | Add leads (manual + public form), pipeline board, follow-ups, notes, WhatsApp quick replies. Clients list. | 2 weeks |
| 2 | Catalogue + Quotes + Events | Fill catalogue, make branded quote PDF, share, convert to Event with functions, calendar with clash warning. | 3 weeks |
| 3 | Money | Invoices (GST), payments (manual + Razorpay link), expenses with photos, profit per event, dues reminders, monthly report. | 3 weeks |
| 4 | Team & accountability | Tasks, checklists from templates, assignments, My Day, overdue alerts, daily WhatsApp summary, KRA scoring, activity log. | 3 weeks |
| 5 | SaaS layer | Plans, free trial, Razorpay subscription, usage limits, onboarding tour, help content, marketing website. **Launch to first paying users.** | 2 weeks |
| 6 | Grow | Client portal, vendors & payouts, inventory module, deliverables tracking, referral & review links, Hindi UI, exports for CA. | Ongoing |
| 7 | Native app | Expo app for Android and iPhone: same API, same packages, same tokens; push notifications, camera for bill photos, offline "My Day". Published to Play Store and App Store. | 4 weeks |

Rule for every phase: ship to the live URL, put it in front of 3 to 5 real wedding
businesses, fix what confuses them before starting the next phase.

---

## 8. Look and feel

**Personality:** warm, premium, calm. It should feel like a well-run wedding, not like
accounting software. But it is a work tool used on a phone at a venue at 6 am, so
clarity beats decoration.

**Minimal by rule, not by taste.** Every screen is checked against these before it ships:

1. **One job per screen.** One primary button, in one colour. Everything else is quiet.
2. **Five things in the navigation, never more.** Home, Leads, Events, Money, More.
3. **Three taps to anything daily.** Add a lead, record a payment, tick a task: three taps
   from Home, on a phone.
4. **Show what matters, hide the rest.** Details open on tap. No screen is a wall of fields.
   Advanced options sit behind "More options".
5. **Numbers with meaning.** "₹1,20,000 due before 14 Nov" instead of a chart. Charts only
   in Reports, and only when they answer a question.
6. **Plain words.** Enquiry, Booking, Bill, Received, Due. No jargon, no abbreviations.
7. **Empty screens teach.** A new user sees one sentence and one button, not a blank table.
8. **Same on web and phone.** Same tokens, same names, same order of things, so a user who
   learns one never relearns the other.

**Colours** (the repo already uses a burnt-orange brand colour; we build the palette around it):

| Use | Colour | Note |
|---|---|---|
| Primary / actions | Marigold orange `#C2410C` (hover `#9A3412`) | Marigold is the flower of every Indian wedding |
| Background | Ivory `#FAF7F2` | Warm, not stark white |
| Surfaces / cards | White `#FFFFFF` with soft stone borders `#E7E2DA` | |
| Text | Charcoal `#1C1917`, secondary `#78716C` | High contrast, readable in sunlight |
| Money in / success | Green `#15803D` | |
| Dues / danger | Deep red `#B91C1C` | |
| Highlight (sparingly) | Gold `#B8860B` for premium touches (plan badges, headings on PDFs) | |
| Dark mode | Charcoal `#141210` surfaces, same accent | Later, not phase 0 |

**Typography:** `Inter` for the UI (numbers align cleanly), `Fraunces` or `Playfair
Display` for large headings and on client-facing PDFs for the wedding warmth.

**Layout:** mobile-first. Bottom tab bar on phone (Home, Leads, Events, Money, More);
left sidebar on desktop. Big touch targets, one primary action per screen, WhatsApp
share button wherever something can be sent to a client.

**References to look at:**
- **HoneyBook** and **Dubsado** — the closest products (US wedding/creative business CRM): pipeline, proposals, invoices in one flow.
- **Studio Ninja** and **Táve** — photographer-focused, good job/event pages.
- **Vyapar** and **Zoho Books** — Indian invoicing, GST handling, what CAs expect.
- **Linear** — clarity of layout, keyboard-fast, calm colours.
- **Notion** — simple sidebar and page structure.
- **Zerodha Kite / Coin** — Indian product with excellent restraint and readability.

You said you will share UX/UI references; the design system in Phase 0 is built from
those plus this palette.

---

## 9. SaaS pricing (draft, to confirm)

| Plan | For | Price (per month, per business) | Limits |
|---|---|---|---|
| Starter | Solo artist / small vendor | ₹499 | 1 user, 30 events/year, no team module |
| Studio | Small team | ₹1,499 | 5 users, unlimited events, team + tasks + KRA |
| Business | Established company | ₹3,499 | 15 users, client portal, inventory, priority support |

14-day free trial, no card needed. Annual plan at 2 months free. Billing through Razorpay
Subscriptions.

---

## 10. Verification (how we know each phase works)

- Every API module gets unit tests (Vitest) plus the existing `scripts/api-smoke.sh`.
- Every phase gets one end-to-end test with Playwright covering the main path
  (e.g. Phase 3: create event → raise invoice → record payment → profit shows).
- Tenant isolation test: two workspaces, confirm neither can read the other's rows.
- Before each phase closes: deploy to production, run the flow on a real phone, and have
  at least three real wedding businesses use it for a week.

---

## 11. Decisions taken

| Decision | Choice |
|---|---|
| Backend | Keep the existing Fastify API + Postgres on the VPS; Next.js on Vercel |
| Look and feel | "Sunburst", the PhotoLancer design system (see "Design: Sunburst" below) |
| First module after foundation | Sales: leads, pipeline, follow-ups |
| Pricing | Monthly plans per business, 14-day free trial (section 9) |

Still open, to be answered when we reach them (not blocking):
- WhatsApp provider: Meta Cloud API directly, or a reseller (Interakt, AiSensy, Wati).
- Your UX/UI reference screenshots, to fold into the Phase 0 design system.
- Domain name for the product (`weddingyantra.com` is assumed everywhere).

---

## 12. Phase 0 — exactly what gets built first

Phase 0 turns the skeleton into a real multi-tenant app shell. Files to add or change:

**Database** (`apps/api/migrations/`)
- `0002_workspaces_users.sql`: `workspaces`, `users`, `memberships`, `business_types`,
  `otp_codes`, `sessions`. Every business table from here on has `workspace_id`.
- `0003_seed_business_types.sql`: the starter packs (catalogue items, pipeline stages,
  checklist templates, KRAs) for the trades listed in section 1, as data rows.

**API** (`apps/api/src/`)
- Restructure `index.ts` into `app.ts` (server setup) + `modules/*` (one folder per
  module). Keep the health route, CORS handling and pool setup already there.
- `modules/auth`: phone OTP request/verify, email+password fallback, session cookie,
  `requireAuth` and `requireWorkspace(role)` hooks that every other route uses.
- `modules/workspaces`: create business (name, type, city), update profile, invite member
  by phone, accept invite, list members, change role.
- Routes mounted under `/api/v1`. Auth accepts both the session cookie and a
  `Authorization: Bearer` token.
- Zod schemas for all requests/responses in `packages/types`, replacing the hand-written
  `Booking` types.

**Shared packages** (`packages/`)
- `types`: Zod schemas + inferred TypeScript types (extend the existing package).
- `api-client`: typed client over `fetch` with TanStack Query hooks; no React DOM or Node
  imports so it runs in React Native unchanged.
- `core`: `formatMoney`, `formatDate`, GST helpers, pipeline stage rules (move the `inr`
  and `formatDate` helpers out of `apps/web/src/app/page.tsx` here).
- `design-tokens`: colours, spacing, radii, type scale as JSON; `globals.css` reads from it.

**Web** (`apps/web/src/`)
- Install shadcn/ui, set the palette from section 8 in `globals.css` from `design-tokens`,
  add `Fraunces` alongside Inter in `layout.tsx`.
- PWA: `manifest.json`, icons, service worker (Serwist) for install and offline reading.
- Routes: `/login`, `/signup` (phone → OTP → business name → business type), `/invite/[token]`,
  `/app` (Home shell with bottom tabs on phone and sidebar on desktop), `/app/settings/team`.
- Shared pieces: page header, empty state, list/table, form fields, status pill, money
  display (₹ formatting already exists in `page.tsx`, move it to `lib/format.ts`),
  WhatsApp share button, confirm dialog, toast.
- The current demo dashboard in `app/page.tsx` becomes the marketing landing page later;
  for now it redirects to `/app` or `/login`.

**Done when:** a new owner can sign up on a phone, install the app to the home screen,
create "Riya Makeup Studio" as type Makeup Artist, invite a staff member by phone, and
both land on an empty Home that says what Phase 1 will fill. Deployed to the live URL.
Tenant isolation test passes. A `curl` with a bearer token reaches the same endpoints
the web app uses, proving a phone app could.

Phase 1 (Sales) follows immediately with `leads`, `clients`, the pipeline board, the public
lead form and follow-up reminders.

---

## 13. Built in Phase 0: differences from the plan above

| Plan said | Built | Why |
|---|---|---|
| Auth library `better-auth`, web uses a cookie | Own small phone sign-in (hashed codes, hashed tokens), bearer token for web and mobile | The web app (Vercel) and API (VPS) live on different domains, where cookies are unreliable. One token scheme for web and phone keeps the mobile move trivial. |
| Drizzle ORM | Plain SQL with typed rows, same as the existing code | Kept the existing migration runner and pattern; can be added later without a rewrite. |
| shadcn/ui | A small in-repo component kit (button, field, sheet, toast, empty state) on the shared tokens | Only a handful of pieces were needed; this keeps every screen on the shared tokens only. |
| Serwist service worker | A 50-line hand-written service worker | Next.js 16 builds with Turbopack; the hand-written worker needs no plugin. |
| Email + password fallback | Not built | Waiting on the SMS/WhatsApp provider decision; phone sign-in covers everyone. |
| Offline reading | Offline screen only | There is no business data to read offline until Phase 1. |
| `/signup` page | One `/login` flow for new and returning users, then `/onboarding` | Fewer screens. |

**Sign-in codes are not delivered yet.** Until a WhatsApp/SMS provider is connected, set
`AUTH_OTP_DEV_ECHO=true` on the server to show the code on screen for testing. Anyone could
then sign in as any number, so switch it off before real customers use the app.

---

## 14. Design: Sunburst (the PhotoLancer look)

The first Phase 0 palette felt dull, so the app now uses PhotoLancer's "Sunburst" design
system, balanced exactly as PhotoLancer balances it.

- **Colours:** white pages and cards. Deep brown text `#241803`, muted `#7C6A45`, warm
  lines `#F1E6D2` and cream fills `#FFF8EE`. Saffron `#FF6A00` for links and selection.
  Success `#0E9C6C`, danger `#C9430A`.
- **Gradient** `#FF7A1A` to `#FFB020`, only on:
  - the logo
  - the main button
  - the active menu item
  - small "do this next" icon tiles
  - progress bars
- **Golden-hour glow:** only on the sign-in, business setup, invite and offline pages.
  There, one white card sits in the middle. Signed-in pages are plain white.
- **Shapes:** cards 24px round with a soft warm shadow. Buttons and inputs 15px round.
- **Fonts:** Bricolage Grotesque, extra-bold, for headings. Plus Jakarta Sans for text.
- **Source of truth:** `packages/design-tokens`. It generates the Tailwind theme and will
  feed the mobile app.

---

## 15. Built in Phase 1: Sales

**What an owner can do now**
- **Add leads** with the everyday details: name, number, event, date, budget and where
  they came from. More details stay folded away.
- **Follow up.** Pick "This evening", "Tomorrow morning", "In 3 days", "Next week" or any
  time. The Leads screen groups leads into Overdue, Today and Coming up. Home shows what
  to do first, and flags open leads with no follow-up set.
- **Pipeline.** Each trade gets its own stages from its starter pack. On phones, stages
  are chips. On desktop, they are a board. Moving a lead takes one tap on its page.
- **Booked and lost.** Marking a lead Booked makes it a client automatically, matched by
  phone number. Marking it Lost asks why: price, date, another vendor, stopped replying,
  or plans changed.
- **WhatsApp quick replies.** Four starter messages come ready. They fill in the client's
  name, event date and business name, then open WhatsApp ready to send. The history
  records every message.
- **Notes, calls and history.** Every note, call, message, stage move, follow-up and
  handover is kept on the lead.
- **Public enquiry form.** Each business gets a link and a QR code to share or print.
  - Each enquiry becomes a lead that is due today.
  - The same number enquiring twice in a day adds a note instead of a duplicate lead.
  - Bots are filtered out.
  - One device can send at most 10 enquiries an hour.
- **Clients.** A searchable list, and one page per client with every enquiry and booking.
- **Team.** Staff see only the leads they added or were given. Owners and managers see
  every lead and can hand leads to others. Accountants see clients but not leads.

**Settings:** sales stages (rename, reorder, add, remove empty ones), WhatsApp replies
and the enquiry form (share, QR code, switch off).

**Not in Phase 1:** drag-and-drop on the board, and lead-source reports. Both come with
the reports in Phase 3.

## 16. Built in Phase 2: price list, quotes and events

**What an owner can do now**
- **Price list.** Each trade starts with its own services and prices. Every service has a
  unit (per event, day, hour, plate, piece, set or person) and a GST rate (none, 5, 12, 18
  or 28%). Hidden services stay on old quotes but leave the picker.
- **Quotes in a few taps.** From a lead or client, tap "Make a quote" and pick services.
  Change the quantity, rate, unit or GST on any line, or add a one-off line.
  - The total updates as you type. A discount lowers every line before GST, so GST is
    charged on the discounted price.
  - Quotes are numbered on their own: Q-0001, Q-0002 and so on.
  - Every quote carries the business's usual terms, set once under Business profile.
  - A new quote stays valid for 30 days unless changed.
- **Send and accept.** "Send on WhatsApp" opens a message with the quote link, and "Copy
  link" copies it. The client opens the link on their phone without signing in and sees a
  clean, branded quote. They accept by typing their name, or decline with a reason.
  - A sent quote past its valid-until date shows as Expired. The client can't accept it
    on the link until it gets a new date.
  - The owner can also mark a quote accepted or declined after a phone call.
- **Accepting books the job.** One step moves the lead to Booked, saves the client
  (matched by phone), and creates the event on the lead's date. The lead's history
  says who accepted it and when.
- **Events with functions.** One event holds every function (haldi, mehendi, sangeet,
  wedding and so on) with its date, time and venue. Events can also be added by hand for
  bookings that came without a quote.
- **Date clash warning.** While entering dates, the form warns when another booking has
  a function on the same day. The event page and the calendar keep showing it.
- **Calendar.** A month view with dots on busy days. Tap a day to see what's on. The
  Events tab also lists upcoming and past events.
- **Home** shows the events coming up in the next two weeks.
- **Money tab** lists every quote with its status, plus the value accepted and the value
  still waiting for an answer.
- **PDF.** "Save as PDF" prints a clean A4 quote on any phone or computer, with the app's
  menus hidden.

**Roles:** owners and managers make quotes and events. Staff see events with their dates,
venues and client contacts, but not booking values or quotes. Accountants see quotes and
events without changing them.

**Not in Phase 2:** GST invoices, payments, expenses and profit. These are Phase 3, and
they start from the accepted quote and the event built here.

## 17. Built in Phase 3, part 1: GST bills and payments

**What an owner can do now**
- **Make a bill in one tap from a booking.** It starts from the accepted quote: the same
  services, discount and numbers, the client's details, and the event day as the due date.
- **Proper GST tax invoices.**
  - Numbered per financial year as GST rules require: `INV/26-27/0001`. The prefix can be
    changed, and numbers never repeat or leave gaps. A cancelled bill keeps its number.
  - GST is split into CGST and SGST inside the business's state. For an event in another
    state (the place of supply), it is IGST.
  - SAC codes come from the price list. Each bill has a GST summary by rate and the amount
    in words, and the grand total is rounded to the rupee.
  - A business without a GST number makes plain bills with no GST, and is told why.
- **Money received.** UPI, cash, bank transfer, cheque, card or other, with a reference
  and date. Every payment gets a receipt number (`R-0001`).
  - An advance taken before the bill waits on the event and moves onto the bill when it
    is made.
  - Cancelling a bill frees its payments for the next bill.
  - One tap sends a receipt on WhatsApp with the balance left.
- **The client's bill link** (`/b/…`) shows the bill and what's been paid. With a UPI ID set
  in Business profile, it shows a "Pay by UPI" button that opens GPay, PhonePe, Paytm or any
  UPI app with the amount filled in, plus a QR code for computers. The money goes straight
  to the business. No payment gateway and no fees.
- **To collect.** The Money tab lists every bill with a balance, and every booking with a value
  but no bill yet, soonest due first. Overdue items are marked. One tap sends a polite WhatsApp
  reminder, another records the money. Home shows the total to collect, and each event page
  shows booked, received and due.
- **Save as PDF** prints a clean A4 tax invoice, with the business's bank details and terms.

**Roles:** owners and managers make bills and record payments. The accountant sees
everything and changes nothing. Staff don't see money.

**Fixed along the way (in Phase 2):**
- Hiding a service from new quotes reset its GST rate to none.
- Changing one detail of a quote through the API cleared its valid-until date.
- Both now change only what was sent.

**Next in Phase 3:** expenses with bill photos, profit on every event, the monthly report
and exports for the CA. Razorpay payment links can be added later for businesses that want
card payments confirmed automatically. UPI already covers most wedding payments without it.

## 18. Built in Phase 3, part 2: expenses with bill photos, and profit

**What an owner can do now**
- **Add money spent** in a few taps: the amount, what it was for, and a photo of the bill.
  - Categories: materials, vendors & helpers, staff pay, travel, food, equipment, rent &
    bills, ads & marketing, other.
  - An expense can be for an event (flowers for the Sharma sangeet) or for the business
    (studio rent).
- **The team adds, the owner approves.** Staff add expenses from the event page or from
  More → My expenses. The owner or a manager sees "1 expense from your team to approve" on
  Home, looks at the bill photo, and approves it or sends it back with a reason. Staff fix it
  and it comes back for approval. Only approved money counts.
- **Profit on every event.** The event page shows what's been spent and the profit, with the
  margin. Profit is what the business earns before GST (GST is the government's money)
  minus approved expenses.
- **Money → Expenses** shows each month's spending by category, with money waiting for
  approval shown apart.
- **Bill photos** are shrunk on the phone before upload, so they're quick even on a weak
  signal. Photos and PDFs are checked for what they really are. They're only shown through
  links that stop working after a day, and they're backed up with the database.

**Roles:** owners and managers add, change and approve anything. Staff add their own and
change them until approved. The accountant sees everything and changes nothing.

## 19. Built in Phase 3, part 3: the monthly report and spreadsheets for the CA

**Money → Monthly report** shows one month at a time, in plain numbers:
- **Cash:** what came in, what went out, and what's in hand.
- **Profit:** billed before GST, minus approved expenses.
- **Bills and GST:** taxable value, CGST, SGST, IGST and the total billed. These are the
  numbers the CA needs for GST returns. It also shows what's still to collect and what's
  overdue.
- **Where the work came from:** Instagram, referrals, wedding portals, and so on, by money
  billed. Also what sold, whose enquiries turned into bills, and where the money went.
- **How money came in:** UPI, cash, bank.

**For your CA:** one tap saves the month's bills (a sales register with GST), payments or
expenses as a spreadsheet that opens in Excel and Google Sheets.
- Dates are written the Indian way (25-09-2026), and ₹ and Hindi names show correctly.
- Cancelled bills stay listed with zero amounts, so bill numbers have no gaps.
- Anything that looks like a formula is made harmless.

**Roles:** owners, managers and the accountant. Staff don't see the business's money.

Phase 3 is complete. Next is Phase 4: team and accountability (tasks, checklists, My Day,
KRAs, daily WhatsApp summary).

---

## 20. Built in Phase 4, part 1: tasks, event checklists and the team on each event

**Every event gets its checklist.** Each business starts with its trade's steps, such as
"Trial session done" or "Kit packed and checked".
- **The dates are worked out.** Steps before the event are spread from a week before down to
  the day before, and steps after run from the next day to a week after. The owner changes
  any of it in **More → Event checklist**.
- **One tap adds them.** "Add 7 steps" on an event makes each step a task, dated from the
  event's functions. Pressing it again later only adds new steps. A step taken off an event
  on purpose never comes back.

**The team on each event.** The owner ticks who works it, with their role there
("Lead artist") and when to reach (2 pm).
- **Freelancers see only those events.** They don't see the client's number or the booking
  value.
- **Staff still see every event**, as before.

**Tasks.**
- **Giving tasks:** owners and managers give tasks to anyone, or leave an event's task to
  "anyone on the event". Everyone else adds tasks for themselves.
- **What a task holds:** a date, a time, an "urgent" flag, notes and an event.
- **Who ticks it off:** whoever it's for, whoever added it, owners and managers, or anyone
  on the event when it's for nobody.
- **More → Tasks:** your tasks, sorted into late, today, tomorrow, this week and later.
  Owners and managers also get a Team view, filtered by person.

**Home.**
- **"Your day" for the people doing the work:** the events they're on this week with the
  time to reach, and what's late or due today, ticked off right there.
- **Owners see "2 team tasks are late"** at the top.
- **The sales tiles now say "Follow-ups late"** and "Follow-ups today", so they aren't
  confused with tasks.

**Days follow the business's time zone.** "Today" and "late" are counted in India time on
the API and in every app, whatever the phone's clock says.

**Also fixed.** The API image build on the server failed because the nightly photo backup
made a private folder that Docker tried to read. Phase 3 part 3 went live after the fix.

Next: Phase 4 part 2. KRA scores worked out from this data, an activity log, and a daily
summary.

---

## 21. Built in Phase 4, part 2: scores, the activity log and the daily summary

**Scores (the KRAs), worked out from the work itself.** Nobody fills anything in. Each person
gets up to four measures a month:
- **Tasks done on time:** tasks whose day has passed, ticked off by that day.
- **Follow-ups kept:** follow-ups that came due, with a call, a message or a note by the end
  of that day. A follow-up moved before it came due, or on a lead that closed first, doesn't
  count either way. The first follow-up of a new enquiry counts too, including the same-day
  reply an enquiry-form lead needs.
- **Enquiries booked:** of their enquiries that closed this month, the share booked.
- **Expenses added in a day:** money spent, added by the next day.

The score is the plain average of the measures that had something to measure. 85 and over
reads as great, under 60 in red. Tasks of cancelled events don't count.

- **Owners and managers:** More → Team scores shows everyone's month, with tasks late right
  now. For events that began this month, it also shows the money collected before the event
  and whether every step was done on time.
- **Everyone else:** More → My score shows only their own month.

**Activity log** (More → Activity, for owners and managers). Who did what, newest first, in
plain sentences, for example "Aman ticked off “Pack the bridal kit” for Kavya's wedding".
- **What's in it:** the business's log and every enquiry's timeline (calls, notes, stage
  moves) in one list, grouped by day.
- **Filter by person.** Each entry opens the event, enquiry or bill it's about.
- **Paging is exact:** "Show older" never skips or repeats an entry, even when many things
  happened at the same moment.

**Daily summary** (More → Daily summary, for owners and managers).
- **The day:** money received, new enquiries and bookings, tasks done, who has late tasks,
  and expenses waiting for approval.
- **Tomorrow:** each event with its functions, times and team, and the tasks due.
- **One tap sends it** on WhatsApp to yourself or the team group, or copies it. After 5 pm,
  Home says the summary is ready, until it has been sent from that phone or computer.
- **Past days** can be looked back on.

Sending it automatically every evening needs the WhatsApp provider, which is still open.

---

## 22. Built in Phase 4, part 3: days off

**More → Days off.** People mark the days they'll be away, with an optional reason. Owners and
managers can mark anyone's.
- **Who sees them:** owners and managers see everyone's; everyone else sees only their own.
- **Choosing an event's team:** anyone off on one of the event's days shows "Off 28 Sep". They
  can still be picked, but not by accident.
- **The calendar:** for owners and managers, each day lists who's off.
- **The daily summary:** tomorrow's section lists who's off.
- **The activity log:** it records who marked the days.

Phase 4 (team and accountability) is complete.

---

## 23. Built in Phase 5, part 1: plans, the free trial, paying online, and the website

**Plans** (in `packages/core/src/plans.ts`, the one place the website, the app and the API
read from). These are the draft prices from section 9, still to be confirmed:

| Plan | For | Monthly | Yearly (2 months free) | People | Events a year |
|---|---|---|---|---|---|
| Starter | A solo artist or a small vendor | ₹499 | ₹4,990 | 1 | 30 |
| Studio | A small team | ₹1,499 | ₹14,990 | 5 | No limit |
| Business | An established company | ₹3,499 | ₹34,990 | 15 | No limit |

**Free trial.** Every business gets 14 days with everything included and no card. Businesses
that already existed started their trial on the day this was deployed.

**More → Plan and billing**, for the owner, shows:
- where the business stands: days left in the trial, the plan and when it renews, a
  payment that didn't go through, or a trial that has ended;
- what it uses: people, and events this year;
- the three plans, monthly or yearly.

Choosing a plan sends the owner to Razorpay's payment page.

**Paying online** uses Razorpay Subscriptions. Its messages come back to a webhook that
checks Razorpay's signature and handles each message only once. A cancelled plan keeps
working until the end of the time paid for. A plan paid by UPI or bank transfer can be
recorded by whoever runs the service (see `docs/DEPLOYMENT.md`, section 11).

**Limits only apply once switched on.** Until `BILLING_ENFORCED=true`, nothing is locked and
the owner sees no warnings. Once it's on:
- a trial that runs out unpaid stops new additions, while reading and paying still work;
- the plan's number of people (open invitations count) and events a year apply;
- the owner sees a note on Home in the trial's last three days, or when a payment fails.

**The website** at `/` explains what Wedding Yantra does, for which trades, with prices and
common questions:
- **Signed-in visitors** get an "Open the app" button.
- **The installed app** still opens straight into the app.
- **Nothing is promised that isn't built yet:** no client portal and no Hindi.

**To go live with payments:**
1. Confirm the prices.
2. Create the six Razorpay plans.
3. Set the keys, the plan ids and the webhook (`docs/DEPLOYMENT.md`, section 11).
4. Set `BILLING_ENFORCED=true`.

Next: Phase 5 part 2, onboarding help and a guided first run.

---

## 24. Built in Phase 5, part 2: a guided first run, and help

**"Get set up" on Home now takes a new business to its first quote and payment.** Each step
ticks itself off when it's done, with no box to tick:

1. Create the business.
2. Add your phone and address.
3. Set your prices (change one, or add a service).
4. Add your first enquiry.
5. Send your first quote.
6. Add your UPI ID, so every bill carries a QR code.
7. Invite your team.

Each step links straight to where it's done.

**Help** at `/help` is public, so people can read it before they sign up. It has plain
step-by-step guides:
- getting started and adding the app to the home screen;
- enquiries and follow-ups;
- quotes;
- bills, GST and payments;
- events, the team and checklists;
- expenses and reports;
- the team, and your data;
- who can do what in each role.

Help is linked from More, the website's header and footer, and the questions section.

The role descriptions now match what each role really does. For example, staff see every
event and freelancers only their own; the old descriptions mentioned payroll, which doesn't
exist.

Phase 5 is built. What's left for launch is outside the code:
- confirm the prices;
- set up Razorpay and switch billing on;
- connect a WhatsApp or SMS provider for sign-in codes and turn `AUTH_OTP_DEV_ECHO` off;
- choose the domain.

---

## 25. Built in Phase 5, part 3: sign-in codes by WhatsApp or SMS

**The code is ready; it waits for the provider accounts.** Sign-in codes can go out on
WhatsApp (Meta's Cloud API, with an approved authentication template) or by SMS (MSG91,
with a DLT-approved template).
- **Both providers:** WhatsApp is tried first and SMS if it fails
  (`OTP_PROVIDER=whatsapp,msg91`).
- **The code screen** says where the code went: "on WhatsApp" or "by SMS".
- **When nothing gets through,** the person is asked to try again in a minute, and the
  reason is logged.
- **A provider without its keys** stops the API from starting, instead of silently
  blocking every sign-in.
- **Until one is set up,** nothing changes. `docs/DEPLOYMENT.md` section 12 has the steps,
  ending with switching `AUTH_OTP_DEV_ECHO` off.

---

## 26. Built in Phase 6, part 1: the client's own page, reviews and referrals

**Each client gets one link for everything.** From the client's screen, the owner or a
manager taps "Make their page" and sends it on WhatsApp. At `/c/<link>` the client sees,
without signing in:
- their events, with every function's date, time and venue;
- the quotes they were sent, with links to accept them;
- their bills, with the balance and Pay by UPI;
- what they've paid, receipt by receipt.

Drafts, cancelled bills and cancelled events stay private, and the page carries no
internal ids. Sharing again sends the same link. "Stop sharing" kills the link at once,
and sharing later makes a new one. Search engines are told not to index the page.

**Asking for a review.**
- The business profile has a Google review link.
- Once an event is over (its last day has passed, or it's marked done), the event shows
  "Ask for a review". One tap opens WhatsApp with a polite message and the link, and the
  app notes that the client was asked, so nobody asks twice by mistake.
- The client's own page also asks for a review once an event is over.
- **More, Reviews and referrals** lists every event that ended in the last 60 days and
  hasn't been asked about, with a one-tap ask.

**Referrals.**
- Every client's page has a "recommend us" link: the enquiry form with the client's code.
  Friends see "Recommended by Kavya", and their enquiry arrives as a referral credited to
  Kavya, by itself.
- When an enquiry is added by hand with "Referral" as the source, owners and managers can
  pick the client who sent it.
- The client's screen lists the enquiries they sent and how many booked. Reviews and
  referrals shows referral enquiries for the last 12 months, how many booked, and the
  clients who send the most work.

The activity log records pages shared and stopped, and review requests.

---

## 27. Built in Phase 6, part 2: deliverables

**What each event owes the client, with dates.** Each event has a "For the client" list:
edited photos, the film, the album, reels, hampers, a song mix.
- **Quick add:** each trade has ready suggestions, one tap each. Photographers get sneak
  peeks, edited photos, the highlight film and the album; choreographers get the song mix
  and practice videos. Each suggestion is dated from the event: after its last day, or
  before its first.
- **Who does what:** owners and managers plan them and choose who makes each one. That
  person, or anyone on the event's team when nobody is named, moves it along: not
  started, working on it, delivered.
- **Handing over:** mark it delivered with the link (a gallery, a Drive folder, a video),
  then tell the client on WhatsApp in one tap.
- **The client's page** shows what's coming and when, and opens the link once it's
  delivered.
- **Keeping track:**
  - More, Deliverables lists what's late, due this week and later, with "Only mine".
  - Home warns when something is late for a client, or due this week.
  - The activity log records each hand-over, and marks it when it was late.

Deleting an event removes its deliverables. A cancelled event's deliverables leave the lists.

---

## 28. Built in Phase 6, part 3: vendors and payouts

**Who you hire, and what you owe them.** More, Vendors and payouts keeps each vendor or
helper: florists, a generator, a setup crew, a second shooter. Each has a phone and a UPI ID.

**Payouts.**
- Each event can note what it owes someone, with a "pay by" date. The event page lists
  them with the total still to pay.
- Someone new can be added right from that sheet.
- **Pay:** opens any UPI app with the vendor's UPI ID and the amount filled in. Cash,
  bank or cheque are noted just as easily.
- **Paying records an expense.** An approved "Vendors & helpers" expense goes on the
  event, so profit, the monthly report and the CA's spreadsheets include it with nothing
  typed twice.
- **Changes stay in step.** Changing a paid payout updates its expense. "Mark as not
  paid" or removing the payout takes the expense away. Those expenses can't be edited
  from Expenses, so the two never disagree.

**Keeping track.**
- The Vendors screen shows everything still to pay, late ones in red, and each vendor's
  balance.
- Each vendor's page shows what's owed, what's been paid and every payout.
- Money shows "To pay vendors and helpers".
- A vendor still owed money can't be removed.

**Roles and log.** Owners and managers run payouts; the accountant can read them. The
activity log records each payment.

---

## 29. Built in Phase 6, part 4: stock

**What you own, and where it is.** More, Stock lists what the business owns, in groups:
chairs, tables, fairy lights, speakers, glassware, and how many of each. Decorators,
sound and light, bars and caterers use it; businesses without stock never see it on
their events.
- **Set aside for an event** from its page, on its days or on days you pick. The item
  list shows how many are free on those days.
- **Shortages warn, they don't block.** When overlapping events need more than you own,
  the sheet says so before you save, and the event keeps a red "20 short" note. You can
  still set them aside and hire the rest.
- **Out and back.** The crew marks items out when loaded and back when they return, and
  says how many didn't come back. Those come off the stock; undoing puts them back.
- **Free again.** A cancelled event frees its stock at once. Stock that's out can't be
  freed or deleted.
- **Roles.** Owners and managers plan stock; staff load it; the accountant can look.

---

## 30. Built: repeating tasks

"Post 3 reels every week", "follow up all enquiries daily", "pay the studio rent on the 5th".
- **When adding a task, choose Repeat:** every day, every week on chosen days, or every month
  on a day (short months use their last day). It can start on a chosen date and keep a time.
- **Each day becomes an ordinary task.** It shows on the list and My Day, can be ticked off,
  and counts in scores like any other. The first time anyone opens the app on one of its
  days, that day's copy appears.
- **No piling up.** If nobody opened the app for a while, only the latest day's copy is made.
  Deleting a copy doesn't bring it back.
- **Tasks, Repeating** lists the rules with their next day. Anyone can repeat their own
  tasks; owners and managers can give repeating tasks to others and see everyone's. The
  person, whoever set it up, or a manager can stop one; copies already made stay.
