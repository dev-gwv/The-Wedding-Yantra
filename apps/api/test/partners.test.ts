import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Partner = {
  id: string;
  name: string;
  label: string | null;
  vendorName: string | null;
  code: string;
  sharing: boolean;
  showPhone: boolean;
  scans: number;
  enquiries: number;
  booked: number;
  archived: boolean;
  viewToken: string | null;
  leads: { id: string; name: string; source: string; partner: { id: string; name: string } | null }[];
};
type Lead = { id: string; name: string; source: string; stageId: string; partner: { id: string; name: string } | null };
type Page = {
  businessName: string;
  partnerName: string;
  scans: number;
  enquiries: number;
  booked: number;
  leads: { name: string; phone: string | null; eventType: string | null; status: string }[];
};

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});
// Every enquiry in these tests comes from one address; keep under the hourly limit.
beforeEach(async () => {
  await t.db.query(`DELETE FROM lead_form_submissions`);
});

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const { slug } = (await call<{ slug: string }>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner })).body.data;
  return { owner, ws, slug };
}

const enquire = (slug: string, body: object) => call(t.app, "POST", `/public/forms/${slug}`, { body });

describe("partner QR codes", () => {
  it("credits enquiries through a partner's code, counts scans, and keeps the first partner", async () => {
    const { owner, ws, slug } = await business("901");
    const vendor = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Riya Boutique" } });
    const made = await call<Partner>(t.app, "POST", `/workspaces/${ws}/partners`, {
      token: owner,
      body: { name: "Riya Boutique", label: "Boutique", vendorId: vendor.body.data.id, phone: "9812300001" },
    });
    expect(made.status).toBe(201);
    const p = made.body.data;
    expect(p).toMatchObject({ vendorName: "Riya Boutique", sharing: true, scans: 0, enquiries: 0 });
    expect(p.code).toMatch(/^[a-z0-9]{6}$/);
    expect(p.viewToken).toBeTruthy();
    expect((await call(t.app, "POST", `/workspaces/${ws}/partners`, { token: owner, body: { name: "riya boutique" } })).status).toBe(409);

    // Scanning opens the form, says who sent them, and counts.
    const form = await call<{ partner: string | null }>(t.app, "GET", `/public/forms/${slug}?p=${p.code}`);
    expect(form.body.data.partner).toBe("Riya Boutique");
    await call(t.app, "GET", `/public/forms/${slug}?p=${p.code.toUpperCase()}`);

    expect((await enquire(slug, { name: "Pooja Sharma", phone: "9876512345", eventType: "wedding", p: p.code })).status).toBe(201);
    // The same number again, from another partner or none: a note on the open lead, the credit stays.
    const other = (await call<Partner>(t.app, "POST", `/workspaces/${ws}/partners`, { token: owner, body: { name: "Gold Jewellers" } })).body.data;
    await enquire(slug, { name: "Pooja Sharma", phone: "9876512345", message: "Also mehendi", p: other.code });

    const leads = (await call<{ leads: Lead[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads;
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: "partner", partner: { id: p.id, name: "Riya Boutique" } });
    const lead = await call<{ referredBy: string | null }>(t.app, "GET", `/workspaces/${ws}/leads/${leads[0]!.id}`, { token: owner });
    expect(lead.body.data.referredBy).toBe("Riya Boutique");

    const detail = (await call<Partner>(t.app, "GET", `/workspaces/${ws}/partners/${p.id}`, { token: owner })).body.data;
    expect(detail).toMatchObject({ scans: 2, enquiries: 1 });
    expect(detail.leads.map((l) => l.name)).toEqual(["Pooja Sharma"]);
    const list = (await call<Partner[]>(t.app, "GET", `/workspaces/${ws}/partners`, { token: owner })).body.data;
    expect(list.map((x) => [x.name, x.enquiries])).toEqual([
      ["Riya Boutique", 1],
      ["Gold Jewellers", 0],
    ]);
    const filtered = (await call<{ leads: Lead[] }>(t.app, "GET", `/workspaces/${ws}/leads?partnerId=${other.id}`, { token: owner })).body.data.leads;
    expect(filtered).toHaveLength(0);
  });

  it("never loses an enquiry: an unknown or ended partner's code still makes an uncredited lead", async () => {
    const { owner, ws, slug } = await business("902");
    const p = (await call<Partner>(t.app, "POST", `/workspaces/${ws}/partners`, { token: owner, body: { name: "Venue Partner" } })).body.data;
    await call(t.app, "PATCH", `/workspaces/${ws}/partners/${p.id}`, { token: owner, body: { archived: true } });

    const form = await call<{ partner: string | null }>(t.app, "GET", `/public/forms/${slug}?p=${p.code}`);
    expect(form.status).toBe(200);
    expect(form.body.data.partner).toBeNull();
    await enquire(slug, { name: "Ankit Jain", phone: "9876500011", p: p.code });
    await enquire(slug, { name: "Meera Rao", phone: "9876500012", p: "zzzzzz" });
    const leads = (await call<{ leads: Lead[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads;
    expect(leads.map((l) => [l.source, l.partner])).toEqual([
      ["enquiry_form", null],
      ["enquiry_form", null],
    ]);
    expect((await call(t.app, "GET", `/public/partners/${p.viewToken}`)).status).toBe(404);
    const archived = (await call<Partner[]>(t.app, "GET", `/workspaces/${ws}/partners?archived=true`, { token: owner })).body.data;
    expect(archived.map((x) => x.name)).toEqual(["Venue Partner"]);
  });

  it("gives the partner their own page: their enquiries, where each stands, numbers masked unless allowed", async () => {
    const { owner, ws, slug } = await business("903");
    const p = (await call<Partner>(t.app, "POST", `/workspaces/${ws}/partners`, { token: owner, body: { name: "Riya Boutique" } })).body.data;
    await call(t.app, "GET", `/public/forms/${slug}?p=${p.code}`);
    await enquire(slug, { name: "Pooja Sharma", phone: "9876512345", eventType: "wedding", p: p.code });
    await enquire(slug, { name: "Neha Gupta", phone: "9876512346", p: p.code });
    await enquire(slug, { name: "Not Theirs", phone: "9876512347" });

    // One of theirs gets booked.
    const list = (await call<{ leads: Lead[]; stages: { id: string; kind: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data;
    const won = list.stages.find((s) => s.kind === "won")!;
    const pooja = list.leads.find((l) => l.name === "Pooja Sharma")!;
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${pooja.id}`, { token: owner, body: { stageId: won.id } });

    const page = await call<Page>(t.app, "GET", `/public/partners/${p.viewToken}`);
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({ businessName: "903 Studio", partnerName: "Riya Boutique", scans: 1, enquiries: 2, booked: 1 });
    expect(page.body.data.leads).toEqual([
      expect.objectContaining({ name: "Neha Gupta", phone: "98xxxxx346", status: "new" }),
      expect.objectContaining({ name: "Pooja Sharma", phone: "98xxxxx345", eventType: "wedding", status: "booked" }),
    ]);
    expect(JSON.stringify(page.body.data)).not.toMatch(/budget|amount|total/i);

    await call(t.app, "PATCH", `/workspaces/${ws}/partners/${p.id}`, { token: owner, body: { showPhone: true } });
    const shown = await call<Page>(t.app, "GET", `/public/partners/${p.viewToken}`);
    expect(shown.body.data.leads[0]?.phone).toBe("+919876512346");

    // Stop sharing: the link dies. A new link: only the new one works.
    await call(t.app, "POST", `/workspaces/${ws}/partners/${p.id}/sharing`, { token: owner, body: { on: false } });
    expect((await call(t.app, "GET", `/public/partners/${p.viewToken}`)).status).toBe(404);
    const again = (await call<Partner>(t.app, "POST", `/workspaces/${ws}/partners/${p.id}/sharing`, { token: owner, body: { on: true } })).body.data;
    expect(again.viewToken).not.toBe(p.viewToken);
    expect((await call(t.app, "GET", `/public/partners/${again.viewToken}`)).status).toBe(200);
  });

  it("is for owners and managers, and each business keeps its partners to itself", async () => {
    const { owner, ws, slug } = await business("904");
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: "Staff Person", phone: "9040000002", role: "staff" } });
    const staff = await signIn(t.app, "9040000002", "Staff Person");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
    expect((await call(t.app, "GET", `/workspaces/${ws}/partners`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/partners`, { token: staff, body: { name: "Mine" } })).status).toBe(403);

    const other = await business("905");
    const theirs = (await call<Partner>(t.app, "POST", `/workspaces/${other.ws}/partners`, { token: other.owner, body: { name: "Their Partner" } })).body.data;
    expect((await call(t.app, "GET", `/workspaces/${ws}/partners/${theirs.id}`, { token: owner })).status).toBe(404);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/partners/${theirs.id}`, { token: owner, body: { name: "Stolen" } })).status).toBe(404);
    // Their code on our form credits nobody.
    await enquire(slug, { name: "Cross Over", phone: "9876500099", p: theirs.code });
    const leads = (await call<{ leads: Lead[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads;
    expect(leads[0]).toMatchObject({ source: "enquiry_form", partner: null });
    expect((await call(t.app, "POST", `/workspaces/${ws}/partners`, { token: owner, body: { name: "Bad Vendor", vendorId: theirs.id } })).status).toBe(400);
  });
});
