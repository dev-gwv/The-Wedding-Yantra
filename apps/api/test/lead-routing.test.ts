import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTransaction } from "../src/db.js";
import { intakeLead } from "../src/modules/sales/intake.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Person = { token: string; userId: string; memberId: string };
type Routing = {
  everyoneWithLeads: boolean;
  people: { userId: string; name: string | null }[];
  includeOwner: boolean;
  skipOnLeave: boolean;
  pool: { userId: string; name: string | null; openLeads: number; onLeave: boolean }[];
};

/** A business with an owner and the people asked for, by name and role. */
async function business(prefix: string, people: [name: string, role: string][]) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const ownerId = (await t.db.query<{ id: string }>(`SELECT id FROM users WHERE phone = $1`, [`+91${prefix}0000001`])).rows[0]!.id;
  const team: Record<string, Person> = {};
  let n = 2;
  for (const [name, role] of people) {
    const phone = `${prefix}000000${n++}`;
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    const { rows } = await t.db.query<{ user_id: string; id: string }>(
      `SELECT m.user_id, m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND u.phone = $2`,
      [ws, `+91${phone}`],
    );
    team[name] = { token, userId: rows[0]!.user_id, memberId: rows[0]!.id };
  }
  return { owner, ownerId, ws, team };
}

let phones = 0;
/** One lead from an ad, given by routing. Each has its own phone, so none merge. */
const adLead = (ws: string) =>
  withTransaction(t.db, (tx) =>
    intakeLead(
      tx,
      {
        workspaceId: ws,
        source: "instagram_ad",
        via: "meta",
        fields: {
          name: "Ad Lead",
          phone: `+9198${String(++phones).padStart(8, "0")}`,
          email: null,
          city: null,
          venue: null,
          eventType: null,
          eventDate: null,
          guestCount: null,
          budget: null,
          requirements: null,
        },
        repeatWindowDays: 30,
        assignee: "routing",
        activityMeta: {},
        alertDetail: "Instagram ad",
      },
      new Date(),
    ),
  );
const nextFor = async (ws: string) => (await adLead(ws)).assignedTo;

/** Leads someone already has, typed in by the owner. */
async function give(ws: string, owner: string, userId: string, count: number, kind: "open" | "won" | "lost" = "open") {
  for (let i = 0; i < count; i++) {
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: `Lead ${i}`, assignedToUserId: userId } });
    if (kind !== "open") {
      await t.db.query(`UPDATE leads SET stage_id = (SELECT id FROM pipeline_stages WHERE workspace_id = $1 AND kind = $2 LIMIT 1) WHERE id = $3`, [
        ws,
        kind,
        lead.body.data.id,
      ]);
    }
  }
}

/** On leave today, in the business's own date. */
const onLeave = (ws: string, userId: string) =>
  t.db.query(
    `INSERT INTO time_off (workspace_id, user_id, start_date, end_date)
     SELECT id, $2, (now() AT TIME ZONE timezone)::date - 1, (now() AT TIME ZONE timezone)::date + 1 FROM workspaces WHERE id = $1`,
    [ws, userId],
  );

const getRouting = (ws: string, token: string) => call<Routing>(t.app, "GET", `/workspaces/${ws}/lead-routing`, { token });
const putRouting = (ws: string, token: string, body: Partial<{ everyoneWithLeads: boolean; people: string[]; includeOwner: boolean; skipOnLeave: boolean }>) =>
  call<Routing>(t.app, "PUT", `/workspaces/${ws}/lead-routing`, {
    token,
    body: { everyoneWithLeads: true, people: [], includeOwner: false, skipOnLeave: true, ...body },
  });

