import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, setup, signIn, type TestContext } from "./helpers.js";

type Ws = { id: string; businessTypeId: string; businessTypeIds: string[]; businessTypeName: string; businessTypeIcon: string };
type Item = { name: string };
type Option = { list: string; key: string; label: string };
type Step = { title: string };

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

const counts = async (token: string, ws: string) => {
  const services = (await call<Item[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token })).body.data;
  const options = (await call<Option[]>(t.app, "GET", `/workspaces/${ws}/options`, { token })).body.data;
  const steps = (await call<Step[]>(t.app, "GET", `/workspaces/${ws}/checklist`, { token })).body.data;
  return { services, options, steps };
};

describe("a business that does several kinds of work", () => {
  it("starts with the lists of every kind it ticks, main first", async () => {
    const owner = await signIn(t.app, "9510000001", "Owner Person");
    const made = await call<Ws>(t.app, "POST", "/workspaces", {
      token: owner,
      body: { name: "Two Trades Studio", city: "Jaipur", businessTypeIds: ["wedding_planner", "photographer", "wedding_planner"] },
    });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({
      businessTypeId: "wedding_planner",
      businessTypeIds: ["wedding_planner", "photographer"],
      businessTypeName: "Wedding planner · Photographer & filmmaker",
      businessTypeIcon: "clipboard-list",
    });
    const ws = made.body.data.id;
    const me = (await call<{ workspaces: Ws[] }>(t.app, "GET", "/auth/me", { token: owner })).body.data.workspaces.find((w) => w.id === ws)!;
    expect(me.businessTypeIds).toEqual(["wedding_planner", "photographer"]);
    expect(me.businessTypeName).toBe("Wedding planner · Photographer & filmmaker");

    const packs = await t.db.query<{ id: string; services: { name: string }[]; checklist: { title: string }[] }>(
      `SELECT id, starter_pack->'services' AS services, starter_pack->'checklist' AS checklist FROM business_types WHERE id IN ('wedding_planner', 'photographer', 'caterer')`,
    );
    const pack = (id: string) => packs.rows.find((r) => r.id === id)!;
    const { services, options, steps } = await counts(owner, ws);
    const names = services.map((s) => s.name.toLowerCase());
    for (const id of ["wedding_planner", "photographer"]) for (const s of pack(id).services) expect(names).toContain(s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const titles = steps.map((s) => s.title.toLowerCase());
    for (const s of pack("photographer").checklist) expect(titles).toContain(s.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    // Each list has each name once.
    for (const list of ["service_category", "designation", "vendor_category", "expense_category"]) {
      const labels = options.filter((o) => o.list === list).map((o) => o.label.toLowerCase());
      expect(new Set(labels).size).toBe(labels.length);
    }
    expect(options.some((o) => o.list === "service_category")).toBe(true);

    // Adding a kind later brings its lists; taking one away keeps everything made.
    const before = await counts(owner, ws);
    const added = await call<Ws>(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { businessTypeIds: ["photographer", "wedding_planner", "caterer"] } });
    expect(added.status).toBe(200);
    expect(added.body.data).toMatchObject({ businessTypeId: "photographer", businessTypeIcon: "camera", businessTypeIds: ["photographer", "wedding_planner", "caterer"] });
    const after = await counts(owner, ws);
    for (const s of pack("caterer").services) expect(after.services.map((x) => x.name.toLowerCase())).toContain(s.name.toLowerCase());
    expect(after.services.length).toBeGreaterThan(before.services.length);

    // The same again changes nothing.
    await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { businessTypeIds: ["photographer", "wedding_planner", "caterer"] } });
    expect((await counts(owner, ws)).services.length).toBe(after.services.length);

    const fewer = await call<Ws>(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { businessTypeIds: ["caterer"] } });
    expect(fewer.body.data).toMatchObject({ businessTypeIds: ["caterer"], businessTypeName: "Caterer" });
    expect((await counts(owner, ws)).services.length).toBe(after.services.length);

    expect((await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { businessTypeIds: [] } })).status).toBe(400);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { businessTypeIds: ["nope"] } })).status).toBe(400);
  });

  it("still takes one kind from older apps, and refuses an unknown one", async () => {
    const owner = await signIn(t.app, "9520000001", "Owner Person");
    const one = await call<Ws>(t.app, "POST", "/workspaces", { token: owner, body: { name: "One Trade Studio", city: "Pune", businessTypeId: "caterer" } });
    expect(one.status).toBe(201);
    expect(one.body.data).toMatchObject({ businessTypeIds: ["caterer"], businessTypeName: "Caterer" });
    const bad = await call<unknown>(t.app, "POST", "/workspaces", { token: owner, body: { name: "Nope Studio", city: "Pune", businessTypeIds: ["nope"] } });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.fields).toMatchObject({ businessTypeIds: expect.any(String) });
    expect((await call(t.app, "POST", "/workspaces", { token: owner, body: { name: "None Studio", city: "Pune" } })).status).toBe(400);
  });
});
