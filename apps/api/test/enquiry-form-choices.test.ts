import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Settings = {
  slug: string;
  enabled: boolean;
  fields: { key: string; required?: boolean }[];
  afterSubmit: string;
  whatsappPhone: string | null;
  defaultWhatsappPhone: string | null;
  whatsappText: string | null;
  redirectUrl: string | null;
};
type Public = { fields: { key: string; required?: boolean }[]; services: string[]; goesTo: string | null };
type Sent = { received: true; redirectUrl: string | null };
type Lead = { id: string; name: string; email: string | null; city: string | null; guestCount: number | null; budget: number | null; requirements: string | null };

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.query(`DELETE FROM lead_form_submissions`);
});

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const form = (await call<Settings>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner })).body.data;
  return { owner, ws, form, slug: form.slug };
}
const settle = (token: string, ws: string, body: object) => call<Settings>(t.app, "PATCH", `/workspaces/${ws}/lead-form`, { token, body });
const send = (slug: string, body: object) => call<Sent>(t.app, "POST", `/public/forms/${slug}`, { body });
const text = (url: string) => decodeURIComponent(new URL(url).searchParams.get("text") ?? "");

describe("after the enquiry form", () => {
  it("opens a WhatsApp chat with the owner by default, their enquiry typed in", async () => {
    const { owner, ws, form, slug } = await business("941");
    expect(form).toMatchObject({ afterSubmit: "whatsapp", whatsappPhone: null, defaultWhatsappPhone: "+919410000001" });
    expect(form.fields.map((f) => f.key)).toEqual(["email", "event_type", "event_date", "message"]);
    expect((await call<Public>(t.app, "GET", `/public/forms/${slug}`)).body.data.goesTo).toBe("whatsapp");

    const sent = await send(slug, { name: "Meera Joshi", phone: "9810000001", eventType: "wedding", eventDate: "2027-02-14" });
    expect(sent.status).toBe(201);
    const url = sent.body.data.redirectUrl!;
    expect(url.startsWith("https://wa.me/919410000001?text=")).toBe(true);
    expect(text(url)).toBe("Hi 941 Studio! I just sent you an enquiry.\n\nName: Meera Joshi\nEvent: Wedding, 14 Feb 2027");

    // Their own number and first line
    const saved = await settle(owner, ws, { whatsappPhone: "9876500000", whatsappText: "Namaste! Please share your packages." });
    expect(saved.body.data).toMatchObject({ whatsappPhone: "+919876500000", whatsappText: "Namaste! Please share your packages." });
    const again = (await send(slug, { name: "Anil Rao", phone: "9810000002" })).body.data.redirectUrl!;
    expect(again.startsWith("https://wa.me/919876500000?text=")).toBe(true);
    expect(text(again)).toBe("Namaste! Please share your packages.\n\nName: Anil Rao");
  });

  it("opens the business's own link, or just says thank you", async () => {
    const { owner, ws, slug } = await business("942");
    expect((await settle(owner, ws, { afterSubmit: "link" })).status).toBe(400);
    expect((await settle(owner, ws, { afterSubmit: "link", redirectUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await settle(owner, ws, { afterSubmit: "link", redirectUrl: "http://example.com" })).status).toBe(400);
    expect((await settle(owner, ws, { afterSubmit: "link", redirectUrl: "https://wa.me/message/ABCDEF123" })).status).toBe(200);
    expect((await call<Public>(t.app, "GET", `/public/forms/${slug}`)).body.data.goesTo).toBe("link");
    expect((await send(slug, { name: "Meera Joshi", phone: "9810000003" })).body.data.redirectUrl).toBe("https://wa.me/message/ABCDEF123");

    await settle(owner, ws, { afterSubmit: "thanks" });
    expect((await call<Public>(t.app, "GET", `/public/forms/${slug}`)).body.data.goesTo).toBeNull();
    expect((await send(slug, { name: "Anil Rao", phone: "9810000004" })).body.data.redirectUrl).toBeNull();
  });

  it("only the people who run every lead change it", async () => {
    const { owner, ws } = await business("943");
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Arfin Khan", phone: "9430000002", role: "staff", department: "sales" },
    });
    const staff = await signIn(t.app, "9430000002", "Arfin Khan");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
    expect((await call<Settings>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: staff })).status).toBe(200);
    expect((await settle(staff, ws, { afterSubmit: "thanks" })).status).toBe(403);
  });
});

describe("the form's questions", () => {
  it("asks only what the business chose, and needs the required ones", async () => {
    const { owner, ws, slug } = await business("944");
    const saved = await settle(owner, ws, {
      fields: [{ key: "email", required: true }, { key: "services" }, { key: "guests" }, { key: "budget" }, { key: "message" }],
    });
    expect(saved.status).toBe(200);
    const pub = (await call<Public>(t.app, "GET", `/public/forms/${slug}`)).body.data;
    expect(pub.fields.map((f) => f.key)).toEqual(["email", "services", "guests", "budget", "message"]);
    expect(pub.services.length).toBeGreaterThan(1);
    const [first, second] = pub.services as [string, string];

    const missing = await send(slug, { name: "Meera Joshi", phone: "9810000005" });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.fields).toMatchObject({ email: expect.any(String) });
    expect((await send(slug, { name: "Meera Joshi", phone: "9810000005", email: "not-an-email" })).status).toBe(400);

    const ok = await send(slug, {
      name: "Meera Joshi",
      phone: "9810000005",
      email: "meera@example.com",
      city: "Not asked, so dropped",
      services: [first, second.toUpperCase(), "Something made up"],
      guests: 300,
      budget: 500000,
      message: "Two days in Udaipur",
    });
    expect(ok.status).toBe(201);
    expect(text(ok.body.data.redirectUrl!)).toContain(`Looking for: ${first}, ${second}`);

    const list = (await call<{ leads: { id: string; name: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads;
    const lead = (await call<Lead>(t.app, "GET", `/workspaces/${ws}/leads/${list.find((l) => l.name === "Meera Joshi")!.id}`, { token: owner })).body.data;
    expect(lead).toMatchObject({ email: "meera@example.com", city: null, guestCount: 300, budget: 500000 });
    expect(lead.requirements).toBe(`Looking for: ${first}, ${second}\nTwo days in Udaipur`);

    expect((await settle(owner, ws, { fields: [{ key: "email" }, { key: "email" }] })).status).toBe(400);
    expect((await settle(owner, ws, { fields: [{ key: "shoe_size" }] })).status).toBe(400);
  });
});
