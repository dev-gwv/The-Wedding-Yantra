import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSchedule } from "../src/modules/notifications/scheduler.js";
import type { PushTarget } from "../src/modules/notifications/push.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Alert = { id: string; kind: string; title: string; body: string; link: string | null; read: boolean; actor: { name: string | null } | null };
type Inbox = { items: Alert[]; unread: number; nextBefore: string | null };

// Every push the server makes, and endpoints that act as if the phone removed the app.
const pushed: { endpoint: string; payload: { title: string; body: string; url: string; tag: string } }[] = [];
const goneEndpoints = new Set<string>();

let t: TestContext;
beforeAll(async () => {
  t = await setup({
    pushSend: async (target: PushTarget, payload: string) => {
      if (goneEndpoints.has(target.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
      pushed.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
    },
  });
});
afterAll(async () => {
  await t.close();
});

const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function day(offset: number): string {
  const [y, m, d] = IST.format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
}
/** A moment on a day, in India time. */
const at = (date: string, clock: string) => new Date(`${date}T${clock}:00+05:30`);

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
  // No quiet hours, so pushes arrive whatever time the tests run.
  for (const token of [owner, staff, other]) {
    await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token, body: { off: [], push: true, quietFrom: null, quietTo: null } });
  }
  return { owner, staff, other, ws, ids: { owner: id("Owner Person"), staff: id("Rohit Staff"), other: id("Neha Staff") } };
}
const inbox = async (ws: string, token: string) => (await call<Inbox>(t.app, "GET", `/workspaces/${ws}/notifications`, { token })).body.data;

