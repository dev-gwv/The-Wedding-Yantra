import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Stage = { id: string; name: string; kind: string; leadCount: number; value: number };
type Summary = { id: string; name: string; stageId: string; stageKind: string; followUpState: string; clientId: string | null };
type Lead = Summary & {
  assignedTo: { id: string } | null;
  lostReason: string | null;
  nextFollowUpAt: string | null;
  activities: { kind: string; body: string | null }[];
};
type List = { stages: Stage[]; leads: Summary[] };

/** A business with an owner, a staff member and an accountant. */
async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name, phone, role },
    });
    const token = await signIn(t.app, phone);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const staff = await join(`${prefix}0000002`, "staff", "Staff Person");
  const accountant = await join(`${prefix}0000003`, "accountant", "Accountant Person");
  const stages = (await call<List>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.stages;
  return { owner, staff, accountant, ws, stages };
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("sales setup for a new business", () => {
  it("gets its trade's stages, quick replies and an enquiry form", async () => {
    const { owner, ws, stages } = await team("981");
    expect(stages.map((s) => s.name)).toEqual(["New enquiry", "Contacted", "Trial booked", "Quote sent", "Booked", "Lost"]);
    expect(stages.filter((s) => s.kind === "won").map((s) => s.name)).toEqual(["Booked"]);
    expect(stages.filter((s) => s.kind === "lost").map((s) => s.name)).toEqual(["Lost"]);

    const templates = await call<{ title: string }[]>(t.app, "GET", `/workspaces/${ws}/whatsapp-templates`, { token: owner });
    expect(templates.body.data).toHaveLength(4);

    const form = await call<{ slug: string; enabled: boolean }>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner });
    expect(form.body.data.enabled).toBe(true);
    expect(form.body.data.slug).toMatch(/^981-studio-[0-9a-f]{6}$/);
  });
});