describe("fewest open leads", () => {
  it("gives each lead to whoever has the fewest open leads, taking turns on a tie", async () => {
    const { owner, ws, team } = await business("781", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
    ]);
    const { "Arfin Khan": arfin, "Bina Shah": bina } = team as Record<string, Person>;
    // Nobody has any: by name. Then whoever has fewer. Then, tied, whoever's last lead is older.
    expect(await nextFor(ws)).toBe(arfin!.userId);
    expect(await nextFor(ws)).toBe(bina!.userId);
    expect(await nextFor(ws)).toBe(arfin!.userId);
    expect(await nextFor(ws)).toBe(bina!.userId);

    // Arfin takes on three more by hand: Bina gets the next ones until they're level.
    await give(ws, owner, arfin!.userId, 3);
    expect(await nextFor(ws)).toBe(bina!.userId);
    expect(await nextFor(ws)).toBe(bina!.userId);
    expect(await nextFor(ws)).toBe(bina!.userId);
    // Level at 5 each; Arfin's last lead (typed in before Bina's three) is older.
    expect(await nextFor(ws)).toBe(arfin!.userId);

    // The person who gets it is alerted.
    const alerts = (await call<{ items: { kind: string; title: string }[] }>(t.app, "GET", `/workspaces/${ws}/notifications`, { token: bina!.token })).body
      .data.items;
    expect(alerts.filter((a) => a.kind === "lead.new")).toHaveLength(5);
  });

  it("on a tie, the person whose last lead is oldest goes first", async () => {
    const { owner, ws, team } = await business("782", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
    ]);
    await give(ws, owner, team["Arfin Khan"]!.userId, 1);
    await give(ws, owner, team["Bina Shah"]!.userId, 1);
    // Bina's lead came later, but Arfin's is made newer still.
    await t.db.query(`UPDATE leads SET created_at = now() + interval '1 minute' WHERE assigned_to = $1`, [team["Arfin Khan"]!.userId]);
    expect(await nextFor(ws)).toBe(team["Bina Shah"]!.userId);
  });

  it("won and lost leads don't count", async () => {
    const { owner, ws, team } = await business("783", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
    ]);
    await give(ws, owner, team["Arfin Khan"]!.userId, 2, "won");
    await give(ws, owner, team["Arfin Khan"]!.userId, 2, "lost");
    await give(ws, owner, team["Bina Shah"]!.userId, 1);
    expect(await nextFor(ws)).toBe(team["Arfin Khan"]!.userId);
  });

  it("skips anyone on leave today, unless everyone is", async () => {
    const { owner, ws, team } = await business("784", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
    ]);
    const [arfin, bina] = [team["Arfin Khan"]!, team["Bina Shah"]!];
    await give(ws, owner, bina.userId, 3);
    await onLeave(ws, arfin.userId);
    expect(await nextFor(ws)).toBe(bina.userId);

    const routing = (await getRouting(ws, owner)).body.data;
    expect(routing.pool).toEqual([
      { userId: bina.userId, name: "Bina Shah", openLeads: 4, onLeave: false },
      { userId: arfin.userId, name: "Arfin Khan", openLeads: 0, onLeave: true },
    ]);

    // Switched off: leave doesn't matter.
    await putRouting(ws, owner, { skipOnLeave: false });
    expect(await nextFor(ws)).toBe(arfin.userId);

    // Everyone off: nobody is skipped.
    await putRouting(ws, owner, { skipOnLeave: true });
    await onLeave(ws, bina.userId);
    expect(await nextFor(ws)).toBe(arfin.userId);
  });

  it("two leads at the same moment go to two different people", async () => {
    const { ws, team } = await business("785", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
    ]);
    const both = await Promise.all([adLead(ws), adLead(ws)]);
    expect(new Set(both.map((r) => r.assignedTo))).toEqual(new Set([team["Arfin Khan"]!.userId, team["Bina Shah"]!.userId]));
    const again = await Promise.all([adLead(ws), adLead(ws), adLead(ws), adLead(ws)]);
    const counts = new Map<string | null, number>();
    for (const r of again) counts.set(r.assignedTo, (counts.get(r.assignedTo) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2]);
  });

  it("leaves out people who left or don't have Leads, and the owner unless included", async () => {
    const { owner, ownerId, ws, team } = await business("786", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
      ["Kavya Rao", "accountant"],
    ]);
    const [arfin, bina, kavya] = [team["Arfin Khan"]!, team["Bina Shah"]!, team["Kavya Rao"]!];
    await give(ws, owner, bina.userId, 2);
    await call(t.app, "DELETE", `/workspaces/${ws}/members/${arfin.memberId}`, { token: owner });
    // Arfin left, Kavya has no Leads screen, the owner isn't in by default: Bina, however busy.
    expect(await nextFor(ws)).toBe(bina.userId);
    expect((await getRouting(ws, owner)).body.data.pool.map((p) => p.userId)).toEqual([bina.userId]);

    // The owner joins in, and has the fewest.
    await putRouting(ws, owner, { includeOwner: true });
    expect(await nextFor(ws)).toBe(ownerId);
    expect(kavya.userId).not.toBe(ownerId);
  });

  it("only the picked people get leads, while they still can", async () => {
    const { owner, ws, team } = await business("787", [
      ["Arfin Khan", "staff"],
      ["Bina Shah", "staff"],
      ["Chetan Das", "staff"],
    ]);
    const [arfin, bina, chetan] = [team["Arfin Khan"]!, team["Bina Shah"]!, team["Chetan Das"]!];
    await give(ws, owner, arfin.userId, 1);
    await give(ws, owner, bina.userId, 1);
    const saved = await putRouting(ws, owner, { everyoneWithLeads: false, people: [arfin.userId, bina.userId] });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      everyoneWithLeads: false,
      people: [
        { userId: arfin.userId, name: "Arfin Khan" },
        { userId: bina.userId, name: "Bina Shah" },
      ],
    });
    expect(saved.body.data.pool.map((p) => p.name)).toEqual(["Arfin Khan", "Bina Shah"]);
    // Chetan has none but wasn't picked.
    expect(await nextFor(ws)).not.toBe(chetan.userId);

    const { rows } = await t.db.query<{ meta: { summary: string } }>(
      `SELECT meta FROM activity_log WHERE workspace_id = $1 AND action = 'lead_routing.changed' ORDER BY created_at DESC LIMIT 1`,
      [ws],
    );
    expect(rows[0]!.meta.summary).toBe("Arfin Khan and Bina Shah");

    // Both picked people leave: the owner gets them.
    await call(t.app, "DELETE", `/workspaces/${ws}/members/${arfin.memberId}`, { token: owner });
    await call(t.app, "DELETE", `/workspaces/${ws}/members/${bina.memberId}`, { token: owner });
    const ownerId = (await t.db.query<{ user_id: string }>(`SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner'`, [ws])).rows[0]!.user_id;
    expect(await nextFor(ws)).toBe(ownerId);
    const routing = (await getRouting(ws, owner)).body.data;
    expect(routing.people).toEqual([]);
    expect(routing.pool.map((p) => p.userId)).toEqual([ownerId]);
  });

  it("with nobody to give them to, the owner gets the leads", async () => {
    const { owner, ownerId, ws } = await business("788", [["Kavya Rao", "accountant"]]);
    expect(await nextFor(ws)).toBe(ownerId);
    const alerts = (await call<{ items: { kind: string }[] }>(t.app, "GET", `/workspaces/${ws}/notifications`, { token: owner })).body.data.items;
    expect(alerts.filter((a) => a.kind === "lead.new")).toHaveLength(1);
  });
});

