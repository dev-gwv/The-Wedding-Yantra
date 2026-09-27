import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Vendor = {
  id: string;
  name: string;
  category: string | null;
  service: string | null;
  contactPerson: string | null;
  phone: string | null;
  city: string | null;
  upiId: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  gstin: string | null;
  preferred: boolean;
  archived: boolean;
  notes: string | null;
};

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  return { owner, ws, staff: await join(`${prefix}0000002`, "staff", "Staff Person"), accountant: await join(`${prefix}0000003`, "accountant", "Acc Person") };
}

const florist = {
  name: "Ramesh Flowers",
  category: "florist",
  contactPerson: "Ramesh",
  phone: "9812300001",
  city: "Jaipur",
  upiId: "ramesh@okaxis",
  bankAccount: "1234 5678 9012",
  ifsc: "sbin0001234",
  gstin: "08abcde1234f1z5",
  preferred: true,
  notes: "Marigold ₹40 a string",
};

describe("the vendor master", () => {
  it("keeps category, contact, bank and GST details, a preferred star, and logs changes", async () => {
    const { owner, ws } = await team("861");
    const made = await call<Vendor>(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: florist });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({
      name: "Ramesh Flowers",
      category: "florist",
      service: "Florist",
      contactPerson: "Ramesh",
      phone: "+919812300001",
      city: "Jaipur",
      bankAccount: "123456789012",
      ifsc: "SBIN0001234",
      gstin: "08ABCDE1234F1Z5",
      preferred: true,
      archived: false,
    });

    // Preferred vendors come first among those with nothing to pay.
    await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Aaa Tent House", category: "decor" } });
    const list = await call<Vendor[]>(t.app, "GET", `/workspaces/${ws}/vendors`, { token: owner });
    expect(list.body.data.map((v) => v.name)).toEqual(["Ramesh Flowers", "Aaa Tent House"]);

    const edited = await call<Vendor>(t.app, "PATCH", `/workspaces/${ws}/vendors/${made.body.data.id}`, { token: owner, body: { preferred: false, city: "Udaipur" } });
    expect(edited.body.data).toMatchObject({ preferred: false, city: "Udaipur", ifsc: "SBIN0001234" });

    const log = await call<{ items: { action: string; link: { kind: string; id: string | null } | null }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner });
    const vendorItems = log.body.data.items.filter((i) => i.action.startsWith("vendor."));
    expect(vendorItems.map((i) => i.action)).toEqual(expect.arrayContaining(["vendor.added", "vendor.updated"]));
    expect(vendorItems[0]!.link?.kind).toBe("vendor");
  });

  it("checks the category, bank, IFSC and GST numbers, and duplicate numbers", async () => {
    const { owner, ws } = await team("862");
    const bad = async (body: Record<string, unknown>, field: string) => {
      const r = await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Some Vendor", ...body } });
      expect(r.status).toBe(400);
      expect(r.body.error.fields).toHaveProperty([field]);
    };
    await bad({ category: "martian" }, "category");
    await bad({ ifsc: "12345" }, "ifsc");
    await bad({ bankAccount: "12ab" }, "bankAccount");
    await bad({ gstin: "123" }, "gstin");

    await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: florist });
    const dupPhone = await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Ramesh again", phone: "9812300001" } });
    expect(dupPhone.status).toBe(409);
    expect(dupPhone.body.error.message).toBe("Ramesh Flowers already has this number");
    const dupGst = await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Other name", gstin: "08ABCDE1234F1Z5" } });
    expect(dupGst.status).toBe(409);
  });

  it("archives instead of deleting, and keeps each role to its part", async () => {
    const { owner, ws, staff, accountant } = await team("863");
    const v = (await call<Vendor>(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Old Generator Co" } })).body.data;
    await call(t.app, "PATCH", `/workspaces/${ws}/vendors/${v.id}`, { token: owner, body: { archived: true } });
    expect((await call<Vendor[]>(t.app, "GET", `/workspaces/${ws}/vendors`, { token: owner })).body.data.map((x) => x.id)).not.toContain(v.id);
    expect((await call<Vendor[]>(t.app, "GET", `/workspaces/${ws}/vendors?archived=true`, { token: owner })).body.data.map((x) => x.id)).toEqual([v.id]);
    const back = await call<Vendor>(t.app, "PATCH", `/workspaces/${ws}/vendors/${v.id}`, { token: owner, body: { archived: false } });
    expect(back.body.data.archived).toBe(false);

    // A vendor still owed money stays in the list until it's paid.
    await call(t.app, "POST", `/workspaces/${ws}/payouts`, { token: owner, body: { vendorId: v.id, description: "Generator hire", amount: 5000 } });
    const owed = await call(t.app, "PATCH", `/workspaces/${ws}/vendors/${v.id}`, { token: owner, body: { archived: true } });
    expect(owed.status).toBe(409);

    expect((await call(t.app, "GET", `/workspaces/${ws}/vendors`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/vendors/${v.id}`, { token: accountant })).status).toBe(200);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/vendors/${v.id}`, { token: accountant, body: { preferred: true } })).status).toBe(403);

    const other = await signIn(t.app, "8639999999", "Stranger");
    await createBusiness(t.app, other, "Elsewhere");
    expect((await call(t.app, "GET", `/workspaces/${ws}/vendors/${v.id}`, { token: other })).status).toBe(404);
  });

  it("turns what vendors were described as into categories", async () => {
    const { owner, ws } = await team("864");
    await t.db.query(
      `INSERT INTO vendors (workspace_id, name, service) VALUES ($1, 'A', ' florist '), ($1, 'B', 'Generator'), ($1, 'C', 'generator'), ($1, 'D', NULL)`,
      [ws],
    );
    // The migration runs again safely: only vendors without a category change.
    await t.db.query(await readFile(new URL("../migrations/0031_vendor_master.sql", import.meta.url), "utf8"));
    const list = (await call<Vendor[]>(t.app, "GET", `/workspaces/${ws}/vendors`, { token: owner })).body.data;
    const by = (n: string) => list.find((v) => v.name === n)!;
    expect(by("A")).toMatchObject({ category: "florist", service: "Florist" });
    expect(by("B").service).toBe("Generator");
    expect(by("B").category).toBe(by("C").category);
    expect(by("B").category).toMatch(/^x_/);
    expect(by("D").category).toBeNull();
    const options = await call<{ list: string; label: string }[]>(t.app, "GET", `/workspaces/${ws}/options?list=vendor_category`, { token: owner });
    expect(options.body.data.filter((o) => o.label === "Generator")).toHaveLength(1);
  });
});