describe("leads", () => {
  it("adds, finds, follows up, books and loses leads", async () => {
    const { owner, ws, stages } = await team("982");
    const won = stages.find((s) => s.kind === "won")!;
    const lost = stages.find((s) => s.kind === "lost")!;

    const bad = await call(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "N", phone: "123", eventDate: "next week" },
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields ?? {})).toEqual(expect.arrayContaining(["name", "phone", "eventDate"]));

    const created = await call<Lead>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: {
        name: "Neha Kapoor",
        phone: "98111 22233",
        eventType: "wedding",
        eventDate: "2026-12-05",
        budget: "150000",
        source: "instagram",
        nextFollowUpAt: daysFromNow(-1),
      },
    });
    expect(created.status).toBe(201);
    const neha = created.body.data;
    expect(neha.stageId).toBe(stages[0]!.id);
    expect(neha.assignedTo).not.toBeNull();
    expect(neha.followUpState).toBe("overdue");
    // Created with a follow-up: both show, "created" at the bottom.
    expect(neha.activities.map((a) => a.kind)).toEqual(["follow_up_set", "created"]);

    await call(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Arjun Mehta", phone: "9822233344", budget: 50000, nextFollowUpAt: daysFromNow(3) },
    });

    const list = await call<List>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner });
    expect(list.body.data.leads).toHaveLength(2);
    expect(list.body.data.stages[0]).toMatchObject({ leadCount: 2, value: 200000 });

    const byName = await call<List>(t.app, "GET", `/workspaces/${ws}/leads?q=neha`, { token: owner });
    expect(byName.body.data.leads.map((l) => l.name)).toEqual(["Neha Kapoor"]);
    const byPhone = await call<List>(t.app, "GET", `/workspaces/${ws}/leads?q=333%2044`, { token: owner });
    expect(byPhone.body.data.leads.map((l) => l.name)).toEqual(["Arjun Mehta"]);
    const due = await call<List>(t.app, "GET", `/workspaces/${ws}/leads?followUp=due`, { token: owner });
    expect(due.body.data.leads.map((l) => l.name)).toEqual(["Neha Kapoor"]);
    const upcoming = await call<List>(t.app, "GET", `/workspaces/${ws}/leads?followUp=upcoming`, { token: owner });
    expect(upcoming.body.data.leads.map((l) => l.name)).toEqual(["Arjun Mehta"]);

    // Notes and call logs
    const empty = await call(t.app, "POST", `/workspaces/${ws}/leads/${neha.id}/activities`, {
      token: owner,
      body: { kind: "note", body: "  " },
    });
    expect(empty.status).toBe(400);
    const noted = await call<Lead>(t.app, "POST", `/workspaces/${ws}/leads/${neha.id}/activities`, {
      token: owner,
      body: { kind: "note", body: "Wants airbrush makeup for 3 functions" },
    });
    expect(noted.body.data.activities[0]).toMatchObject({ kind: "note", body: "Wants airbrush makeup for 3 functions" });

    // Following up today moves it from overdue to today
    const today = await call<Lead>(t.app, "PATCH", `/workspaces/${ws}/leads/${neha.id}`, {
      token: owner,
      body: { nextFollowUpAt: new Date().toISOString() },
    });
    expect(today.body.data.followUpState).toBe("today");

    // Booked: becomes a client and stops needing follow-ups
    const booked = await call<Lead>(t.app, "PATCH", `/workspaces/${ws}/leads/${neha.id}`, {
      token: owner,
      body: { stageId: won.id },
    });
    expect(booked.body.data.stageKind).toBe("won");
    expect(booked.body.data.clientId).not.toBeNull();
    expect(booked.body.data.nextFollowUpAt).toBeNull();
    expect(booked.body.data.activities.map((a) => a.kind)).toContain("stage_changed");

    const client = await call<{ name: string; phone: string; leads: Summary[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/clients/${booked.body.data.clientId}`,
      { token: owner },
    );
    expect(client.body.data).toMatchObject({ name: "Neha Kapoor", phone: "+919811122233" });
    expect(client.body.data.leads.map((l) => l.id)).toEqual([neha.id]);

    // Lost needs a reason
    const arjun = list.body.data.leads.find((l) => l.name === "Arjun Mehta")!;
    const noReason = await call(t.app, "PATCH", `/workspaces/${ws}/leads/${arjun.id}`, {
      token: owner,
      body: { stageId: lost.id },
    });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.fields?.lostReason).toBeDefined();
    const lostLead = await call<Lead>(t.app, "PATCH", `/workspaces/${ws}/leads/${arjun.id}`, {
      token: owner,
      body: { stageId: lost.id, lostReason: "price" },
    });
    expect(lostLead.body.data).toMatchObject({ stageKind: "lost", lostReason: "price" });

    const deleted = await call(t.app, "DELETE", `/workspaces/${ws}/leads/${arjun.id}`, { token: owner });
    expect(deleted.status).toBe(200);
    const gone = await call(t.app, "GET", `/workspaces/${ws}/leads/${arjun.id}`, { token: owner });
    expect(gone.status).toBe(404);
  });

  it("shows staff only their own leads, and keeps others out of leads", async () => {
    const { owner, staff, accountant, ws } = await team("983");
    const ownerLead = await call<Lead>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Owner Lead" } });
    const staffLead = await call<Lead>(t.app, "POST", `/workspaces/${ws}/leads`, { token: staff, body: { name: "Staff Lead" } });

    const staffList = await call<List>(t.app, "GET", `/workspaces/${ws}/leads`, { token: staff });
    expect(staffList.body.data.leads.map((l) => l.name)).toEqual(["Staff Lead"]);
    expect(staffList.body.data.stages[0]!.leadCount).toBe(1);
    const peek = await call(t.app, "GET", `/workspaces/${ws}/leads/${ownerLead.body.data.id}`, { token: staff });
    expect(peek.status).toBe(404);

    const reassign = await call(t.app, "PATCH", `/workspaces/${ws}/leads/${staffLead.body.data.id}`, {
      token: staff,
      body: { assignedToUserId: ownerLead.body.data.assignedTo!.id },
    });
    expect(reassign.status).toBe(403);
    const del = await call(t.app, "DELETE", `/workspaces/${ws}/leads/${staffLead.body.data.id}`, { token: staff });
    expect(del.status).toBe(403);

    // The owner gives their lead to the staff member, who can then see it.
    const staffId = staffLead.body.data.assignedTo!.id;
    const given = await call<Lead>(t.app, "PATCH", `/workspaces/${ws}/leads/${ownerLead.body.data.id}`, {
      token: owner,
      body: { assignedToUserId: staffId },
    });
    expect(given.body.data.activities[0]?.kind).toBe("assigned");
    const nowVisible = await call(t.app, "GET", `/workspaces/${ws}/leads/${ownerLead.body.data.id}`, { token: staff });
    expect(nowVisible.status).toBe(200);

    // Accountants see clients but not leads.
    expect((await call(t.app, "GET", `/workspaces/${ws}/leads`, { token: accountant })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/clients`, { token: accountant })).status).toBe(200);
    expect(
      (await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: accountant, body: { name: "No Way" } })).status,
    ).toBe(403);

    // Home counts only what each person can see.
    type Home = { sales: { newLeads: number } };
    const ownerHome = await call<Home>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner });
    const staffHome = await call<Home>(t.app, "GET", `/workspaces/${ws}/home`, { token: staff });
    expect(ownerHome.body.data.sales.newLeads).toBe(2);
    expect(staffHome.body.data.sales.newLeads).toBe(2);
    const accountantHome = await call<Home>(t.app, "GET", `/workspaces/${ws}/home`, { token: accountant });
    expect(accountantHome.body.data.sales.newLeads).toBe(0);
  });
});

