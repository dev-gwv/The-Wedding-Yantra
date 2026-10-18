// "Connect Facebook & Instagram leads": the real screens against the pretend Facebook
// (META_FAKE). Needs META_APP_SECRET (the API's) to sign the pretend webhook.

import { createHmac } from "node:crypto";

const APP_SECRET = process.env.META_APP_SECRET ?? "walk-app-secret";

/** A sample business: the owner, two salespeople and a couple of leads. */
export async function setup({ api, signIn, tail }) {
  const owner = await signIn(`+91987697${tail}`, "Riya Kapoor");
  const ws = (await api("POST", "/workspaces", { name: "Shubh Vivah Weddings", businessTypeIds: ["wedding_planner"], city: "Jaipur" }, owner)).id;
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
  return { token: owner, workspace: ws };
}

/** The pretend Facebook says so on the settings page; customers never see that. */
export const init = () => {
  new MutationObserver(() => {
    for (const el of document.querySelectorAll("div,p")) {
      if (el.childElementCount === 0 && el.textContent?.startsWith("Test mode:")) el.style.display = "none";
    }
  }).observe(document, { childList: true, subtree: true });
};

export async function run(k, { token: owner, workspace: ws }) {
  const { page, BASE, API, api, wait } = k;
  async function showStep(stepId, id, step) {
    await page.evaluate((i) => document.getElementById(i)?.scrollIntoView({ block: "center" }), `step-${stepId}`);
    await wait(500);
    k.mark(id);
    await k.say(id, step);
    await k.hold(id);
  }

  // ---- 1. Title ---------------------------------------------------------------------------
  await page.goto(`${BASE}/guides/facebook-leads`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await k.title("Get your Facebook & Instagram leads in Wedding Yantra", "Step by step · about 10 minutes, once", "Wedding Yantra · How to");
  // Everything before the title card is the page loading: `voice.mjs mix` cuts there.
  await k.start("01-title");
  await k.say("01-title");
  await k.hold("01-title");
  await k.clear();

  // ---- 2. Before you start (on Facebook) ---------------------------------------------------
  await showStep("page", "02-page", "1");
  await showStep("admin", "03-admin", "2");
  await showStep("form", "04-form", "3");

  // ---- 3. In Wedding Yantra: Leads → Connect now -------------------------------------------
  await page.goto(`${BASE}/app/leads`);
  const card = page.getByText("Get your Facebook & Instagram leads here by themselves");
  await card.waitFor({ timeout: 20000 });
  k.mark("05-leads");
  await k.say("05-leads", "4");
  await wait(1200);
  await k.tap(page.getByRole("link", { name: "Connect now" }), "05-leads", 2200);

  // ---- 4. Continue with Facebook, and what Facebook shows -------------------------------------
  const cont = page.getByRole("button", { name: "Continue with Facebook" }).first();
  await cont.waitFor({ timeout: 20000 });
  k.mark("06-continue");
  await k.say("06-continue", "5");
  await k.ring(cont, "Tap here");
  await k.hold("06-continue");
  await page.goto(`${BASE}/guides/facebook-leads`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await showStep("login", "07-login", "6");
  await showStep("choose", "08-choose", "7");

  // The pretend Facebook sends us straight back, as the real one does after "Save".
  await page.goto(`${BASE}/app/settings/facebook-leads`);
  await page.getByRole("button", { name: "Continue with Facebook" }).first().click();
  await page.waitForURL(/settings\/facebook-leads/, { timeout: 30000 });
  const switchOn = page.getByRole("button", { name: /Switch on/ });
  await switchOn.waitFor({ timeout: 30000 });
  k.mark("09-switch-on");
  await k.say("09-switch-on", "8");
  await wait(1200);
  await k.tap(switchOn, "09-switch-on", 2200);
  const receiving = page.getByText("Receiving leads").first();
  await receiving.waitFor({ timeout: 20000 });
  await k.ring(receiving);
  k.mark("10-receiving");
  await k.say("10-receiving", "8");
  await k.hold("10-receiving");
  await k.clear();

  // ---- 5. Who gets the leads -----------------------------------------------------------------
  const everyone = page.getByText("Everyone with the Leads screen").first();
  await everyone.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById("who-gets")?.scrollIntoView({ block: "center" }));
  await wait(600);
  await k.ring(everyone);
  k.mark("11-who-gets");
  await k.say("11-who-gets", "9");
  await k.hold("11-who-gets");
  await k.clear();

  // ---- 6. Send a test lead ---------------------------------------------------------------------
  const test = page.getByRole("button", { name: /Send a test lead/ }).first();
  k.mark("12-test");
  await k.say("12-test", "10");
  await k.tap(test, "12-test", 2000);
  const received = page.getByText(/Test lead received/).first();
  await received.waitFor({ timeout: 30000 });
  await received.scrollIntoViewIfNeeded();
  await k.ring(received);
  k.mark("13-received");
  await k.say("13-received", "10");
  await k.hold("13-received");
  await k.clear();

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
  // Open Leads as soon as the lead is in, rather than after a fixed wait (no dead air).
  for (let tries = 0; ; tries++) {
    const { leads } = await api("GET", `/workspaces/${ws}/leads`, undefined, owner);
    if (leads.some((l) => l.name === "Priya Sharma")) break;
    if (tries > 120) throw new Error("The pretend Facebook lead never arrived");
    await wait(250);
  }
  await page.goto(`${BASE}/app/leads`);
  const priya = page.getByText("Priya Sharma").first();
  await priya.waitFor({ timeout: 30000 });
  await wait(600);
  await k.ring(priya);
  k.mark("14-done");
  await k.say("14-done", "✓");
  await k.hold("14-done");
  await k.clear();

  // ---- 8. End card -------------------------------------------------------------------------------
  await k.title("Need help?", "Open Leads and tap “See how” for every step, with pictures", "Wedding Yantra");
  k.mark("15-help");
  await k.say("15-help");
  await k.hold("15-help", 1500);
}
