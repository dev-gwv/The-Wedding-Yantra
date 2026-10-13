// Records the "Connect Facebook & Instagram leads" tutorial video: the real Wedding Yantra
// screens, driven step by step against the pretend Facebook (META_FAKE), with big captions
// and a ring on each button before it's tapped. No voice. See README.md next to this file.
//
//   node scripts/guide-video/record.mjs        (from a folder where `playwright` is installed)
//
// Settings (environment): BASE (web, default http://localhost:3000), API (default
// http://localhost:4000/api/v1), META_APP_SECRET (the API's, to sign the pretend webhook),
// OUT (folder for the raw recording, default ./guide-video-out), CHROMIUM (browser path).

import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Playwright comes from the folder you run this in, not from the repo.
const require = createRequire(path.join(process.cwd(), "noop.js"));
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3000";
const API = process.env.API ?? "http://localhost:4000/api/v1";
const APP_SECRET = process.env.META_APP_SECRET ?? "walk-app-secret";
const OUT = path.resolve(process.env.OUT ?? "guide-video-out");
mkdirSync(OUT, { recursive: true });

async function api(method, p, body, token) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!j.success) throw new Error(`${method} ${p}: ${JSON.stringify(j.error)}`);
  return j.data;
}
async function signIn(phone, name) {
  const { devCode } = await api("POST", "/auth/otp/request", { phone });
  const { token } = await api("POST", "/auth/otp/verify", { phone, code: devCode });
  await api("PATCH", "/auth/me", { name }, token);
  return token;
}

// ---- A sample business: the owner, two salespeople and a couple of leads ----------------
const tail = String(Date.now()).slice(-4);
const owner = await signIn(`+91987697${tail}`, "Riya Kapoor");
const ws = (await api("POST", "/workspaces", { name: "Shubh Vivah Weddings", businessTypeId: "wedding_planner", city: "Jaipur" }, owner)).id;
await api("PATCH", `/workspaces/${ws}`, { phone: "9876500000", address: "C-Scheme, Jaipur", pricesConfirmed: true }, owner);
for (const [i, name] of ["Kabir Mehta", "Neha Joshi"].entries()) {
  const phone = `98669${tail}${i}`;
  const inv = await api("POST", `/workspaces/${ws}/invitations`, { name, phone, role: "staff" }, owner);
  const t = await signIn(`+91${phone}`, name);
  await api("POST", `/invitations/${inv.token}/accept`, undefined, t);
  const m = (await api("GET", `/workspaces/${ws}/team`, undefined, owner)).members.find((x) => x.name === name);
  await api("PUT", `/workspaces/${ws}/members/${m.id}/access`, { department: "sales" }, owner);
  await api("POST", `/workspaces/${ws}/leads`, { name: i ? "Kapoor family" : "Verma family", phone: `981110000${i}`, source: "instagram" }, t);
}