describe("clients, quick replies and stages", () => {
  it("manages clients and blocks duplicate numbers", async () => {
    const { owner, ws } = await team("984");
    const a = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, {
      token: owner,
      body: { name: "Kapoor Family", phone: "9833344455", city: "Delhi" },
    });
    expect(a.status).toBe(201);
    const dup = await call(t.app, "POST", `/workspaces/${ws}/clients`, {
      token: owner,
      body: { name: "Someone Else", phone: "+91 98333 44455" },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fields?.phone).toBeDefined();
    const edited = await call<{ notes: string }>(t.app, "PATCH", `/workspaces/${ws}/clients/${a.body.data.id}`, {
      token: owner,
      body: { notes: "Prefers calls after 6pm" },
    });
    expect(edited.body.data.notes).toBe("Prefers calls after 6pm");
    const found = await call<{ name: string }[]>(t.app, "GET", `/workspaces/${ws}/clients?q=kapoor`, { token: owner });
    expect(found.body.data.map((c) => c.name)).toEqual(["Kapoor Family"]);
  });

  it("lets owners edit quick replies, but not staff", async () => {
    const { owner, staff, ws } = await team("985");
    const created = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/whatsapp-templates`, {
      token: owner,
      body: { title: "Payment reminder", body: "Hi {first_name}, a gentle reminder about the advance." },
    });
    expect(created.status).toBe(201);
    expect(
      (await call(t.app, "PATCH", `/workspaces/${ws}/whatsapp-templates/${created.body.data.id}`, { token: staff, body: { title: "X Y" } }))
        .status,
    ).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/whatsapp-templates`, { token: staff })).status).toBe(200);
    expect(
      (await call(t.app, "DELETE", `/workspaces/${ws}/whatsapp-templates/${created.body.data.id}`, { token: owner })).status,
    ).toBe(200);
  });

  it("saves stages in order and never drops a stage that has leads", async () => {
    const { owner, ws, stages } = await team("986");
    const two = await call(t.app, "PUT", `/workspaces/${ws}/pipeline-stages`, {
      token: owner,
      body: { stages: stages.map((s) => ({ id: s.id, name: s.name, kind: "won" })) },
    });
    expect(two.status).toBe(400);

    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Sitting Lead" } });
    const withoutFirst = stages.slice(1).map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
    const blocked = await call(t.app, "PUT", `/workspaces/${ws}/pipeline-stages`, { token: owner, body: { stages: withoutFirst } });
    expect(blocked.status).toBe(409);

    const reshaped = [
      { id: stages[0]!.id, name: "Fresh enquiry", kind: "open" },
      { name: "Site visit", kind: "open" },
      ...stages.slice(1, 3).reverse().map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      ...stages.slice(4).map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    ];
    const saved = await call<Stage[]>(t.app, "PUT", `/workspaces/${ws}/pipeline-stages`, { token: owner, body: { stages: reshaped } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.map((s) => s.name)).toEqual([
      "Fresh enquiry",
      "Site visit",
      "Trial booked",
      "Contacted",
      "Booked",
      "Lost",
    ]);
    expect(saved.body.data[0]!.leadCount).toBe(1);
  });
});