describe("alerts from task changes", () => {
  it("tells the right person at each step, never whoever did it", async () => {
    const { owner, staff, other, ws, ids } = await team("821");
    const task = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Album layout", assigneeId: ids.staff, dueDate: day(2), needsCheck: true },
    });
    const id = task.body.data.id;

    let staffBox = await inbox(ws, staff);
    expect(staffBox.unread).toBe(1);
    expect(staffBox.items[0]).toMatchObject({ kind: "task.assigned", title: "New task from Owner", body: "Album layout", link: `/app/tasks?open=${id}`, read: false });
    expect((await inbox(ws, owner)).items).toHaveLength(0);

    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/submit`, { token: staff, body: { note: "First draft" } });
    expect((await inbox(ws, owner)).items[0]).toMatchObject({ kind: "task.submitted", title: "Rohit handed in work to check" });

    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/review`, { token: owner, body: { approve: false, reason: "Warmer colours" } });
    staffBox = await inbox(ws, staff);
    expect(staffBox.items[0]).toMatchObject({ kind: "task.sent_back", body: "Album layout: Warmer colours" });

    // @Neha is mentioned; the owner (who gave it) hears about the comment.
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/comments`, { token: staff, body: { body: "@Neha can you share the raw files?" } });
    expect((await inbox(ws, other)).items[0]).toMatchObject({ kind: "task.mentioned", title: "Rohit mentioned you" });
    expect((await inbox(ws, owner)).items[0]).toMatchObject({ kind: "task.commented" });

    // Opening the task reads its alerts.
    expect((await inbox(ws, staff)).unread).toBe(2);
    await call(t.app, "GET", `/workspaces/${ws}/tasks/${id}`, { token: staff });
    expect((await inbox(ws, staff)).unread).toBe(0);

    // Stuck tells whoever gave it; approval tells whoever did it.
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/move`, { token: staff, body: { status: "waiting", reason: "Waiting for the client's photos" } });
    expect((await inbox(ws, owner)).items[0]).toMatchObject({ kind: "task.stuck", body: "Album layout: Waiting for the client's photos" });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/submit`, { token: staff, body: { note: "Warmer now" } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/review`, { token: owner, body: { approve: true } });
    expect((await inbox(ws, staff)).items[0]).toMatchObject({ kind: "task.approved", title: "Owner approved your work" });

    // A task ticked off without a check tells whoever gave it.
    const quick = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Call the florist", assigneeId: ids.other } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${quick.body.data.id}/done`, { token: other, body: { done: true } });
    expect((await inbox(ws, owner)).items[0]).toMatchObject({ kind: "task.done", title: "Neha finished a task", body: "Call the florist" });
  });

  it("respects switched-off groups, marks read, pages, and keeps each business's alerts to itself", async () => {
    const { owner, staff, ws, ids } = await team("822");
    await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token: staff, body: { off: ["assigned"], push: true, quietFrom: null, quietTo: null } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Muted", assigneeId: ids.staff } });
    expect((await inbox(ws, staff)).items).toHaveLength(0);

    const prefs = await call<{ off: string[]; quietFrom: string | null }>(t.app, "GET", `/workspaces/${ws}/notifications/prefs`, { token: staff });
    expect(prefs.body.data).toMatchObject({ off: ["assigned"], quietFrom: null });
    const bad = await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token: staff, body: { off: [], push: true, quietFrom: "22:00", quietTo: null } });
    expect(bad.status).toBe(400);

    await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token: staff, body: { off: [], push: true, quietFrom: null, quietTo: null } });
    for (let i = 0; i < 3; i++) await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: `Task ${i}`, assigneeId: ids.staff } });
    const page = await call<Inbox>(t.app, "GET", `/workspaces/${ws}/notifications?limit=2`, { token: staff });
    expect(page.body.data.items).toHaveLength(2);
    expect(page.body.data.nextBefore).not.toBeNull();
    const rest = await call<Inbox>(t.app, "GET", `/workspaces/${ws}/notifications?limit=2&before=${encodeURIComponent(page.body.data.nextBefore!)}`, { token: staff });
    expect(rest.body.data.items).toHaveLength(1);

    const one = await call<{ unread: number }>(t.app, "POST", `/workspaces/${ws}/notifications/read`, { token: staff, body: { ids: [page.body.data.items[0]!.id] } });
    expect(one.body.data.unread).toBe(2);
    const all = await call<{ unread: number }>(t.app, "POST", `/workspaces/${ws}/notifications/read`, { token: staff, body: { all: true } });
    expect(all.body.data.unread).toBe(0);

    // Someone from another business sees nothing here.
    const stranger = await signIn(t.app, "8229999999", "Stranger");
    await createBusiness(t.app, stranger, "Elsewhere");
    expect((await call(t.app, "GET", `/workspaces/${ws}/notifications`, { token: stranger })).status).toBe(404);
  });
});

