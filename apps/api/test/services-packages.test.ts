import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, signIn, type TestContext, setup } from "./helpers.js";

type Service = { id: string; name: string; category: string | null; categoryLabel: string | null; unit: string; price: number };
type Pkg = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  active: boolean;
  worth: number;
  items: { catalogueItemId: string | null; name: string; quantity: number | null; value: number | null }[];
};
type Option = { list: string; key: string; label: string };

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

async function business(prefix: string, trade: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const res = await call<{ id: string }>(t.app, "POST", "/workspaces", { token: owner, body: { name: `${prefix} ${trade}`, businessTypeId: trade, city: "Jaipur" } });
  const ws = res.body.data.id;
  const join = async (n: number, role: string) => {
    const phone = `${prefix}000000${n}`;
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: `${role} Person`, phone, role } });
    const token = await signIn(t.app, phone, `${role} Person`);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  return { owner, ws, join };
}

const options = async (ws: string, token: string, list: string) =>
  (await call<Option[]>(t.app, "GET", `/workspaces/${ws}/options?list=${list}`, { token })).body.data.filter((o) => o.list === list);

describe("services and packages for every trade", () => {
  it("a makeup artist starts with its own categories, team roles, vendors and packages", async () => {
    const { owner, ws } = await business("891", "makeup_artist");
    const cats = await options(ws, owner, "service_category");
    expect(cats.map((c) => c.label)).toEqual(["Bridal", "Party and family", "Hair and draping", "Add-ons and travel"]);
    expect((await options(ws, owner, "designation"))[0]?.label).toBe("Hair stylist");
    expect((await options(ws, owner, "vendor_category")).map((c) => c.label)).toContain("Product supplier");

    const services = (await call<Service[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: owner })).body.data;
    expect(services.find((s) => s.name === "Bridal HD makeup")).toMatchObject({ category: "bridal", categoryLabel: "Bridal" });
    expect(services.find((s) => s.name === "Hair styling")?.categoryLabel).toBe("Hair and draping");

    const pkgs = (await call<Pkg[]>(t.app, "GET", `/workspaces/${ws}/packages`, { token: owner })).body.data;
    const bridal = pkgs.find((p) => p.name === "Bridal package")!;
    expect(bridal).toMatchObject({ unit: "event", price: 32000, worth: 28500 });
    expect(bridal.items.map((i) => i.name)).toEqual(["Bridal HD makeup", "Hair styling", "Saree / dupatta draping", "Trial session before the wedding", "Touch-up kit for the day"]);
    expect(bridal.items[0]).toMatchObject({ quantity: 1, value: 25000 });
    expect(bridal.items[3]).toMatchObject({ catalogueItemId: null, quantity: null, value: null });
    expect(pkgs.find((p) => p.name === "Family package (5 people)")?.worth).toBe(30000);
  });

  it("a caterer's package is a menu priced per plate; a photographer's is days of work", async () => {
    const caterer = await business("892", "caterer");
    const menu = (await call<Pkg[]>(t.app, "GET", `/workspaces/${caterer.ws}/packages`, { token: caterer.owner })).body.data[0]!;
    expect(menu).toMatchObject({ name: "Silver veg menu", unit: "plate", price: 950, worth: 0 });
    expect(menu.items.every((i) => i.catalogueItemId === null)).toBe(true);
    expect((await options(caterer.ws, caterer.owner, "service_category")).map((c) => c.label)).toContain("Live counters");

    const photo = await business("893", "photographer");
    const gold = (await call<Pkg[]>(t.app, "GET", `/workspaces/${photo.ws}/packages`, { token: photo.owner })).body.data[0]!;
    expect(gold.items.find((i) => i.name === "Wedding photography")).toMatchObject({ quantity: 2, value: 120000 });
    expect(gold.worth).toBe(305000);
  });

  it("owners build packages from services and plain lines; others read; nobody borrows another's services", async () => {
    const { owner, ws, join } = await business("894", "makeup_artist");
    const staff = await join(2, "staff");
    const services = (await call<Service[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: owner })).body.data;
    const hd = services.find((s) => s.name === "Bridal HD makeup")!;
    const guest = services.find((s) => s.name === "Family & guest makeup")!;

    const made = await call<Pkg>(t.app, "POST", `/workspaces/${ws}/packages`, {
      token: owner,
      body: {
        name: "Destination bride",
        description: "For weddings out of town.",
        unit: "event",
        price: 60000,
        taxRate: 18,
        items: [{ catalogueItemId: hd.id }, { catalogueItemId: guest.id, quantity: 4 }, { text: "Travel and stay included" }],
      },
    });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ price: 60000, worth: 25000 + 4 * 3500 });
    expect(made.body.data.items.map((i) => i.quantity)).toEqual([1, 4, null]);

    // Change what's in it, then hide it from new quotes.
    const edited = await call<Pkg>(t.app, "PATCH", `/workspaces/${ws}/packages/${made.body.data.id}`, {
      token: owner,
      body: { price: 55000, items: [{ catalogueItemId: hd.id }, { text: "Travel and stay included" }] },
    });
    expect(edited.body.data).toMatchObject({ price: 55000, worth: 25000 });
    await call(t.app, "PATCH", `/workspaces/${ws}/packages/${made.body.data.id}`, { token: owner, body: { active: false } });
    const shown = (await call<Pkg[]>(t.app, "GET", `/workspaces/${ws}/packages`, { token: staff })).body.data;
    expect(shown.some((p) => p.name === "Destination bride")).toBe(false);
    const all = (await call<Pkg[]>(t.app, "GET", `/workspaces/${ws}/packages?all=true`, { token: owner })).body.data;
    expect(all.find((p) => p.name === "Destination bride")?.active).toBe(false);

    expect((await call(t.app, "POST", `/workspaces/${ws}/packages`, { token: staff, body: { name: "Mine", unit: "event", price: 1, items: [{ text: "x" }] } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/packages`, { token: owner, body: { name: "Empty", unit: "event", price: 1, items: [] } })).status).toBe(400);

    const other = await business("895", "photographer");
    const theirs = (await call<Service[]>(t.app, "GET", `/workspaces/${other.ws}/catalogue`, { token: other.owner })).body.data[0]!;
    const borrow = await call(t.app, "POST", `/workspaces/${ws}/packages`, { token: owner, body: { name: "Borrowed", unit: "event", price: 1, items: [{ catalogueItemId: theirs.id }] } });
    expect(borrow.status).toBe(400);
    expect((await call(t.app, "PATCH", `/workspaces/${other.ws}/packages/${made.body.data.id}`, { token: other.owner, body: { price: 1 } })).status).toBe(404);

    expect((await call(t.app, "DELETE", `/workspaces/${ws}/packages/${made.body.data.id}`, { token: owner })).status).toBe(200);
  });

  it("services take a category and the new ways to charge; a package fits on a quote as one line", async () => {
    const { owner, ws } = await business("896", "makeup_artist");
    const look = await call<Service>(t.app, "POST", `/workspaces/${ws}/catalogue`, { token: owner, body: { name: "Party look", category: "party", unit: "look", price: 6000 } });
    expect(look.status).toBe(201);
    expect(look.body.data).toMatchObject({ unit: "look", categoryLabel: "Party and family" });
    expect((await call(t.app, "POST", `/workspaces/${ws}/catalogue`, { token: owner, body: { name: "Bad", category: "nope", unit: "event", price: 1 } })).status).toBe(400);
    const moved = await call<Service>(t.app, "PATCH", `/workspaces/${ws}/catalogue/${look.body.data.id}`, { token: owner, body: { category: "bridal" } });
    expect(moved.body.data.categoryLabel).toBe("Bridal");

    const description = `Everything for the bride.\nIncludes: ${"Bridal HD makeup; ".repeat(30)}`;
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Priya Sharma" } });
    const quote = await call(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { clientId: client.body.data.id, title: "Bridal", items: [{ name: "Bridal package", description, unit: "event", quantity: 1, rate: 32000 }] },
    });
    expect([200, 201]).toContain(quote.status);
  });

  it("adds the trade's examples on request without doubling up, and the migration seeds older businesses", async () => {
    const { owner, ws } = await business("897", "decorator");
    const before = (await call<Pkg[]>(t.app, "GET", `/workspaces/${ws}/packages?all=true`, { token: owner })).body.data.length;
    const after = await call<Pkg[]>(t.app, "POST", `/workspaces/${ws}/packages/starter`, { token: owner });
    expect(after.body.data).toHaveLength(before);

    // As if made before this change: no trade lists, no categories on its services.
    await t.db.query(`DELETE FROM custom_options WHERE workspace_id = $1 AND (list = 'service_category' OR key LIKE 't\\_%')`, [ws]);
    await t.db.query(`UPDATE catalogue_items SET category = NULL WHERE workspace_id = $1`, [ws]);
    const sql = await readFile(new URL("../migrations/0034_services_and_packages.sql", import.meta.url), "utf8");
    await t.db.query(sql.replace(/ALTER TABLE custom_options[^;]*;\s*ALTER TABLE custom_options[^;]*;/, ""));
    expect((await options(ws, owner, "service_category")).map((c) => c.label)).toContain("Mandap and stage");
    expect((await options(ws, owner, "vendor_category")).map((c) => c.label)).toContain("Tent house");
    const services = (await call<Service[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: owner })).body.data;
    expect(services.find((s) => s.name === "Mandap decor")?.categoryLabel).toBe("Mandap and stage");
  });
});
