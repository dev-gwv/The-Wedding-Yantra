import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSchedule } from "../src/modules/notifications/scheduler.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Row = { user: { id: string; name: string | null }; points: number; rank: number | null; notRanked: string | null; band: string; tasksDone: number; onTime: number | null };
type Board = { rows: Row[]; me: (Row & { coaching: string; gap: number; nextBand: string | null }) | null; penaltiesOn: boolean };
type Ledger = { total: number; entries: { rule: string; points: number; task: { title: string } | null; note: string | null }[] };
type Settings = { rules: { key: string; points: number; enabled: boolean; penalty: boolean }[]; penaltiesOn: boolean; bands: { name: string; min: number }[] };

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function day(offset: number): string {
  const [y, m, d] = IST.format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
}
const month = day(0).slice(0, 7);

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const staff = await join(`${prefix}0000002`, "staff", "Rohit Staff");
  const other = await join(`${prefix}0000003`, "staff", "Neha Staff");
  const members = (await call<{ members: { userId: string; name: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const id = (name: string) => members.find((m) => m.name === name)!.userId;
  return { owner, staff, other, ws, ids: { owner: id("Owner Person"), staff: id("Rohit Staff"), other: id("Neha Staff") } };
}
const board = async (ws: string, token: string) => (await call<Board>(t.app, "GET", `/workspaces/${ws}/points/leaderboard?month=${month}`, { token })).body.data;
const ledger = async (ws: string, token: string, userId?: string) =>
  call<Ledger>(t.app, "GET", `/workspaces/${ws}/points/ledger?month=${month}${userId ? `&userId=${userId}` : ""}`, { token });

describe("points for finished work", () => {
  it("pays by priority, on time and first time, once only; nothing for your own tasks", async () => {
    const { owner, staff, other, ws, ids } = await team("831");
    const give = (body: Record<string, unknown>, token = owner) => call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token, body });

    // Urgent, checked, approved first time, on time: 12 + 2 + 3.
    const album = await give({ title: "Album", assigneeId: ids.staff, priority: "urgent", dueDate: day(2), needsCheck: true });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${album.body.data.id}/submit`, { token: staff, body: { note: "Done" } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${album.body.data.id}/review`, { token: owner, body: { approve: true } });

    // Normal, late: 5 (no on-time bonus; no penalty while penalties are off).
    const late = await give({ title: "Teaser", assigneeId: ids.staff, dueDate: day(-2) });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${late.body.data.id}/done`, { token: staff, body: { done: true } });

    // Reopened and finished again: nothing more.
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${late.body.data.id}/done`, { token: staff, body: { done: false } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${late.body.data.id}/done`, { token: staff, body: { done: true } });

    // A task Rohit gave himself earns nothing.
    const own = await give({ title: "My own", dueDate: day(1) }, staff);
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${own.body.data.id}/done`, { token: staff, body: { done: true } });

    const mine = await ledger(ws, staff);
    expect(mine.body.data.total).toBe(22);
    expect(mine.body.data.entries.map((e) => e.rule).sort()).toEqual(["done_normal", "done_urgent", "first_time", "on_time"]);

    // Sent back once, then approved: no first-time bonus.
    const reel = await give({ title: "Reel", assigneeId: ids.other, priority: "high", dueDate: day(3), needsCheck: true });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${reel.body.data.id}/submit`, { token: other, body: { note: "v1" } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${reel.body.data.id}/review`, { token: owner, body: { approve: false, reason: "Shorter" } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${reel.body.data.id}/submit`, { token: other, body: { note: "v2" } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${reel.body.data.id}/review`, { token: owner, body: { approve: true } });
    expect((await ledger(ws, other)).body.data.total).toBe(10);

    // The board: Rohit first, the owner not ranked.
    const b = await board(ws, staff);
    expect(b.rows.map((r) => [r.user.name, r.rank])).toEqual([
      ["Rohit Staff", 1],
      ["Neha Staff", 2],
      ["Owner Person", null],
    ]);
    expect(b.rows[2]!.notRanked).toBe("No tasks finished this month");
    expect(b.me).toMatchObject({ points: 22, band: "Needs attention", nextBand: "Good", gap: 28, tasksDone: 2, onTime: 50 });
    expect(b.me!.coaching).toBe("28 points to Good: about 4 tasks finished on time.");
    // Someone else's details are for owners and managers.
    expect(b.rows.find((r) => r.user.name === "Neha Staff")!.onTime).toBeNull();
    expect((await board(ws, owner)).rows.find((r) => r.user.name === "Neha Staff")!.onTime).toBe(100);

    // Your own ledger only, unless you manage.
    expect((await ledger(ws, staff, ids.other)).status).toBe(403);
    expect((await ledger(ws, owner, ids.other)).body.data.total).toBe(10);

    // The people board shows points this month.
    const people = await call<{ people: { user: { id: string }; points: number }[] }>(t.app, "GET", `/workspaces/${ws}/tasks/board`, { token: owner });
    expect(people.body.data.people.find((p) => p.user.id === ids.staff)!.points).toBe(22);
  });

  it("counts penalties only once the owner switches them on, and follows the owner's rules", async () => {
    const { owner, staff, ws, ids } = await team("832");
    const settings = (await call<Settings>(t.app, "GET", `/workspaces/${ws}/points/rules`, { token: staff })).body.data;
    expect(settings.penaltiesOn).toBe(false);
    expect(settings.rules.find((r) => r.key === "late")).toMatchObject({ points: -3, penalty: true });

    // Staff can read the rules but not change them.
    const body = {
      rules: settings.rules.map((r) => ({ key: r.key, points: r.key === "done_normal" ? 6 : r.points, enabled: r.key !== "on_time" })),
      penaltiesOn: true,
      bands: settings.bands,
    };
    expect((await call(t.app, "PUT", `/workspaces/${ws}/points/rules`, { token: staff, body })).status).toBe(403);
    const saved = await call<Settings>(t.app, "PUT", `/workspaces/${ws}/points/rules`, { token: owner, body });
    expect(saved.status).toBe(200);
    expect(saved.body.data.rules.find((r) => r.key === "on_time")!.enabled).toBe(false);
    // A reward can't be made negative.
    const bad = await call(t.app, "PUT", `/workspaces/${ws}/points/rules`, {
      token: owner,
      body: { ...body, rules: [{ key: "done_low", points: -1, enabled: true }] },
    });
    expect(bad.status).toBe(400);

    const late = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Late one", assigneeId: ids.staff, dueDate: day(-1) } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${late.body.data.id}/done`, { token: staff, body: { done: true } });
    const moved = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Moved", assigneeId: ids.staff, dueDate: day(1) } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${moved.body.data.id}/snooze`, { token: staff, body: { to: day(3) } });
    // Moved by the owner: no penalty for Rohit.
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${moved.body.data.id}/snooze`, { token: owner, body: { to: day(4) } });

    const l = (await ledger(ws, staff)).body.data;
    expect(l.entries.map((e) => [e.rule, e.points]).sort()).toEqual([
      ["deadline_moved", -5],
      ["done_normal", 6],
      ["late", -3],
    ]);
    expect(l.total).toBe(-2);
  });
});

describe("recognition and streaks", () => {
  it("lets a manager recognise someone, with an alert", async () => {
    const { owner, staff, ws, ids } = await team("833");
    expect((await call(t.app, "POST", `/workspaces/${ws}/points/recognise`, { token: staff, body: { userId: ids.other, note: "Great job" } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/points/recognise`, { token: owner, body: { userId: ids.owner, note: "Me me me" } })).status).toBe(400);
    const r = await call<{ points: number }>(t.app, "POST", `/workspaces/${ws}/points/recognise`, { token: owner, body: { userId: ids.staff, note: "Handled the Sharma family brilliantly" } });
    expect(r.body.data.points).toBe(5);
    const l = (await ledger(ws, staff)).body.data;
    expect(l.entries[0]).toMatchObject({ rule: "recognition", points: 5, note: "Handled the Sharma family brilliantly" });
    const alerts = await call<{ items: { kind: string; title: string }[] }>(t.app, "GET", `/workspaces/${ws}/notifications`, { token: staff });
    expect(alerts.body.data.items[0]).toMatchObject({ kind: "points.recognised", title: "Owner recognised your work: +5 points" });
    // Recognised people are ranked even with no tasks.
    expect((await board(ws, staff)).me!.rank).toBe(1);
  });

  it("pays the 7-day streak once", async () => {
    const { owner, staff, ws, ids } = await team("834");
    // One finished task on each of the last seven days.
    for (let i = 1; i <= 7; i++) {
      const task = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: `Day ${i}`, assigneeId: ids.staff } });
      await call(t.app, "POST", `/workspaces/${ws}/tasks/${task.body.data.id}/done`, { token: staff, body: { done: true } });
      await t.db.query(`UPDATE tasks SET completed_at = now() - make_interval(days => $2), done_at = now() - make_interval(days => $2) WHERE id = $1`, [
        task.body.data.id,
        i,
      ]);
    }
    const at = new Date(`${day(0)}T00:30:00+05:30`);
    const first = await runSchedule(t.db, at);
    expect(first.streak).toBe(10);
    // Not again the next night.
    await t.db.query(`DELETE FROM job_runs WHERE workspace_id = $1`, [ws]);
    expect((await runSchedule(t.db, new Date(at.getTime() + 60_000))).streak).toBe(0);
    const l = (await call<Ledger>(t.app, "GET", `/workspaces/${ws}/points/ledger?month=${month}`, { token: staff })).body.data;
    expect(l.entries.filter((e) => e.rule === "streak_7")).toHaveLength(1);
  });
});