// ---- What every page gets: captions, a title card, a ring, and no test-mode notice -------
const overlay = () => {
  const css = `
    #wy-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:16px;
      max-width:1180px;width:max-content;padding:16px 26px;border-radius:22px;background:rgba(36,24,3,.93);color:#fff;
      font:700 28px/1.3 var(--font-jakarta),system-ui,sans-serif;box-shadow:0 12px 40px rgba(36,24,3,.35);transition:opacity .3s}
    #wy-cap b{display:grid;place-items:center;flex:none;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#FF6A00,#FFC02E);font-size:22px}
    #wy-title{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;
      background:linear-gradient(135deg,#FF6A00 0%,#FF8A1A 45%,#FFC02E 100%);color:#fff;text-align:center;padding:60px;
      font-family:var(--font-bricolage),system-ui,sans-serif}
    #wy-title small{font:800 20px var(--font-jakarta),system-ui;letter-spacing:.14em;text-transform:uppercase;opacity:.9}
    #wy-title h1{font-size:64px;line-height:1.05;font-weight:800;max-width:1000px;margin:0}
    #wy-title p{font:600 30px var(--font-jakarta),system-ui;margin:0;opacity:.95}
    #wy-ring{position:fixed;z-index:2147483645;border:5px solid #FF6A00;border-radius:16px;pointer-events:none;
      box-shadow:0 0 0 10px rgba(255,106,0,.22);animation:wyPulse 1s ease-in-out infinite}
    #wy-ring span{position:absolute;top:-34px;right:-6px;background:#FF6A00;color:#fff;font:800 15px var(--font-jakarta),system-ui;
      padding:5px 12px;border-radius:999px;letter-spacing:.06em;text-transform:uppercase}
    @keyframes wyPulse{0%,100%{box-shadow:0 0 0 6px rgba(255,106,0,.25)}50%{box-shadow:0 0 0 16px rgba(255,106,0,.12)}}
    html{scroll-behavior:smooth}`;
  const add = () => {
    if (document.getElementById("wy-style")) return;
    const s = document.createElement("style");
    s.id = "wy-style";
    s.textContent = css;
    document.head.appendChild(s);
  };
  window.__wy = {
    caption(text, step) {
      add();
      let el = document.getElementById("wy-cap");
      if (!el) {
        el = document.createElement("div");
        el.id = "wy-cap";
        document.body.appendChild(el);
      }
      el.innerHTML = `${step ? `<b>${step}</b>` : ""}<span></span>`;
      el.querySelector("span").textContent = text;
    },
    title(main, sub, small) {
      add();
      let el = document.getElementById("wy-title");
      if (!el) {
        el = document.createElement("div");
        el.id = "wy-title";
        document.body.appendChild(el);
      }
      el.innerHTML = `<small></small><h1></h1><p></p>`;
      el.querySelector("small").textContent = small ?? "Wedding Yantra";
      el.querySelector("h1").textContent = main;
      el.querySelector("p").textContent = sub ?? "";
    },
    clear() {
      for (const id of ["wy-cap", "wy-title", "wy-ring"]) document.getElementById(id)?.remove();
    },
    ring(x, y, w, h, label) {
      add();
      document.getElementById("wy-ring")?.remove();
      const el = document.createElement("div");
      el.id = "wy-ring";
      Object.assign(el.style, { left: `${x - 8}px`, top: `${y - 8}px`, width: `${w + 16}px`, height: `${h + 16}px` });
      if (label) {
        const tag = document.createElement("span");
        tag.textContent = label;
        el.appendChild(tag);
      }
      document.body.appendChild(el);
    },
  };
  // The pretend Facebook says so on the settings page; customers never see that.
  new MutationObserver(() => {
    for (const el of document.querySelectorAll("div,p")) {
      if (el.childElementCount === 0 && el.textContent?.startsWith("Test mode:")) el.style.display = "none";
    }
  }).observe(document, { childList: true, subtree: true });
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  timezoneId: "Asia/Kolkata",
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
await context.addInitScript(
  ([token, workspace]) => {
    localStorage.setItem("wy.token", token);
    localStorage.setItem("wy.workspace", workspace);
    localStorage.setItem("wy.fb-video-closed", "1"); // the video corner itself stays out of the video
  },
  [owner, ws],
);
await context.addInitScript(overlay);
const page = await context.newPage();
const recordingFrom = Date.now();
const wait = (ms) => page.waitForTimeout(ms);
const caption = (text, step) => page.evaluate(([t, s]) => window.__wy.caption(t, s), [text, step ?? null]);
const clear = () => page.evaluate(() => window.__wy.clear());
/** Rings something on screen; "Tap here" only on what is about to be tapped. */
async function ring(locator, label = null) {
  await locator.scrollIntoViewIfNeeded();
  await wait(400);
  const b = await locator.boundingBox();
  if (b) await page.evaluate(([x, y, w, h, l]) => window.__wy.ring(x, y, w, h, l), [b.x, b.y, b.width, b.height, label]);
}
async function tap(locator, holdMs = 1600) {
  await ring(locator, "Tap here");
  await wait(holdMs);
  await page.evaluate(() => document.getElementById("wy-ring")?.remove());
  await locator.click();
}
async function showStep(id, text, step, ms = 5200) {
  await page.evaluate((i) => document.getElementById(i)?.scrollIntoView({ block: "center" }), `step-${id}`);
  await wait(500);
  await caption(text, step);
  await wait(ms);
}

// ---- 1. Title ---------------------------------------------------------------------------
await page.goto(`${BASE}/guides/facebook-leads`);
await page.getByRole("heading", { level: 1 }).waitFor();
await page.evaluate(() => window.__wy.title("Get your Facebook & Instagram leads in Wedding Yantra", "Step by step · about 10 minutes, once", "Wedding Yantra · How to"));
await wait(300);
// Everything before the title card is the page loading: cut when encoding.
const trimStart = (Date.now() - recordingFrom) / 1000;
const started = Date.now();
await page.screenshot({ path: path.join(OUT, "cover.jpg"), type: "jpeg", quality: 82 });
await wait(4200);
await clear();

// ---- 2. Before you start (on Facebook) ---------------------------------------------------
await showStep("page", "Before you start: you need a Facebook Page for your business", "1");
await showStep("admin", "You must be an admin of that Page, with “Full control”", "2");
await showStep("form", "And a lead form (Instant Form) on Facebook for your ads", "3");

// ---- 3. In Wedding Yantra: Leads → Connect now -------------------------------------------
await page.goto(`${BASE}/app/leads`);
const card = page.getByText("Get your Facebook & Instagram leads here by themselves");
await card.waitFor({ timeout: 20000 });
await caption("In Wedding Yantra, open Leads and tap “Connect now”", "4");
await wait(1200);
await tap(page.getByRole("link", { name: "Connect now" }), 2200);

// ---- 4. Continue with Facebook, and what Facebook shows -------------------------------------
const cont = page.getByRole("button", { name: "Continue with Facebook" }).first();
await cont.waitFor({ timeout: 20000 });
await caption("Tap “Continue with Facebook”", "5");
await ring(cont, "Tap here");
await wait(3000);
await page.goto(`${BASE}/guides/facebook-leads`);
await page.getByRole("heading", { level: 1 }).waitFor();
await showStep("login", "Facebook opens. Log in and tap “Continue as (your name)”", "6", 5600);
await showStep("choose", "Tick your Page. Keep every switch ON. Tap “Save”", "7", 6000);

// The pretend Facebook sends us straight back, as the real one does after "Save".
await page.goto(`${BASE}/app/settings/facebook-leads`);
await page.getByRole("button", { name: "Continue with Facebook" }).first().click();
await page.waitForURL(/settings\/facebook-leads/, { timeout: 30000 });
const switchOn = page.getByRole("button", { name: /Switch on/ });
await switchOn.waitFor({ timeout: 30000 });
await caption("Back in Wedding Yantra: tick your Page and tap “Switch on”", "8");
await wait(1200);
await tap(switchOn, 2200);
const receiving = page.getByText("Receiving leads").first();
await receiving.waitFor({ timeout: 20000 });
await ring(receiving);
await caption("Your Page now says “Receiving leads”", "8");
await wait(3400);
await clear();

// ---- 5. Who gets the leads -----------------------------------------------------------------
const everyone = page.getByText("Everyone with the Leads screen").first();
await everyone.scrollIntoViewIfNeeded();
await page.evaluate(() => document.getElementById("who-gets")?.scrollIntoView({ block: "center" }));
await wait(600);
await ring(everyone);
await caption("Each new lead goes to the salesperson with the fewest open leads", "9");
await wait(5600);
await clear();

// ---- 6. Send a test lead ---------------------------------------------------------------------
const test = page.getByRole("button", { name: /Send a test lead/ }).first();
await caption("Tap “Send a test lead”", "10");
await tap(test, 2000);
const received = page.getByText(/Test lead received/).first();
await received.waitFor({ timeout: 30000 });
await received.scrollIntoViewIfNeeded();
await ring(received);
await caption("“Test lead received”: it works!", "10");
await wait(3600);
await clear();

// ---- 7. A real-looking lead comes in by itself ----------------------------------------------
const seeded = await api("POST", "/integrations/meta/dev/leads", { workspaceId: ws, platform: "ig" }, owner);
const now = Math.floor(Date.now() / 1000);
const raw = JSON.stringify({
  object: "page",
  entry: [{ id: seeded.pageId, time: now, changes: seeded.leads.map((l) => ({ field: "leadgen", value: { leadgen_id: l.leadgenId, page_id: seeded.pageId, form_id: seeded.formId, created_time: now } })) }],
});
await fetch(`${API}/integrations/meta/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}` },
  body: raw,
});
await wait(2500);
await page.goto(`${BASE}/app/leads`);
const priya = page.getByText("Priya Sharma").first();
await priya.waitFor({ timeout: 30000 });
await wait(600);
await ring(priya);
await caption("Done! New leads from your ads now come in by themselves, with an alert", "✓");
await wait(5600);
await clear();

// ---- 8. End card -------------------------------------------------------------------------------
await page.evaluate(() => window.__wy.title("Need help?", "Open Leads and tap “See how” for every step, with pictures", "Wedding Yantra"));
await wait(4200);

const seconds = Math.round((Date.now() - started) / 1000);
const video = page.video();
await context.close();
await browser.close();
console.log(JSON.stringify({ video: await video.path(), cover: path.join(OUT, "cover.jpg"), trimStart, seconds }));
