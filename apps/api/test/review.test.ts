import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Measure = { key: string; done: number; total: number };
type Scores = {
  month: string;
  people: { user: { id: string; name: string | null }; role: string; score: number | null; measures: Measure[]; lateNow: number }[];
  business: { moneyBeforeEvents: { collected: number; due: number }; eventsOnTime: { done: number; total: number } } | null;
};
type Item = { id: string; action: string; actor: { id: string; name: string | null } | null; subject: string | null; other: string | null; amount: number | null; detail: string | null; late: boolean; link: { kind: string; id: string | null } | null };
type Page = { items: Item[]; next: string | null };
type Summary = {
  date: string;
  received: { total: number; count: number } | null;
  newLeads: number;
  booked: number;
  tasksDone: number;
  lateTasks: { name: string | null; count: number }[];
  expensesWaiting: number | null;
  tomorrow: { date: string; events: { title: string; functions: { name: string; time: string | null }[]; team: string[] }[]; tasksDue: number };
};

// Days are counted in the business's time zone (India).
const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function day(offset: number): string {
  const [y, m, d] = IST.format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
}

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const staff = await join(`${prefix}0000002`, "staff", "Staff Person");
  const freelancer = await join(`${prefix}0000003`, "freelancer", "Freelance Person");
  const accountant = await join(`${prefix}0000004`, "accountant", "Accountant Person");
  const members = (await call<{ members: { userId: string; role: string }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const id = (role: string) => members.find((m) => m.role === role)!.userId;
  return { owner, staff, freelancer, accountant, ws, ids: { owner: id("owner"), staff: id("staff"), freelancer: id("freelancer") } };
}

const sql = (text: string, params: unknown[] = []) => t.db.query(text, params);

describe("scores", () => {
  it("measures each person's month from their own work", async () => {
    const { owner, staff, freelancer, accountant, ws, ids } = await team("981");

    // Tasks due in August: one done on its day, one done late, one never done.
    const task = async (title: string, dueDate: string) =>
      (await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title, assigneeId: ids.staff, dueDate } })).body.data.id;
    const onTime = await task("Book the hall", "2026-08-10");
    const lateOne = await task("Order flowers", "2026-08-12");
    await task("Call the band", "2026-08-20");
    for (const id of [onTime, lateOne]) await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/done`, { token: staff, body: { done: true } });
    await sql(`UPDATE tasks SET done_at = '2026-08-10T10:00:00+05:30', completed_at = '2026-08-10T10:00:00+05:30' WHERE id = $1`, [onTime]);
    await sql(`UPDATE tasks SET done_at = '2026-08-14T10:00:00+05:30', completed_at = '2026-08-14T10:00:00+05:30' WHERE id = $1`, [lateOne]);

    // Follow-ups: A kept (called on the day), B missed, C moved before it came due.
    const lead = async (name: string) =>
      (await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: staff, body: { name, phone: undefined } })).body.data.id;
    const [a, b, c] = [await lead("Lead A"), await lead("Lead B"), await lead("Lead C")];
    const activity = (leadId: string, kind: string, at: string, meta: object = {}) =>
      sql(`INSERT INTO lead_activities (workspace_id, lead_id, actor_user_id, kind, meta, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
        ws,
        leadId,
        ids.staff,
        kind,
        meta,
        at,
      ]);
    await activity(a, "follow_up_set", "2026-08-01T04:00:00Z", { at: "2026-08-05T06:00:00Z" });
    await activity(a, "call", "2026-08-05T13:00:00Z");
    await activity(b, "follow_up_set", "2026-08-02T04:00:00Z", { at: "2026-08-08T06:00:00Z" });
    await activity(b, "call", "2026-08-09T05:00:00Z"); // a day late
    await activity(c, "follow_up_set", "2026-08-03T04:00:00Z", { at: "2026-08-09T06:00:00Z" });
    await activity(c, "follow_up_set", "2026-08-06T04:00:00Z", { at: "2026-09-02T06:00:00Z" });

    // Enquiries closed in August: A booked, B lost.
    const stages = (await call<{ stages: { id: string; kind: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.stages;
    await sql(`UPDATE leads SET stage_id = $2, stage_changed_at = '2026-08-20T10:00:00+05:30' WHERE id = $1`, [a, stages.find((s) => s.kind === "won")!.id]);
    await sql(`UPDATE leads SET stage_id = $2, stage_changed_at = '2026-08-21T10:00:00+05:30' WHERE id = $1`, [b, stages.find((s) => s.kind === "lost")!.id]);

    // Expenses spent in August: one added the next day, one four days later.
    const spent = async (createdAt: string) => {
      const x = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/expenses`, {
        token: staff,
        body: { category: "travel", amount: 500, spentOn: "2026-08-10" },
      });
      await sql(`UPDATE expenses SET created_at = $2 WHERE id = $1`, [x.body.data.id, createdAt]);
    };
    await spent("2026-08-11T20:00:00+05:30");
    await spent("2026-08-14T09:00:00+05:30");

    // The business: an event on 15 Aug, ₹4,000 of ₹10,000 paid before the day; its one step on time.
    const ev = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "August Family", phone: "9810000099" }, title: "August wedding", functions: [{ name: "Wedding", date: "2026-08-15" }] },
    });
    const bill = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId: ev.body.data.id, billTo: { name: "August Family" }, issueDate: "2026-08-01", items: [{ name: "Decor", unit: "event", quantity: 1, rate: 10000 }] },
    });
    for (const [amount, paidOn] of [
      [4000, "2026-08-10"],
      [6000, "2026-08-15"],
    ] as const) {
      await call(t.app, "POST", `/workspaces/${ws}/payments`, { token: owner, body: { billId: bill.body.data.id, amount, paidOn, method: "upi" } });
    }
    const step = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Site visit", eventId: ev.body.data.id, dueDate: "2026-08-14" },
    });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${step.body.data.id}/done`, { token: owner, body: { done: true } });
    await sql(`UPDATE tasks SET done_at = '2026-08-13T18:00:00+05:30', completed_at = '2026-08-13T18:00:00+05:30' WHERE id = $1`, [step.body.data.id]);

    const res = await call<Scores>(t.app, "GET", `/workspaces/${ws}/scores?month=2026-08`, { token: owner });
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.data.people.map((p) => [p.user.name, p]));
    expect(res.body.data.people.map((p) => p.role)).toEqual(["owner", "staff", "freelancer", "accountant"]);
    expect(byName["Staff Person"]!.measures).toEqual([
      { key: "tasks_on_time", done: 1, total: 3 },
      { key: "follow_ups_on_time", done: 1, total: 2 },
      { key: "leads_booked", done: 1, total: 2 },
      { key: "expenses_on_time", done: 1, total: 2 },
    ]);
    // (33 + 50 + 50 + 50) / 4
    expect(byName["Staff Person"]!.score).toBe(46);
    expect(byName["Staff Person"]!.lateNow).toBe(1);
    expect(byName["Freelance Person"]).toMatchObject({ score: null, measures: [] });
    expect(byName["Owner Person"]!.measures).toEqual([{ key: "tasks_on_time", done: 1, total: 1 }]);
    expect(res.body.data.business).toEqual({ moneyBeforeEvents: { collected: 4000, due: 10000 }, eventsOnTime: { done: 1, total: 1 } });

    // Everyone else sees only their own month.
    const mine = await call<Scores>(t.app, "GET", `/workspaces/${ws}/scores?month=2026-08`, { token: staff });
    expect(mine.body.data.people.map((p) => p.user.name)).toEqual(["Staff Person"]);
    expect(mine.body.data.business).toBeNull();
    expect((await call<Scores>(t.app, "GET", `/workspaces/${ws}/scores?month=2026-08`, { token: freelancer })).body.data.people).toHaveLength(1);
    expect((await call<Scores>(t.app, "GET", `/workspaces/${ws}/scores?month=2026-08`, { token: accountant })).body.data.business).toBeNull();
    expect((await call(t.app, "GET", `/workspaces/${ws}/scores?month=August`, { token: owner })).status).toBe(400);
  });
});