describe("public enquiry form", () => {
  it("turns an enquiry into a lead that needs a reply today", async () => {
    const { owner, ws } = await team("987");
    const { slug } = (await call<{ slug: string }>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner })).body.data;

    const form = await call<{ businessName: string }>(t.app, "GET", `/public/forms/${slug}`);
    expect(form.body.data.businessName).toBe("987 Studio");

    const sent = await call(t.app, "POST", `/public/forms/${slug}`, {
      body: { name: "Pooja Sharma", phone: "9876512345", eventType: "sangeet", eventDate: "2027-01-20", message: "Need 6 people" },
    });
    expect(sent.status).toBe(201);
    await call(t.app, "POST", `/public/forms/${slug}`, { body: { name: "Pooja Sharma", phone: "9876512345", message: "Also haldi" } });
    await call(t.app, "POST", `/public/forms/${slug}`, { body: { name: "Bot", phone: "9876500000", website: "spam.example" } });

    const due = await call<List>(t.app, "GET", `/workspaces/${ws}/leads?followUp=due`, { token: owner });
    expect(due.body.data.leads).toHaveLength(1);
    const lead = await call<Lead & { source: string }>(t.app, "GET", `/workspaces/${ws}/leads/${due.body.data.leads[0]!.id}`, {
      token: owner,
    });
    expect(lead.body.data).toMatchObject({ name: "Pooja Sharma", source: "enquiry_form", followUpState: "today" });
    expect(lead.body.data.activities.map((a) => a.kind)).toEqual(["note", "follow_up_set", "created"]);

    await call(t.app, "PATCH", `/workspaces/${ws}/lead-form`, { token: owner, body: { enabled: false } });
    expect((await call(t.app, "GET", `/public/forms/${slug}`)).status).toBe(404);
  });
});

describe("tenant isolation for sales", () => {
  it("keeps one business's leads, clients and replies away from another", async () => {
    const a = await team("988");
    const b = await team("989");
    const lead = await call<Lead>(t.app, "POST", `/workspaces/${a.ws}/leads`, { token: a.owner, body: { name: "Private Lead" } });
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${a.ws}/clients`, { token: a.owner, body: { name: "Private Client" } });
    const template = await call<{ id: string }>(t.app, "POST", `/workspaces/${a.ws}/whatsapp-templates`, {
      token: a.owner,
      body: { title: "Private reply", body: "Only for business A" },
    });

    const attempts = [
      call(t.app, "GET", `/workspaces/${a.ws}/leads`, { token: b.owner }),
      call(t.app, "GET", `/workspaces/${b.ws}/leads/${lead.body.data.id}`, { token: b.owner }),
      call(t.app, "PATCH", `/workspaces/${b.ws}/leads/${lead.body.data.id}`, { token: b.owner, body: { name: "Hacked Name" } }),
      call(t.app, "POST", `/workspaces/${b.ws}/leads/${lead.body.data.id}/activities`, { token: b.owner, body: { kind: "call" } }),
      call(t.app, "GET", `/workspaces/${b.ws}/clients/${client.body.data.id}`, { token: b.owner }),
      call(t.app, "PATCH", `/workspaces/${b.ws}/clients/${client.body.data.id}`, { token: b.owner, body: { name: "Hacked Name" } }),
      call(t.app, "PATCH", `/workspaces/${b.ws}/whatsapp-templates/${template.body.data.id}`, { token: b.owner, body: { title: "Hacked" } }),
      call(t.app, "DELETE", `/workspaces/${b.ws}/whatsapp-templates/${template.body.data.id}`, { token: b.owner }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

    // B can't move A's lead into one of B's stages either.
    const moved = await call(t.app, "PATCH", `/workspaces/${a.ws}/leads/${lead.body.data.id}`, {
      token: a.owner,
      body: { stageId: b.stages[1]!.id },
    });
    expect(moved.status).toBe(400);

    const still = await call<Lead>(t.app, "GET", `/workspaces/${a.ws}/leads/${lead.body.data.id}`, { token: a.owner });
    expect(still.body.data.name).toBe("Private Lead");
    const bList = await call<List>(t.app, "GET", `/workspaces/${b.ws}/leads`, { token: b.owner });
    expect(bList.body.data.leads).toHaveLength(0);
  });
});
