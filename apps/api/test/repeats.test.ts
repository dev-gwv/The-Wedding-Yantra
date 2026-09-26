import { weekdayOf } from "@wedding-yantra/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

type Task = { id: string; title: string; dueDate: string | null; overdue: boolean; repeat: { id: string; label: string; active: boolean } | null };
type Repeat = { id: string; title: string; label: string; nextDate: string | null };

describe("repeating tasks", () => {
  it("makes one task on each of its days, never piles up, and stops when asked", async () => {
    const owner = await signIn(t.app, "9770000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Reels Studio");
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: "Aman", phone: "9770000002", role: "staff" } });
    const staff = await signIn(t.app, "9770000002", "Aman");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
    const mine = async (token = owner) => (await call<Task[]>(t.app, "GET", `/workspaces/${ws}/tasks?scope=mine&status=open`, { token })).body.data;
    // Pretend a day has passed since the rules were last looked at.
    const nextDay = async () => {
      await t.db.query(`UPDATE task_repeats SET checked_on = checked_on - 1, start_date = start_date - 7 WHERE workspace_id = $1`, [ws]);
      await t.db.query(`UPDATE tasks SET due_date = due_date - 1 WHERE workspace_id = $1 AND repeat_id IS NOT NULL`, [ws]);
    };

    const daily = await call<Repeat>(t.app, "POST", `/workspaces/${ws}/task-repeats`, {
      token: owner,
      body: { title: "Follow up all open enquiries", frequency: "daily", dueTime: "10:00" },
    });
    expect(daily.status).toBe(201);
    expect(daily.body.data).toMatchObject({ label: "Every day", nextDate: today() });
    let list = await mine();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Follow up all open enquiries", dueDate: today(), repeat: { label: "Every day", active: true } });
    // Looking again doesn't make another.
    expect(await mine()).toHaveLength(1);

    // The next day: a new one, and yesterday's stays late until it's ticked.
    await nextDay();
    list = await mine();
    expect(list.map((x) => [x.dueDate === today(), x.overdue])).toEqual([
      [false, true],
      [true, false],
    ]);

    // Weekly on a day that isn't today: nothing yet, and the next date is said.
    const other = ((weekdayOf(today()) % 7) + 1) as number;
    const weekly = await call<Repeat>(t.app, "POST", `/workspaces/${ws}/task-repeats`, {
      token: owner,
      body: { title: "Post 3 reels", frequency: "weekly", weekdays: [other], assigneeId: null },
    });
    expect(weekly.body.data.nextDate).not.toBe(today());
    expect((await mine()).filter((x) => x.title === "Post 3 reels")).toHaveLength(0);
    expect((await call(t.app, "POST", `/workspaces/${ws}/task-repeats`, { token: owner, body: { title: "Reels", frequency: "weekly", weekdays: [] } })).status).toBe(400);
    expect((await call(t.app, "POST", `/workspaces/${ws}/task-repeats`, { token: owner, body: { title: "Rent", frequency: "monthly" } })).status).toBe(400);

    // Staff repeat tasks for themselves only; owners and managers for anyone.
    const team = await call<{ members: { userId: string; name: string }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    const ownerId = team.body.data.members.find((m) => m.name === "Owner Person")!.userId;
    const amanId = team.body.data.members.find((m) => m.name === "Aman")!.userId;
    expect((await call(t.app, "POST", `/workspaces/${ws}/task-repeats`, { token: staff, body: { title: "Clean kit", frequency: "daily", assigneeId: ownerId } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/task-repeats`, { token: staff, body: { title: "Clean kit", frequency: "daily" } })).status).toBe(201);
    await call(t.app, "POST", `/workspaces/${ws}/task-repeats`, { token: owner, body: { title: "Charge batteries", frequency: "daily", assigneeId: amanId } });
    expect((await mine(staff)).map((x) => x.title).sort()).toEqual(["Charge batteries", "Clean kit"]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/task-repeats?scope=team`, { token: staff })).status).toBe(403);
    const all = await call<Repeat[]>(t.app, "GET", `/workspaces/${ws}/task-repeats?scope=team`, { token: owner });
    expect(all.body.data).toHaveLength(4);

    // A deleted copy doesn't come back; a stopped rule makes no more.
    const todays = (await mine()).find((x) => x.title === "Follow up all open enquiries" && x.dueDate === today())!;
    await call(t.app, "DELETE", `/workspaces/${ws}/tasks/${todays.id}`, { token: owner });
    await t.db.query(`UPDATE task_repeats SET checked_on = NULL WHERE workspace_id = $1`, [ws]);
    expect((await mine()).filter((x) => x.dueDate === today())).toHaveLength(0);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/task-repeats/${daily.body.data.id}`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/task-repeats/${daily.body.data.id}`, { token: owner })).body.data).toEqual({ stopped: true });
    await nextDay();
    const after = (await mine()).filter((x) => x.title === "Follow up all open enquiries");
    expect(after.every((x) => x.dueDate !== today())).toBe(true);
    expect(after[0]!.repeat).toMatchObject({ active: false });
  });
});
