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
