import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Update = { kind: string; action: string; meta: Record<string, unknown>; text: string | null; actor: { name: string | null } | null; task: { title: string } };
type Person = {
  person: { user: { id: string; name: string | null }; role: string; offToday: boolean };
  counts: { pending: number; doing: number; stuck: number; late: number; toCheck: number; doneThisWeek: number };
  tasks: { title: string; status: string }[];
  updates: Update[];
  nextBefore: string | null;
};
type Detail = { id: string; stepList: { id: string }[] };

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role: "staff" } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const arfin = await join(`${prefix}0000002`, "Arfin Khan");
  const neha = await join(`${prefix}0000003`, "Neha Joshi");
  const members = (await call<{ members: { userId: string; name: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const idOf = (name: string) => members.find((m) => m.name === name)!.userId;
  return { owner, ws, arfin, neha, arfinId: idOf("Arfin Khan"), nehaId: idOf("Neha Joshi") };
}

describe("one person's tasks and recent updates", () => {
  it("shows what they're on and everything they did, newest first", async () => {
    const { owner, ws, arfin, arfinId } = await team("917");
    const give = (title: string, extra: Record<string, unknown> = {}) =>
      call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title, assigneeId: arfinId, ...extra } }).then((r) => r.body.data.id);
    const as = (path: string, body?: unknown) => call<Detail>(t.app, "POST", `/workspaces/${ws}/tasks/${path}`, { token: arfin, body });

    const quote = await give("Get tent quotation", { steps: ["Call the vendor", "Compare two prices"] });
    const dj = await give("Book DJ for sangeet");
    await give("Collect advance from Sharma family", { dueDate: "2020-01-10" });
    const card = await give("Design the invitation card", { needsCheck: true });
    const board = await give("Print the welcome board");

    await as(`${quote}/move`, { status: "doing" });
    const steps = (await call<Detail>(t.app, "GET", `/workspaces/${ws}/tasks/${quote}`, { token: arfin })).body.data.stepList;
    await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${quote}/steps/${steps[0]!.id}`, { token: arfin, body: { done: true } });
    await as(`${quote}/comments`, { body: "Called twice, waiting for the rates" });
    await as(`${dj}/move`, { status: "waiting", reason: "Vendor not answering" });
    await as(`${card}/submit`, { note: "First draft" });
    await call(t.app, "POST", `/workspaces/${ws}/tasks/${card}/review`, { token: owner, body: { approve: false, reason: "Change the font" } });
    await as(`${card}/submit`, { note: "New font" });
    await as(`${board}/done`, { done: true });

    const res = await call<Person>(t.app, "GET", `/workspaces/${ws}/tasks/people/${arfinId}`, { token: owner });
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.person.user.name).toBe("Arfin Khan");
    expect(p.counts).toEqual({ pending: 4, doing: 1, stuck: 1, late: 1, toCheck: 1, doneThisWeek: 1 });
    expect(p.tasks.map((x) => x.title)).toContain("Print the welcome board");

    // Newest first: finished, handed in again, sent back by the owner, handed in, stuck, comment, step, started.
    const line = (u: Update) =>
      u.kind === "event" ? `${u.actor?.name}: ${u.action}${u.meta.to ? ` ${String(u.meta.to)}` : ""} · ${u.task.title}` : `${u.actor?.name}: ${u.kind} · ${u.task.title}${u.text ? ` · ${u.text}` : ""}`;
    const mine = p.updates.filter((u) => u.action !== "created").map(line);
    expect(mine).toEqual([
      "Arfin Khan: done · Print the welcome board",
      "Arfin Khan: submitted · Design the invitation card",
      "Riya Owner: sent_back · Design the invitation card",
      "Arfin Khan: submitted · Design the invitation card",
      "Arfin Khan: moved waiting · Book DJ for sangeet",
      "Arfin Khan: comment · Get tent quotation · Called twice, waiting for the rates",
      "Arfin Khan: step · Get tent quotation · Call the vendor",
      "Arfin Khan: moved doing · Get tent quotation",
    ]);
    expect(p.updates.find((u) => u.action === "moved" && u.meta.to === "waiting")!.meta.reason).toBe("Vendor not answering");
    // The tasks being given show too, as the owner's doing on Arfin's work.
    expect(p.updates.filter((u) => u.action === "created")).toHaveLength(5);
    expect(p.nextBefore).toBeNull();
  });

  it("pages older updates", async () => {
    const { owner, ws, arfinId } = await team("918");
    for (let i = 0; i < 55; i++) {
      await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title: `Task number ${i}`, assigneeId: arfinId } });
    }
    const first = (await call<Person>(t.app, "GET", `/workspaces/${ws}/tasks/people/${arfinId}`, { token: owner })).body.data;
    expect(first.updates).toHaveLength(50);
    expect(first.nextBefore).not.toBeNull();
    const next = (await call<Person>(t.app, "GET", `/workspaces/${ws}/tasks/people/${arfinId}?before=${encodeURIComponent(first.nextBefore!)}`, { token: owner })).body.data;
    expect(next.updates).toHaveLength(5);
    expect(next.nextBefore).toBeNull();
    const titles = new Set([...first.updates, ...next.updates].map((u) => u.task.title));
    expect(titles.size).toBe(55);
  });

  it("lets each person see only their own page, and keeps businesses apart", async () => {
    const { owner, ws, arfin, arfinId, nehaId } = await team("919");
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks/people/${arfinId}`, { token: arfin })).status).toBe(200);
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks/people/me`, { token: arfin })).status).toBe(200);
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks/people/${nehaId}`, { token: arfin })).status).toBe(403);

    const other = await team("920");
    expect((await call(t.app, "GET", `/workspaces/${other.ws}/tasks/people/${arfinId}`, { token: other.owner })).status).toBe(404);
    expect((await call(t.app, "GET", `/workspaces/${ws}/tasks/people/${other.arfinId}`, { token: owner })).status).toBe(404);
  });
});