describe("choosing who gets Facebook leads", () => {
  it("starts with everyone with Leads, and only takes people who have Leads", async () => {
    const { owner, ws, team } = await business("791", [
      ["Arfin Khan", "staff"],
      ["Kavya Rao", "accountant"],
    ]);
    const routing = await getRouting(ws, owner);
    expect(routing.status).toBe(200);
    expect(routing.body.data).toEqual({
      everyoneWithLeads: true,
      people: [],
      includeOwner: false,
      skipOnLeave: true,
      pool: [{ userId: team["Arfin Khan"]!.userId, name: "Arfin Khan", openLeads: 0, onLeave: false }],
    });

    const notSales = await putRouting(ws, owner, { everyoneWithLeads: false, people: [team["Kavya Rao"]!.userId] });
    expect(notSales.status).toBe(400);
    expect(notSales.body.error.fields).toHaveProperty("people");
    const stranger = await putRouting(ws, owner, { everyoneWithLeads: false, people: ["00000000-0000-4000-8000-000000000000"] });
    expect(stranger.status).toBe(400);
    const nobody = await putRouting(ws, owner, { everyoneWithLeads: false, people: [] });
    expect(nobody.status).toBe(400);
    // Nothing was saved.
    expect((await getRouting(ws, owner)).body.data.everyoneWithLeads).toBe(true);
  });

  it("is for the owner only", async () => {
    const { ws, team } = await business("792", [
      ["Manny Mehta", "manager"],
      ["Arfin Khan", "staff"],
    ]);
    for (const p of [team["Manny Mehta"]!, team["Arfin Khan"]!]) {
      const read = await getRouting(ws, p.token);
      expect(read.status).toBe(403);
      expect(read.body.error.message).toBe("Only the owner chooses who gets Facebook leads");
      expect((await putRouting(ws, p.token, { includeOwner: true })).status).toBe(403);
    }
    const other = await business("793", []);
    expect((await getRouting(ws, other.owner)).status).toBe(404);
  });
});