describe("push to phones", () => {
  it("pushes to every subscribed phone with the business in the link, and forgets removed ones", async () => {
    const { owner, staff, ws, ids } = await team("823");
    const key = await call<{ publicKey: string }>(t.app, "GET", `/push/key`, { token: staff });
    expect(key.body.data.publicKey.length).toBeGreaterThan(40);
    // The same key after a second ask: it's kept, not remade.
    expect((await call<{ publicKey: string }>(t.app, "GET", `/push/key`, { token: owner })).body.data.publicKey).toBe(key.body.data.publicKey);

    const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });
    expect((await call(t.app, "POST", `/push/subscriptions`, { token: staff, body: sub("https://push.example.com/phone") })).status).toBe(201);
    await call(t.app, "POST", `/push/subscriptions`, { token: staff, body: sub("https://push.example.com/laptop") });
    expect((await call<{ devices: number }>(t.app, "GET", `/workspaces/${ws}/notifications/prefs`, { token: staff })).body.data.devices).toBe(2);

    pushed.length = 0;
    const task = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Print the album", assigneeId: ids.staff } });
    await t.app.pusher.flush();
    expect(pushed.map((p) => p.endpoint).sort()).toEqual(["https://push.example.com/laptop", "https://push.example.com/phone"]);
    expect(pushed[0]!.payload).toMatchObject({ title: "New task from Owner", body: "Print the album", url: `/app/tasks?open=${task.body.data.id}&ws=${ws}`, tag: task.body.data.id });

    // Pushed once only.
    pushed.length = 0;
    await t.app.pusher.flush();
    expect(pushed).toHaveLength(0);

    // The laptop removed the app: it's forgotten; the phone still gets alerts.
    goneEndpoints.add("https://push.example.com/laptop");
    await call(t.app, "POST", `/workspaces/${ws}/notifications/test`, { token: staff });
    expect(pushed.map((p) => p.endpoint)).toEqual(["https://push.example.com/phone"]);
    expect((await call<{ devices: number }>(t.app, "GET", `/workspaces/${ws}/notifications/prefs`, { token: staff })).body.data.devices).toBe(1);

    // Push off: the alert stays in the app, the phone stays quiet.
    pushed.length = 0;
    await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token: staff, body: { off: [], push: false, quietFrom: null, quietTo: null } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Quietly", assigneeId: ids.staff } });
    await t.app.pusher.flush();
    expect(pushed).toHaveLength(0);
    expect((await inbox(ws, staff)).items[0]!.body).toBe("Quietly");

    // Signing out on a phone stops its alerts.
    await call(t.app, "POST", `/push/unsubscribe`, { token: staff, body: { endpoint: "https://push.example.com/phone" } });
    expect((await call<{ devices: number }>(t.app, "GET", `/workspaces/${ws}/notifications/prefs`, { token: staff })).body.data.devices).toBe(0);
  });

  it("holds pushes in quiet hours but keeps the alert", async () => {
    const { owner, staff, ws, ids } = await team("824");
    await call(t.app, "POST", `/push/subscriptions`, { token: staff, body: { endpoint: "https://push.example.com/quiet", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } } });
    // Quiet all day except one minute that has already passed.
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const [h, m] = now.split(":").map(Number);
    const next = new Date(Date.UTC(2000, 0, 1, h!, m! + 2)).toISOString().slice(11, 16);
    const nextOne = new Date(Date.UTC(2000, 0, 1, h!, m! + 3)).toISOString().slice(11, 16);
    await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token: staff, body: { off: [], push: true, quietFrom: nextOne, quietTo: next } });
    pushed.length = 0;
    await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Late night", assigneeId: ids.staff } });
    await t.app.pusher.flush();
    expect(pushed).toHaveLength(0);
    expect((await inbox(ws, staff)).items[0]!.body).toBe("Late night");
  });
});

