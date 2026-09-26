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
  status: string;
  done: boolean;
  priority: string;
  tag: string | null;
  tagLabel: string | null;
  needsCheck: boolean;
  revisions: number;
  movedCount: number;
  completedAt: string | null;
  acceptedAt: string | null;
  steps: { done: number; total: number };
  comments: number;
  files: number;
  overdue: boolean;
  dueDate: string | null;
  lastSubmission: { decision: string | null } | null;
};
type Detail = Task & {
  stepList: { id: string; title: string; done: boolean }[];
  commentList: { body: string; mine: boolean }[];
  fileList: { id: string }[];
  submissions: { note: string | null; decision: string | null; reason: string | null }[];
  history: { action: string }[];
  can: { edit: boolean; move: boolean; review: boolean; cancel: boolean };
};
type Board = {
  people: { user: { id: string; name: string | null }; open: number; late: number; toCheck: number; stuck: number; offToday: boolean }[];
  totals: { late: number; toCheck: number; stuck: number; unassigned: number };
};

const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function day(offset: number): string {
  const [y, m, d] = IST.format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
}
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake jpeg body")]).toString("base64");

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
  const freelancer = await join(`${prefix}0000004`, "freelancer", "Free Lancer");
  const members = (await call<{ members: { userId: string; name: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const id = (name: string) => members.find((m) => m.name === name)!.userId;
  return { owner, staff, other, freelancer, ws, ids: { owner: id("Owner Person"), staff: id("Rohit Staff"), other: id("Neha Staff"), freelancer: id("Free Lancer") } };
}

describe("delegating a task", () => {
  it("gives a task with a check, and runs the hand-in, send-back and approve loop", async () => {
    const { owner, staff, other, ws, ids } = await team("811");
    const give = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: {
        title: "Album layout for the Sharma wedding",
        assigneeId: ids.staff,
        dueDate: day(2),
        priority: "urgent",
        tag: "delivery",
        needsCheck: true,
        notes: "Photos in https://drive.google.com/abc",
        steps: ["Pick 60 photos", "Lay out 40 pages"],
      },
    });
    expect(give.status).toBe(201);
    expect(give.body.data).toMatchObject({ status: "open", priority: "urgent", tag: "delivery", tagLabel: "Delivery", needsCheck: true, steps: { done: 0, total: 2 } });
    const id = give.body.data.id;

    // Someone else on the team can't see or move it.
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks/${id}`, { token: other })).status).toBe(404);

    // Staff start it, tick a step, and can't skip the check.
    let d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${id}/move`, { token: staff, body: { status: "doing" } })).body.data;
    expect(d.status).toBe("doing");
    expect(d.can).toMatchObject({ move: true, review: false, cancel: false });
    d = (await call<Detail>(t.app, "PATCH", `/workspaces/${ws}/tasks/${id}/steps/${d.stepList[0]!.id}`, { token: staff, body: { done: true } })).body.data;
    expect(d.steps).toEqual({ done: 1, total: 2 });
    const skip = await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/move`, { token: staff, body: { status: "done" } });
    expect(skip.status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/done`, { token: staff, body: { done: true } })).status).toBe(403);

    // Stuck needs a reason.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/move`, { token: staff, body: { status: "waiting" } })).status).toBe(400);
    d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${id}/move`, { token: staff, body: { status: "waiting", reason: "Waiting for the couple's photo picks" } }))
      .body.data;
    expect(d.status).toBe("waiting");

    // Hand in with a photo; a note, link or photo is required.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/submit`, { token: staff, body: {} })).status).toBe(400);
    const photo = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/files`, { token: staff, body: { contentType: "image/jpeg", data: JPEG, name: "layout.jpg" } });
    d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${id}/submit`, { token: staff, body: { note: "First draft", fileId: photo.body.data.id } })).body.data;
    expect(d.status).toBe("review");
    expect(d.completedAt).not.toBeNull();
    expect(d.fileList).toHaveLength(1);
    // Can't take it back or approve your own.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/review`, { token: staff, body: { approve: true } })).status).toBe(403);

    // The owner sends it back with a reason.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/review`, { token: owner, body: { approve: false } })).status).toBe(400);
    d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${id}/review`, { token: owner, body: { approve: false, reason: "Cover page needs the couple's names" } }))
      .body.data;
    expect(d).toMatchObject({ status: "doing", revisions: 1, completedAt: null });
    expect(d.submissions[0]).toMatchObject({ decision: "sent_back", reason: "Cover page needs the couple's names" });

    // Comment with a mention, then hand in again and get approved.
    d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${id}/comments`, { token: staff, body: { body: "@Owner fixed the cover, have a look" } })).body.data;
    expect(d.commentList).toMatchObject([{ body: "@Owner fixed the cover, have a look", mine: true }]);
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${id}/submit`, { token: staff, body: { link: "https://drive.google.com/final" } });
    const owners = (await call<Detail>(t.app, "GET", `/workspaces/${ws}/tasks/${id}`, { token: owner })).body.data;
    expect(owners.can).toMatchObject({ edit: true, review: true, cancel: true });
    d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${id}/review`, { token: owner, body: { approve: true } })).body.data;
    expect(d).toMatchObject({ status: "done", done: true, revisions: 1 });
    expect(d.acceptedAt).not.toBeNull();
    expect(d.submissions.map((s) => s.decision)).toEqual(["approved", "sent_back"]);
    expect(d.history.map((h) => h.action)).toEqual(expect.arrayContaining(["created", "moved", "submitted", "sent_back", "approved"]));

    // It's in the activity feed in words.
    const feed = await call<{ items: { action: string }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner });
    expect(feed.body.data.items.map((i) => i.action)).toEqual(expect.arrayContaining(["task.submitted", "task.sent_back", "task.approved", "task.stuck"]));
  });

  it("lets tasks without a check be ticked, cancelled by the giver, and snoozed with a count", async () => {
    const { owner, staff, ws, ids } = await team("812");
    const task = (
      await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Call the florist", assigneeId: ids.staff, dueDate: day(-1) } })
    ).body.data;
    expect(task.overdue).toBe(true);
    // Snooze to tomorrow: counted as moved.
    let d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${task.id}/snooze`, { token: staff, body: { to: day(1), reason: "Florist closed today" } }))
      .body.data;
    expect(d).toMatchObject({ dueDate: day(1), movedCount: 1, overdue: false });
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${task.id}/snooze`, { token: staff, body: { to: day(0) } })).status).toBe(400);
    // Staff can't cancel; the owner can.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${task.id}/move`, { token: staff, body: { status: "cancelled" } })).status).toBe(403);
    d = (await call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${task.id}/move`, { token: owner, body: { status: "cancelled" } })).body.data;
    expect(d.status).toBe("cancelled");
    // Cancelled tasks leave the open list.
    const open = await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?status=open`, { token: staff });
    expect(open.body.data.map((x) => x.id)).not.toContain(task.id);

    // An ordinary task is ticked done by whoever does it, and ticked back.
    const quick = (await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Send the quote", assigneeId: ids.staff } })).body.data;
    const done = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks/${quick.id}/done`, { token: staff, body: { done: true } });
    expect(done.body.data).toMatchObject({ status: "done", done: true });
    const back = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks/${quick.id}/done`, { token: staff, body: { done: false } });
    expect(back.body.data).toMatchObject({ status: "open", completedAt: null });
    // A task for yourself never needs a check.
    const self = await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Update price list", needsCheck: true } });
    expect(self.body.data.needsCheck).toBe(false);
    // Only the business's own tags.
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Tagged", tag: "x_nope" } })).status).toBe(400);
  });

  it("filters, searches and shows each person's load", async () => {
    const { owner, staff, other, freelancer, ws, ids } = await team("813");
    const make = (token: string, body: object) => call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token, body });
    await make(owner, { title: "Late invoice follow-up", assigneeId: ids.staff, dueDate: day(-2), priority: "high", tag: "client" });
    await make(owner, { title: "Mood board for Kapoor", assigneeId: ids.other, dueDate: day(0), tag: "event" });
    const stuck = (await make(owner, { title: "Generator booking", assigneeId: ids.other, dueDate: day(3) })).body.data;
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${stuck.id}/move`, { token: other, body: { status: "waiting", reason: "Vendor not answering" } });
    const check = (await make(owner, { title: "Reel edit", assigneeId: ids.staff, needsCheck: true })).body.data;
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${check.id}/submit`, { token: staff, body: { note: "Done, see the drive" } });

    const list = async (q: string, token = owner) => (await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?${q}`, { token })).body.data.map((x) => x.title);
    expect(await list("scope=team&status=open&due=overdue")).toEqual(["Late invoice follow-up"]);
    expect(await list("scope=team&status=open&due=today")).toEqual(["Mood board for Kapoor"]);
    expect(await list("scope=team&state=waiting")).toEqual(["Generator booking"]);
    expect(await list("scope=team&state=review")).toEqual(["Reel edit"]);
    expect(await list("scope=team&status=open&tag=client")).toEqual(["Late invoice follow-up"]);
    expect(await list("scope=team&status=open&priority=high")).toEqual(["Late invoice follow-up"]);
    expect(await list("scope=team&status=open&q=kapoor")).toEqual(["Mood board for Kapoor"]);
    expect((await list("scope=given&status=open")).sort()).toEqual(["Generator booking", "Late invoice follow-up", "Mood board for Kapoor", "Reel edit"]);
    // Staff can't see the team board.
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks?scope=team`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks/board`, { token: staff })).status).toBe(403);

    // Days off show on the board.
    await call(t.app, "POST", `/workspaces/${ws}/time-off`, { token: owner, body: { userId: ids.freelancer, startDate: day(0), endDate: day(1) } });
    const board = (await call<Board>(t.app, "GET", `/workspaces/${ws}/tasks/board`, { token: owner })).body.data;
    const person = (id: string) => board.people.find((p) => p.user.id === id)!;
    expect(person(ids.staff)).toMatchObject({ open: 2, late: 1, toCheck: 1 });
    expect(person(ids.other)).toMatchObject({ open: 2, stuck: 1 });
    expect(person(ids.freelancer)).toMatchObject({ open: 0, offToday: true });
    expect(board.totals).toMatchObject({ late: 1, toCheck: 1, stuck: 1 });
    // The busiest-late person comes first.
    expect(board.people[0]!.user.id).toBe(ids.staff);
    void freelancer;
  });

  it("keeps a finished task on time even when it's edited later", async () => {
    const { owner, staff, ws, ids } = await team("814");
    const task = (await call<Task>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: "Book the band", assigneeId: ids.staff, dueDate: day(0) } }))
      .body.data;
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${task.id}/done`, { token: staff, body: { done: true } });
    // Editing the title afterwards doesn't touch when it was finished.
    const before = (await call<Detail>(t.app, "GET", `/workspaces/${ws}/tasks/${task.id}`, { token: owner })).body.data.completedAt;
    await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${task.id}`, { token: owner, body: { title: "Book the band (confirmed)" } });
    const after = (await call<Detail>(t.app, "GET", `/workspaces/${ws}/tasks/${task.id}`, { token: owner })).body.data;
    expect(after.completedAt).toBe(before);
    expect(after.history[0]!.action).toBe("edited");
  });
});