describe("activity log", () => {
  it("tells owners who did what, newest first, a page at a time", async () => {
    const { owner, staff, ws, ids } = await team("982");
    const ev = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Kavya Rao", phone: "9820000099" }, title: "Kavya's wedding", functions: [{ name: "Wedding", date: day(5) }] },
    });
    const task = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Kit packed", eventId: ev.body.data.id, assigneeId: ids.staff, dueDate: day(-1) },
    });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${task.body.data.id}/done`, { token: staff, body: { done: true } });
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: staff, body: { name: "Neha Joshi" } });
    await call(t.app, "POST", `/workspaces/${ws}/leads/${lead.body.data.id}/activities`, { token: staff, body: { kind: "call", body: "Wants a trial" } });
    await call(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { eventId: ev.body.data.id, amount: 20000, paidOn: day(0), method: "upi" },
    });

    const feed = await call<Page>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner });
    expect(feed.status).toBe(200);
    const [paid, called, added, ticked, given] = feed.body.data.items;
    expect(paid).toMatchObject({ action: "payment.recorded", amount: 20000, other: "Kavya Rao", actor: { name: "Owner Person" } });
    expect(called).toMatchObject({ action: "lead.call", subject: "Neha Joshi", detail: "Wants a trial", link: { kind: "lead", id: lead.body.data.id } });
    expect(added).toMatchObject({ action: "lead.created", subject: "Neha Joshi", actor: { name: "Staff Person" } });
    expect(ticked).toMatchObject({ action: "task.done", subject: "Kit packed", detail: "Kavya's wedding", late: true, link: { kind: "event" } });
    expect(given).toMatchObject({ action: "task.assigned", subject: "Kit packed", other: "Staff Person" });
    expect(feed.body.data.items.at(-1)).toMatchObject({ action: "workspace.created", subject: "982 Studio" });

    // Only one person's doings.
    const staffOnly = await call<Page>(t.app, "GET", `/workspaces/${ws}/activity?userId=${ids.staff}`, { token: owner });
    expect(new Set(staffOnly.body.data.items.map((i) => i.actor?.name))).toEqual(new Set(["Staff Person"]));

    // Many things at the same moment still page through exactly once each.
    for (let i = 0; i < 45; i++) {
      await call(t.app, "POST", `/workspaces/${ws}/leads/${lead.body.data.id}/activities`, { token: staff, body: { kind: "note", body: `Note ${i}` } });
    }
    await sql(`UPDATE lead_activities SET created_at = '2026-09-01T10:00:00Z' WHERE lead_id = $1 AND kind = 'note'`, [lead.body.data.id]);
    const seen: string[] = [];
    let before: string | null = null;
    do {
      const pageRes: Awaited<ReturnType<typeof call<Page>>> = await call<Page>(t.app, "GET", `/workspaces/${ws}/activity${before ? `?before=${before}` : ""}`, { token: owner });
      seen.push(...pageRes.body.data.items.map((i) => i.id));
      before = pageRes.body.data.next;
    } while (before);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((id) => id.startsWith("lead:")).length).toBeGreaterThanOrEqual(47);
    const total = await sql(`SELECT (SELECT count(*) FROM activity_log WHERE workspace_id = $1) + (SELECT count(*) FROM lead_activities WHERE workspace_id = $1) AS n`, [ws]);
    expect(seen.length).toBe(Number((total.rows[0] as { n: string }).n));

    // Staff don't see it; broken page links are refused.
    expect((await call(t.app, "GET", `/workspaces/${ws}/activity`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/activity?before=nonsense`, { token: owner })).status).toBe(400);
  });
});

