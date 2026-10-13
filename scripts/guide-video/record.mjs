// Records a tutorial video: the real Wedding Yantra screens, driven step by step, with a ring on
// each button before it's tapped. Each scene stays on screen as long as its line of the
// voice-over, and the caption shows the words being said, a sentence at a time; `voice.mjs mix`
// then puts the voice in. The scenes for each video are in scenes/<video>.mjs. See README.md
// next to this file.
//
//   node scripts/guide-video/record.mjs <video>     (from a folder where `playwright` 1.63+ is installed)
//
// Settings (environment): BASE (web, default http://localhost:3000), API (default
// http://localhost:4000/api/v1), OUT (folder for the raw recording, default ./guide-video-out),
// CHROMIUM (browser path). Scenes may read their own (connect-facebook: META_APP_SECRET).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Playwright comes from the folder you run this in, not from the repo.
const require = createRequire(path.join(process.cwd(), "noop.js"));
const { chromium } = require("playwright");

const VIDEO = process.argv[2];
if (!VIDEO) {
  console.error("Usage: node scripts/guide-video/record.mjs <video>   (connect-facebook, events)");
  process.exit(1);
}
const scenes = await import(new URL(`./scenes/${VIDEO}.mjs`, import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = process.env.API ?? "http://localhost:4000/api/v1";
const OUT = path.resolve(process.env.OUT ?? "guide-video-out");
mkdirSync(OUT, { recursive: true });

// Where each line is in the voice-over and when each of its sentences starts (`voice.mjs`),
// so each scene lasts as long as its line and the caption keeps up with the voice.
const { lines: LINES, lead: LEAD } = JSON.parse(readFileSync(new URL(`../../assets/voiceover/${VIDEO}/lines.json`, import.meta.url), "utf8"));

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

// ---- The sample business: each video seeds its own -------------------------------------
const state = await scenes.setup({ api, signIn, tail: String(Date.now()).slice(-4) });

// ---- What every page gets: captions, a title card and a ring ------------------------------
const overlay = () => {
  const css = `
    #wy-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:16px;
      max-width:1180px;width:max-content;padding:16px 26px;border-radius:22px;background:rgba(36,24,3,.93);color:#fff;
      font:700 28px/1.3 var(--font-jakarta),system-ui,sans-serif;box-shadow:0 12px 40px rgba(36,24,3,.35);transition:opacity .3s}
    #wy-cap span{text-wrap:balance}
    dialog #wy-cap{top:20px;bottom:auto}
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
    html{scroll-behavior:smooth}
    body{padding-bottom:200px}`; // room for the last button on a page to scroll up clear of the caption
  const add = () => {
    if (document.getElementById("wy-style")) return;
    const s = document.createElement("style");
    s.id = "wy-style";
    s.textContent = css;
    document.head.appendChild(s);
  };
  // An open sheet is a modal <dialog>, drawn above everything else on the page: the caption and
  // the ring go inside it while it's open, or they'd be hidden under it. There the caption sits
  // at the top, clear of the sheet's buttons.
  const host = () => document.querySelector("dialog[open]") ?? document.body;
  const rehome = () => {
    const h = host();
    for (const id of ["wy-cap", "wy-ring"]) {
      const el = document.getElementById(id);
      if (el && el.parentNode !== h) h.appendChild(el);
    }
  };
  new MutationObserver(rehome).observe(document, { subtree: true, attributes: true, attributeFilter: ["open"] });
  window.__wy = {
    timers: [],
    /** The line's sentences, each as it's said: [ms after the line starts, words]; `since` ms have passed. */
    say(cues, step, lead, since) {
      this.stop();
      cues.forEach(([at, text], i) => {
        if (i === 0) this.caption(text, step);
        else this.timers.push(setTimeout(() => this.caption(text, step), Math.max(0, lead + at * 1000 - since)));
      });
    },
    stop() {
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
    },
    caption(text, step) {
      add();
      let el = document.getElementById("wy-cap");
      if (!el) {
        el = document.createElement("div");
        el.id = "wy-cap";
        host().appendChild(el);
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
      this.stop();
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
      host().appendChild(el);
    },
  };
};

// Indian English, so date fields read dd/mm/yyyy as customers see them (the browser takes that
// from its language, not the page's locale).
const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ["--lang=en-IN"],
  env: { ...process.env, LANG: "en_IN.UTF-8", LANGUAGE: "en_IN", LC_ALL: "en_IN.UTF-8" },
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  timezoneId: "Asia/Kolkata",
  locale: "en-IN",
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
await context.addInitScript(
  ([token, workspace]) => {
    localStorage.setItem("wy.token", token);
    localStorage.setItem("wy.workspace", workspace);
    // The tutorial corners themselves stay out of the videos.
    localStorage.setItem("wy.fb-video-closed", "1");
    localStorage.setItem("wy.events-video-closed", "1");
  },
  [state.token, state.workspace],
);
await context.addInitScript(overlay);
if (scenes.init) await context.addInitScript(scenes.init);
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const unring = () => page.evaluate(() => document.getElementById("wy-ring")?.remove());
/**
 * Moves something out from under the caption: the bottom band of the page, or the top of an
 * open sheet (where the caption sits then). What's tapped must be seen being tapped.
 */
async function clearOfCaption(locator) {
  const b = await locator.boundingBox();
  if (!b) return;
  const height = page.viewportSize().height;
  const inSheet = await page.evaluate(() => !!document.querySelector("dialog[open]"));
  if (!inSheet && b.y + b.height > height - 150) {
    await page.evaluate((by) => window.scrollBy({ top: by }), b.y + b.height - (height - 170));
  } else if (inSheet && b.y < 130) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
  } else return;
  await wait(450); // the scroll is smooth
}

// The voice's clock: zero is when the title card appears. `mark` notes when a line's scene
// appears (its line starts then); `hold` keeps the scene up until the line has been said, plus
// a breath. Times go to scenes.json for `voice.mjs mix`.
let zero = 0;
const at = {};
const kit = {
  page,
  BASE,
  API,
  OUT,
  api,
  wait,
  unring,
  clear: () => page.evaluate(() => window.__wy.clear()),
  title: (main, sub, small) => page.evaluate(([m, s, l]) => window.__wy.title(m, s, l), [main, sub, small]),
  /** The title card is up: the clock starts, its line starts, and the cover is taken (before the caption). */
  async start(id) {
    zero = performance.now();
    kit.mark(id);
    await page.screenshot({ path: path.join(OUT, "cover.jpg"), type: "jpeg", quality: 82 });
  },
  mark(id) {
    if (!LINES[id]) throw new Error(`No line ${id} in lines.json`);
    at[id] = performance.now() - zero;
  },
  /** Shows the line's words in the caption (with the step number), a sentence at a time. */
  async say(id, step) {
    const since = performance.now() - zero - at[id];
    await page.evaluate(([c, s, l, n]) => window.__wy.say(c, s, l, n), [LINES[id].cues, step ?? null, LEAD * 1000, since]);
  },
  /** Waits until the line's sentence `k` is about to be said (its caption shows then). */
  async cue(id, k) {
    const [from, to] = LINES[id].clip;
    const c = LINES[id].cues[k];
    // A sentence that shares its caption has no time of its own: about halfway through.
    const ms = c ? LEAD * 1000 + c[0] * 1000 : ((to - from) * 1000) / 2;
    const left = zero + at[id] + ms - 400 - performance.now(); // a ring takes 400 ms to settle
    if (left > 0) await wait(left);
  },
  async hold(id, after = 1000, atLeast = 3000) {
    const [from, to] = LINES[id].clip;
    const left = zero + at[id] + Math.max(atLeast, (to - from) * 1000 + after) - performance.now();
    if (left > 0) await wait(left);
  },
  /** Rings something on screen; "Tap here" only on what is about to be tapped. */
  async ring(locator, label = null) {
    await unring(); // a ring left on screen would float in place while the page scrolls
    await locator.scrollIntoViewIfNeeded();
    await clearOfCaption(locator);
    await wait(400);
    const b = await locator.boundingBox();
    if (b) await page.evaluate(([x, y, w, h, l]) => window.__wy.ring(x, y, w, h, l), [b.x, b.y, b.width, b.height, label]);
  },
  /** The line's one tap: rung, and tapped once the line has said to tap it. */
  async tap(locator, id, holdMs = 1600) {
    await kit.ring(locator, "Tap here");
    await wait(holdMs);
    await kit.hold(id, 300, 0);
    await unring();
    await locator.click();
  },
  /** A tap in the middle of a line: rung for a moment, then tapped. */
  async press(locator, ms = 1100) {
    await kit.ring(locator, "Tap here");
    await wait(ms);
    await unring();
    await locator.click();
  },
  /** Types as a person would, into an empty field (some fill themselves in). */
  async type(locator, text) {
    await locator.click();
    await locator.fill("");
    await locator.pressSequentially(text, { delay: 45 });
  },
};

await scenes.run(kit, state);
const end = performance.now() - zero; // closing the browser takes a while: the video ends here

const missing = Object.keys(LINES).filter((id) => at[id] == null);
if (missing.length) throw new Error(`No scene for ${missing.join(", ")}`);
const video = page.video();
await context.close();
await browser.close();
const result = {
  video: await video.path(),
  cover: path.join(OUT, "cover.jpg"),
  // Seconds after the title card appeared, when each line's scene appeared.
  at: Object.fromEntries(Object.entries(at).map(([id, ms]) => [id, Math.round(ms) / 1000])),
  end: Math.round(end) / 1000,
};
writeFileSync(path.join(OUT, "scenes.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