describe("scheduled alerts", () => {
  it("sends the morning plan, the overdue alert, due-in-an-hour and the evening round-up, once each", async () => {
    const { owner, staff, other, ws, ids } = await team("825");
    const today = day(0);
    const make = (body: Record<string, unknown>) => call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body });
    await make({ title: "Pick album photos", assigneeId: ids.staff, dueDate: today, priority: "urgent" });
    const late = await make({ title: "Send the teaser", assigneeId: ids.staff, dueDate: day(-1) });
    await make({ title: "Old one", assigneeId: ids.staff, dueDate: day(-5) });
    const timed = await make({ title: "Call the florist", assigneeId: ids.other, dueDate: today, dueTime: "15:00" });
    // Neha is off today: no morning plan for her.
    await call(t.app, "POST", `/workspaces/${ws}/time-off`, { token: owner, body: { userId: ids.other, startDate: today, endDate: today } });

    const morning = await runSchedule(t.db, at(today, "08:30"));
    expect(morning.morning).toBeGreaterThanOrEqual(1);
    const staffBox = await inbox(ws, staff);
    const plan = staffBox.items.find((a) => a.kind === "digest.morning")!;
    expect(plan).toMatchObject({ title: "Your day: 3 tasks", link: "/app/my-day" });
    expect(plan.body).toBe("2 late · 1 due today\nStart with: Old one");
    // Only yesterday's miss gets its own alert, once.
    const overdue = staffBox.items.filter((a) => a.kind === "task.overdue");
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.link).toBe(`/app/tasks?open=${late.body.data.id}`);
    expect((await inbox(ws, other)).items.some((a) => a.kind === "digest.morning")).toBe(false);

    // Running again the same morning sends nothing new.
    const again = await runSchedule(t.db, at(today, "08:31"));
    expect(again.morning + again.overdue).toBe(0);
    expect((await inbox(ws, staff)).items.length).toBe(staffBox.items.length);

    // Half an hour before 3 pm.
    const soon = await runSchedule(t.db, at(today, "14:30"));
    expect(soon.dueSoon).toBeGreaterThanOrEqual(1);
    const reminder = (await inbox(ws, other)).items.find((a) => a.kind === "task.due_soon")!;
    expect(reminder).toMatchObject({ title: "Due at 3 pm", body: "Call the florist", link: `/app/tasks?open=${timed.body.data.id}` });
    await runSchedule(t.db, at(today, "14:40"));
    expect((await inbox(ws, other)).items.filter((a) => a.kind === "task.due_soon")).toHaveLength(1);

    // Evening: owners and managers get the team's day.
    const evening = await runSchedule(t.db, at(today, "19:15"));
    expect(evening.evening).toBeGreaterThanOrEqual(1);
    const round = (await inbox(ws, owner)).items.find((a) => a.kind === "digest.evening")!;
    expect(round.title).toBe("Team today: 0 tasks done, 2 late");
    expect(round.body).toBe("Late: Rohit 2");
    expect((await inbox(ws, staff)).items.some((a) => a.kind === "digest.evening")).toBe(false);

    // After the window, a restart doesn't send a stale round-up.
    await t.db.query(`DELETE FROM job_runs WHERE workspace_id = $1 AND job = 'evening'`, [ws]);
    await t.db.query(`DELETE FROM notifications WHERE workspace_id = $1 AND kind = 'digest.evening'`, [ws]);
    const tooLate = await runSchedule(t.db, at(today, "23:30"));
    expect(tooLate.evening).toBe(0);
  });
});

describe("My Day", () => {
  it("lists work sent back, work to check and what was done today", async () => {
    const { owner, staff, ws, ids } = await team("826");
    const make = (body: Record<string, unknown>) => call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body });
    const back = await make({ title: "Edit the reel", assigneeId: ids.staff, dueDate: day(0), needsCheck: true });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${back.body.data.id}/submit`, { token: staff, body: { note: "v1" } });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${back.body.data.id}/review`, { token: owner, body: { approve: false, reason: "Shorter" } });
    const done = await make({ title: "Charge batteries", assigneeId: ids.staff, dueDate: day(0) });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${done.body.data.id}/done`, { token: staff, body: { done: true } });
    await make({ title: "Someday", assigneeId: ids.staff });
    const check = await make({ title: "Invoice for Mehta", assigneeId: ids.staff, needsCheck: true });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${check.body.data.id}/submit`, { token: staff, body: { note: "Done" } });

    type Day = { dueToday: { title: string }[]; sentBack: { title: string }[]; toCheck: { title: string }[]; doneToday: { title: string }[]; noDate: { title: string }[] };
    const mine = (await call<Day>(t.app, "GET", `/workspaces/${ws}/my-day`, { token: staff })).body.data;
    expect(mine.sentBack.map((x) => x.title)).toEqual(["Edit the reel"]);
    expect(mine.dueToday.map((x) => x.title)).toEqual([]);
    expect(mine.noDate.map((x) => x.title)).toEqual(["Someday"]);
    expect(mine.doneToday.map((x) => x.title).sort()).toEqual(["Charge batteries", "Invoice for Mehta"]);
    const boss = (await call<Day>(t.app, "GET", `/workspaces/${ws}/my-day`, { token: owner })).body.data;
    expect(boss.toCheck.map((x) => x.title)).toEqual(["Invoice for Mehta"]);
  });
});
