import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Task = {
  id: string;
  title: string;
  eventId: string | null;
  assignee: { id: string; name: string | null } | null;
  dueDate: string | null;
  done: boolean;
  doneBy: { name: string | null } | null;
  overdue: boolean;
  fromChecklist: boolean;
};
type Step = { id: string; title: string; when: string; days: number };
type TeamMember = { userId: string; name: string | null; roleNote: string | null; callTime: string | null };
type Event = { id: string; title: string; clientPhone: string | null; value: number | null; team: TeamMember[] };
type MyDay = { today: string; overdue: Task[]; dueToday: Task[]; upcoming: Task[]; events: { id: string; callTime: string | null; roleNote: string | null }[] };

// Dates count in the business's time zone (India).
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
  const freelancer = await join(`${prefix}0000003`, "freelancer", "Freelance Artist");
  const accountant = await join(`${prefix}0000004`, "accountant", "Accountant Person");
  const members = (await call<{ members: { userId: string; role: string }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const id = (role: string) => members.find((m) => m.role === role)!.userId;
  return { owner, staff, freelancer, accountant, ws, ids: { owner: id("owner"), staff: id("staff"), freelancer: id("freelancer") } };
}

let phones = 0;
const createEvent = (token: string, ws: string, title: string, dates: string[]) =>
  call<Event>(t.app, "POST", `/workspaces/${ws}/events`, {
    token,
    body: {
      newClient: { name: `${title} Family`, phone: `98333${String(++phones).padStart(5, "0")}` },
      title,
      value: "90000",
      functions: dates.map((date, i) => ({ name: i === 0 ? "Mehendi" : "Wedding", date })),
    },
  });

describe("event checklist", () => {
  it("starts from the trade's steps and turns them into dated tasks for an event", async () => {
    const { owner, staff, ws } = await team("961");
    const steps = await call<Step[]>(t.app, "GET", `/workspaces/${ws}/checklist`, { token: owner });
    expect(steps.status).toBe(200);
    // A makeup artist's starter checklist: three before, two on the day, two after.
    expect(steps.body.data.map((s) => s.when)).toEqual(["before", "before", "before", "on_day", "on_day", "after", "after"]);
    // Spread out: a week before down to the day before; after, the next day to a week after.
    expect(steps.body.data.map((s) => s.days)).toEqual([7, 4, 1, 0, 0, 1, 7]);
    expect(steps.body.data[0]).toMatchObject({ title: "Trial session done", days: 7 });

    // The owner makes it their own: rename, drop, add.
    const [trial, look, kit, reach, , photos] = steps.body.data;
    const items = [
      { id: trial!.id, title: "Trial session done", when: "before", days: 10 },
      { id: look!.id, title: "Look finalised with bride", when: "before", days: 5 },
      { id: kit!.id, title: kit!.title, when: "before", days: 1 },
      { id: reach!.id, title: reach!.title, when: "on_day", days: 9 },
      { id: photos!.id, title: photos!.title, when: "after", days: 2 },
      { title: "Thank-you message sent", when: "after", days: 0 },
    ];
    expect((await call(t.app, "PUT", `/workspaces/${ws}/checklist`, { token: staff, body: { items } })).status).toBe(403);
    const saved = await call<Step[]>(t.app, "PUT", `/workspaces/${ws}/checklist`, { token: owner, body: { items } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.map((s) => `${s.when} ${s.days} ${s.title}`)).toEqual([
      "before 10 Trial session done",
      "before 5 Look finalised with bride",
      "before 1 Kit packed and checked",
      "on_day 0 Reach venue on time",
      "after 2 Photos collected for portfolio",
      "after 0 Thank-you message sent",
    ]);

    const ev = await createEvent(owner, ws, "Sharma wedding", ["2026-12-04", "2026-12-05"]);
    const applied = await call<Task[]>(t.app, "POST", `/workspaces/${ws}/events/${ev.body.data.id}/checklist`, { token: owner });
    expect(applied.status).toBe(200);
    expect(applied.body.data.map((x) => `${x.dueDate} ${x.title}`)).toEqual([
      "2026-11-24 Trial session done",
      "2026-11-29 Look finalised with bride",
      "2026-12-03 Kit packed and checked",
      "2026-12-04 Reach venue on time",
      "2026-12-05 Thank-you message sent",
      "2026-12-07 Photos collected for portfolio",
    ]);
    expect(applied.body.data.every((x) => x.fromChecklist && x.assignee === null)).toBe(true);

    // Pressing it again adds nothing; a step removed on purpose stays removed.
    const thanks = applied.body.data.find((x) => x.title === "Thank-you message sent")!;
    await call(t.app, "DELETE", `/workspaces/${ws}/tasks/${thanks.id}`, { token: owner });
    const again = await call<Task[]>(t.app, "POST", `/workspaces/${ws}/events/${ev.body.data.id}/checklist`, { token: owner });
    expect(again.body.data).toHaveLength(5);
    // A step added to the checklist later can be pulled in.
    await call(t.app, "PUT", `/workspaces/${ws}/checklist`, {
      token: owner,
      body: { items: [...saved.body.data.map(({ id, title, when, days }) => ({ id, title, when, days })), { title: "Review requested", when: "after", days: 7 }] },
    });
    const grown = await call<Task[]>(t.app, "POST", `/workspaces/${ws}/events/${ev.body.data.id}/checklist`, { token: owner });
    expect(grown.body.data.map((x) => x.title)).toContain("Review requested");
    expect(grown.body.data).toHaveLength(6);

    // Staff work the checklist but don't add it.
    expect((await call(t.app, "POST", `/workspaces/${ws}/events/${ev.body.data.id}/checklist`, { token: staff })).status).toBe(403);
    const staffView = await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?eventId=${ev.body.data.id}`, { token: staff });
    expect(staffView.body.data).toHaveLength(6);
    const done = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks/${staffView.body.data[0]!.id}/done`, { token: staff, body: { done: true } });
    expect(done.body.data).toMatchObject({ done: true, doneBy: { name: "Staff Person" } });
  });
});

describe("event team", () => {
  it("lets freelancers see only the events they're booked on", async () => {
    const { owner, staff, freelancer, ws, ids } = await team("962");
    const booked = await createEvent(owner, ws, "Mehta wedding", [day(2), day(3)]);
    const other = await createEvent(owner, ws, "Gupta reception", [day(2)]);

    // Before anyone is booked, a freelancer sees nothing.
    expect((await call<Event[]>(t.app, "GET", `/workspaces/${ws}/events`, { token: freelancer })).body.data).toEqual([]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/events/${booked.body.data.id}`, { token: freelancer })).status).toBe(404);

    const members = [
      { userId: ids.freelancer, roleNote: "Hair stylist", callTime: "15:30" },
      { userId: ids.staff, roleNote: "Lead artist", callTime: "14:00" },
    ];
    expect((await call(t.app, "PUT", `/workspaces/${ws}/events/${booked.body.data.id}/team`, { token: staff, body: { members } })).status).toBe(403);
    const saved = await call<TeamMember[]>(t.app, "PUT", `/workspaces/${ws}/events/${booked.body.data.id}/team`, { token: owner, body: { members } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.map((m) => `${m.callTime} ${m.name} (${m.roleNote})`)).toEqual([
      "14:00 Staff Person (Lead artist)",
      "15:30 Freelance Artist (Hair stylist)",
    ]);

    // Now the freelancer sees that event, without the client's number or the booking value.
    const list = await call<Event[]>(t.app, "GET", `/workspaces/${ws}/events`, { token: freelancer });
    expect(list.body.data.map((e) => e.title)).toEqual(["Mehta wedding"]);
    const view = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${booked.body.data.id}`, { token: freelancer });
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ clientPhone: null, value: null });
    expect(view.body.data.team).toHaveLength(2);
    expect((await call(t.app, "GET", `/workspaces/${ws}/events/${other.body.data.id}`, { token: freelancer })).status).toBe(404);
    const month = day(2).slice(0, 7);
    const cal = await call<{ eventTitle: string }[]>(t.app, "GET", `/workspaces/${ws}/calendar?month=${month}`, { token: freelancer });
    expect(new Set(cal.body.data.map((c) => c.eventTitle))).toEqual(new Set(["Mehta wedding"]));
    // Clashes are about the whole business's diary; freelancers don't get them.
    expect((await call(t.app, "GET", `/workspaces/${ws}/event-clashes?dates=${day(2)}`, { token: freelancer })).status).toBe(403);
    // Staff still see the client's number.
    expect((await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${booked.body.data.id}`, { token: staff })).body.data.clientPhone).toMatch(/98333/);

    // My Day shows the event with the call time.
    const myDay = await call<MyDay>(t.app, "GET", `/workspaces/${ws}/my-day`, { token: freelancer });
    expect(myDay.status).toBe(200);
    expect(myDay.body.data.today).toBe(day(0));
    expect(myDay.body.data.events).toEqual([expect.objectContaining({ id: booked.body.data.id, callTime: "15:30", roleNote: "Hair stylist" })]);

    // Only people from the team can be booked.
    const stranger = await signIn(t.app, "9620000099", "Stranger");
    const strangerId = (await call<{ user: { id: string } }>(t.app, "GET", "/auth/me", { token: stranger })).body.data.user.id;
    const bad = await call(t.app, "PUT", `/workspaces/${ws}/events/${booked.body.data.id}/team`, {
      token: owner,
      body: { members: [{ userId: strangerId }] },
    });
    expect(bad.status).toBe(400);

    // Taking someone off the team takes the event away from them.
    await call(t.app, "PUT", `/workspaces/${ws}/events/${booked.body.data.id}/team`, { token: owner, body: { members: [members[1]] } });
    expect((await call(t.app, "GET", `/workspaces/${ws}/events/${booked.body.data.id}`, { token: freelancer })).status).toBe(404);
  });
});

describe("tasks", () => {
  it("gives tasks to the team and keeps everyone to their own", async () => {
    const { owner, staff, freelancer, accountant, ws, ids } = await team("963");

    // The owner gives staff a task that was due yesterday.
    const late = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Call the florist", assigneeId: ids.staff, dueDate: day(-1), priority: "high" },
    });
    expect(late.status).toBe(201);
    expect(late.body.data).toMatchObject({ overdue: true, assignee: { id: ids.staff, name: "Staff Person" } });

    // Staff add tasks for themselves, not for others.
    const own = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: staff, body: { title: "Pack the kit", dueDate: day(0) } });
    expect(own.status).toBe(201);
    expect(own.body.data.assignee?.id).toBe(ids.staff);
    const soon = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: staff, body: { title: "Order lashes", dueDate: day(3) } });
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: staff, body: { title: "Owner's job", assigneeId: ids.owner } })).status).toBe(403);
    // Accountants don't do tasks.
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks`, { token: accountant })).status).toBe(403);

    // Staff can tick the owner's task but not rewrite it.
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${late.body.data.id}`, { token: staff, body: { title: "Something else" } })).status).toBe(403);
    // A partial change keeps everything else.
    const moved = await call<Task>(t.app, "PATCH", `/workspaces/${ws}/tasks/${own.body.data.id}`, { token: staff, body: { title: "Pack and check the kit" } });
    expect(moved.body.data).toMatchObject({ title: "Pack and check the kit", dueDate: day(0) });

    const mine = await call<MyDay>(t.app, "GET", `/workspaces/${ws}/my-day`, { token: staff });
    expect(mine.body.data.overdue.map((x) => x.title)).toEqual(["Call the florist"]);
    expect(mine.body.data.dueToday.map((x) => x.title)).toEqual(["Pack and check the kit"]);
    expect(mine.body.data.upcoming.map((x) => x.title)).toEqual(["Order lashes"]);

    // Home counts them: yours, and the team's late ones for the owner.
    const staffHome = await call<{ tasks: { overdue: number; dueToday: number; teamOverdue: number | null } }>(t.app, "GET", `/workspaces/${ws}/home`, {
      token: staff,
    });
    expect(staffHome.body.data.tasks).toEqual({ overdue: 1, dueToday: 1, teamOverdue: null });
    const ownerHome = await call<{ tasks: { teamOverdue: number | null } }>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner });
    expect(ownerHome.body.data.tasks.teamOverdue).toBe(1);

    const ticked = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks/${late.body.data.id}/done`, { token: staff, body: { done: true } });
    expect(ticked.body.data).toMatchObject({ done: true, overdue: false });
    // The owner sees the team's tasks; staff can't.
    const teamTasks = await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?scope=team&status=open`, { token: owner });
    expect(teamTasks.body.data.map((x) => x.title)).toEqual(["Pack and check the kit", "Order lashes"]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks?scope=team`, { token: staff })).status).toBe(403);

    // Someone else's personal task is invisible to a freelancer.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${soon.body.data.id}/done`, { token: freelancer, body: { done: true } })).status).toBe(404);
    // The freelancer's own list is empty but works.
    expect((await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks`, { token: freelancer })).body.data).toEqual([]);

    // A freelancer can't hang a task on an event they're not on.
    const ev = await createEvent(owner, ws, "Kapoor wedding", [day(5)]);
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: freelancer, body: { title: "Look at venue", eventId: ev.body.data.id } })).status).toBe(400);
    await call(t.app, "PUT", `/workspaces/${ws}/events/${ev.body.data.id}/team`, { token: owner, body: { members: [{ userId: ids.freelancer }] } });
    const onEvent = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: freelancer, body: { title: "Look at venue", eventId: ev.body.data.id } });
    expect(onEvent.status).toBe(201);
    // Owners can leave an event's task to whoever is on it, but a task outside an event needs someone.
    const forAnyone = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Collect the extension cords", eventId: ev.body.data.id, assigneeId: null },
    });
    expect(forAnyone.body.data.assignee).toBeNull();
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Nobody's job", assigneeId: null } })).status).toBe(400);
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: staff, body: { title: "Leave it", eventId: ev.body.data.id, assigneeId: null } })).status).toBe(403);

    // Unassigned checklist steps can be ticked by anyone on the event.
    const steps = await call<Task[]>(t.app, "POST", `/workspaces/${ws}/events/${ev.body.data.id}/checklist`, { token: owner });
    const step = steps.body.data.find((x) => x.fromChecklist)!;
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${step.id}/done`, { token: freelancer, body: { done: true } })).status).toBe(200);
    const reopened = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks/${step.id}/done`, { token: freelancer, body: { done: false } });
    expect(reopened.body.data).toMatchObject({ done: false, doneBy: null });

    // Only the owner, a manager, or whoever made it can remove a task.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/tasks/${late.body.data.id}`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/tasks/${own.body.data.id}`, { token: staff })).status).toBe(200);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${own.body.data.id}`, { token: staff, body: { title: "Back again" } })).status).toBe(404);
  });

  it("takes a cancelled or deleted event's tasks off everyone's list", async () => {
    const { owner, staff, ws, ids } = await team("966");
    const ev = await createEvent(owner, ws, "Called-off wedding", [day(3)]);
    const late = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Book the extra artist", eventId: ev.body.data.id, assigneeId: ids.staff, dueDate: day(-1) },
    });
    const home = () => call<{ tasks: { overdue: number; teamOverdue: number | null } }>(t.app, "GET", `/workspaces/${ws}/home`, { token: staff });
    expect((await home()).body.data.tasks.overdue).toBe(1);

    await call(t.app, "PATCH", `/workspaces/${ws}/events/${ev.body.data.id}`, { token: owner, body: { status: "cancelled" } });
    expect((await home()).body.data.tasks.overdue).toBe(0);
    expect((await call<MyDay>(t.app, "GET", `/workspaces/${ws}/my-day`, { token: staff })).body.data.overdue).toEqual([]);
    expect((await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?scope=team`, { token: owner })).body.data).toEqual([]);
    // Still there on the event itself, and back when the event is.
    expect((await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?eventId=${ev.body.data.id}`, { token: owner })).body.data).toHaveLength(1);
    await call(t.app, "PATCH", `/workspaces/${ws}/events/${ev.body.data.id}`, { token: owner, body: { status: "confirmed" } });
    expect((await home()).body.data.tasks.overdue).toBe(1);

    await call(t.app, "DELETE", `/workspaces/${ws}/events/${ev.body.data.id}`, { token: owner });
    expect((await home()).body.data.tasks.overdue).toBe(0);
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${late.body.data.id}/done`, { token: staff, body: { done: true } })).status).toBe(404);
  });

  it("keeps each business's tasks, checklist and teams to itself", async () => {
    const a = await team("964");
    const b = await team("965");
    const ev = await createEvent(a.owner, a.ws, "Private wedding", [day(4)]);
    const task = await call<Task>(t.app, "POST", `/workspaces/${a.ws}/tasks`, { token: a.owner, body: { title: "Secret task" } });

    // B's owner can't reach A's things through B's business or A's.
    expect((await call(t.app, "PATCH", `/workspaces/${b.ws}/tasks/${task.body.data.id}`, { token: b.owner, body: { title: "Mine now" } })).status).toBe(404);
    expect((await call(t.app, "POST", `/workspaces/${b.ws}/tasks/${task.body.data.id}/done`, { token: b.owner, body: { done: true } })).status).toBe(404);
    expect((await call(t.app, "POST", `/workspaces/${b.ws}/events/${ev.body.data.id}/checklist`, { token: b.owner })).status).toBe(404);
    expect((await call(t.app, "PUT", `/workspaces/${b.ws}/events/${ev.body.data.id}/team`, { token: b.owner, body: { members: [] } })).status).toBe(404);
    expect((await call(t.app, "GET", `/workspaces/${a.ws}/checklist`, { token: b.owner })).status).toBe(404);
    // Tasks can't point at another business's event or person.
    expect((await call(t.app, "POST", `/workspaces/${b.ws}/tasks`, { token: b.owner, body: { title: "Sneaky", eventId: ev.body.data.id } })).status).toBe(400);
    expect((await call(t.app, "POST", `/workspaces/${b.ws}/tasks`, { token: b.owner, body: { title: "Sneaky", assigneeId: a.ids.staff } })).status).toBe(400);
    // Nor steal another business's checklist steps.
    const stepsA = (await call<Step[]>(t.app, "GET", `/workspaces/${a.ws}/checklist`, { token: a.owner })).body.data;
    const steal = await call(t.app, "PUT", `/workspaces/${b.ws}/checklist`, {
      token: b.owner,
      body: { items: [{ id: stepsA[0]!.id, title: "Taken", when: "before", days: 1 }] },
    });
    expect(steal.status).toBe(404);
    expect((await call<Step[]>(t.app, "GET", `/workspaces/${a.ws}/checklist`, { token: a.owner })).body.data[0]!.title).toBe(stepsA[0]!.title);
  });
});