describe("daily summary", () => {
  it("adds up the day and lines up tomorrow", async () => {
    const { owner, staff, ws, ids } = await team("983");
    const ev = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: {
        newClient: { name: "Meera Joshi", phone: "9830000099" },
        title: "Meera's mehendi",
        functions: [
          { name: "Mehendi", date: day(1), startTime: "16:00" },
          { name: "Sangeet", date: day(1), startTime: "19:30" },
        ],
      },
    });
    await call(t.app, "PUT", `/workspaces/${ws}/events/${ev.body.data.id}/team`, {
      token: owner,
      body: { members: [{ userId: ids.freelancer, callTime: "15:00" }, { userId: ids.staff, callTime: "14:00" }] },
    });
    await call(t.app, "POST", `/workspaces/${ws}/payments`, { token: owner, body: { eventId: ev.body.data.id, amount: 15000, paidOn: day(0), method: "cash" } });
    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "New Lead" } });
    const done = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Done today", dueDate: day(0) } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${done.body.data.id}/done`, { token: owner, body: { done: true } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Late one", assigneeId: ids.staff, dueDate: day(-2) } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "For tomorrow", assigneeId: ids.staff, dueDate: day(1) } });
    await call(t.app, "POST", `/workspaces/${ws}/expenses`, { token: staff, body: { category: "food", amount: 300, spentOn: day(0) } });

    const res = await call<Summary>(t.app, "GET", `/workspaces/${ws}/daily-summary`, { token: owner });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      date: day(0),
      received: { total: 15000, count: 1 },
      newLeads: 1,
      booked: 0,
      tasksDone: 1,
      lateTasks: [{ name: "Staff Person", count: 1 }],
      expensesWaiting: 1,
      tomorrow: {
        date: day(1),
        events: [
          {
            title: "Meera's mehendi",
            functions: [
              { name: "Mehendi", time: "16:00" },
              { name: "Sangeet", time: "19:30" },
            ],
            team: ["Staff Person", "Freelance Person"],
          },
        ],
        tasksDue: 1,
      },
    });
    // Another day can be looked back on.
    const before = await call<Summary>(t.app, "GET", `/workspaces/${ws}/daily-summary?date=${day(-1)}`, { token: owner });
    expect(before.body.data).toMatchObject({ date: day(-1), received: { total: 0, count: 0 }, tasksDone: 0, lateTasks: [{ name: "Staff Person", count: 1 }] });
    expect((await call(t.app, "GET", `/workspaces/${ws}/daily-summary`, { token: staff })).status).toBe(403);
  });
});
