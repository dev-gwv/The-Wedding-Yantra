import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

async function download(workspaceId: string, token: string) {
  return t.app.inject({ method: "GET", url: `/api/v1/workspaces/${workspaceId}/export`, headers: { authorization: `Bearer ${token}` } });
}

describe("download all my data", () => {
  it("gives the owner a file of the business's own records, without secrets", async () => {
    const owner = await signIn(t.app, "9711100001", "Riya");
    const ws = await createBusiness(t.app, owner, "Riya Makeup Studio");
    const other = await signIn(t.app, "9711100002", "Other");
    const otherWs = await createBusiness(t.app, other, "Other Decor");

    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Neha Kapoor", phone: "9822211111" } });
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Sharma Family", phone: "9822222222" } });
    expect(client.status).toBe(201);
    // A portal link for the client: its token must never be in the file.
    const shared = await call(t.app, "POST", `/workspaces/${ws}/clients/${client.body.data.id}/portal`, { token: owner });
    expect(shared.status).toBe(200);
    await call(t.app, "POST", `/workspaces/${otherWs}/leads`, { token: other, body: { name: "Secret Lead Elsewhere", phone: "9833333333" } });
    await call(t.app, "POST", `/workspaces/${otherWs}/clients`, { token: other, body: { name: "Elsewhere Client", phone: "9844444444" } });

    const res = await download(ws, owner);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="wedding-yantra-riya-makeup-studio-${today}.json"`);

    const file = res.json() as Record<string, unknown> & {
      workspace: { id: string; name: string };
      members: { name: string; phone: string; role: string }[];
      leads: { name: string; workspace_id: string }[];
      clients: { name: string; workspace_id: string }[];
    };
    expect(file.format).toBe("wedding-yantra-export");
    expect(file.workspace).toMatchObject({ id: ws, name: "Riya Makeup Studio" });
    expect(file.members).toEqual([expect.objectContaining({ name: "Riya", phone: "+919711100001", role: "owner" })]);
    expect(file.leads.map((l) => l.name)).toEqual(["Neha Kapoor"]);
    expect(file.clients.map((c) => c.name)).toContain("Sharma Family");
    for (const key of ["events", "quotes", "quoteItems", "bills", "billItems", "payments", "expenses", "vendors", "payouts", "tasks", "venues", "services", "packages"]) {
      expect(Array.isArray(file[key]), key).toBe(true);
    }
    // Services and stages come ready for the trade, so the file isn't just empty lists.
    expect((file.services as unknown[]).length).toBeGreaterThan(0);

    // Nothing from the other business.
    const text = res.body;
    expect(text).not.toContain("Secret Lead Elsewhere");
    expect(text).not.toContain("Elsewhere Client");
    expect(text).not.toContain(otherWs);
    for (const rows of Object.values(file)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows as Record<string, unknown>[]) if ("workspace_id" in row) expect(row.workspace_id).toBe(ws);
    }

    // No tokens, links or hashes.
    const portal = await t.db.query<{ portal_token: string }>(`SELECT portal_token FROM clients WHERE id = $1`, [client.body.data.id]);
    expect(portal.rows[0]!.portal_token).toBeTruthy();
    expect(text).not.toContain(portal.rows[0]!.portal_token);
    expect(text).not.toMatch(/"[a-z_]*(token|hash)[a-z_]*":/);
  });

  it("includes the lead forms that came from ads, but never a deleted lead's answers or a token", async () => {
    const owner = await signIn(t.app, "9711100021", "Riya");
    const ws = await createBusiness(t.app, owner, "Ads Studio");
    const other = await signIn(t.app, "9711100022", "Other");
    const otherWs = await createBusiness(t.app, other, "Other Ads");
    const kept = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Kept Lead", phone: "9822233331" } });
    const gone = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Gone Lead", phone: "9822233332" } });
    const claim = "6f1c1d7e-1111-4222-8333-944455556666";
    const answers = (text: string) => JSON.stringify([{ name: "full_name", values: [text] }]);
    const insert = (workspaceId: string, externalId: string, leadId: string | null, name: string, campaign: string) =>
      t.db.query(
        `INSERT INTO incoming_leads (workspace_id, external_id, received_via, status, lead_id, name, campaign_name, answers, claim_token)
         VALUES ($1, $2, 'webhook', 'added', $3, $4, $5, $6, $7)`,
        [workspaceId, externalId, leadId, name, campaign, answers(name), claim],
      );
    await insert(ws, "800001", kept.body.data.id, "Answer Kept Here", "Kept campaign");
    await insert(ws, "800002", gone.body.data.id, "Answer Of Deleted Lead", "Deleted campaign");
    await insert(otherWs, "800003", null, "Answer Elsewhere", "Elsewhere campaign");

    expect((await call(t.app, "DELETE", `/workspaces/${ws}/leads/${gone.body.data.id}`, { token: owner })).status).toBe(200);
    // Deleting the lead wiped what its lead form said; only the id that stops a re-import stays.
    const scrubbed = await t.db.query(`SELECT external_id, answers, name, campaign_name FROM incoming_leads WHERE lead_id = $1`, [gone.body.data.id]);
    expect(scrubbed.rows).toEqual([{ external_id: "800002", answers: [], name: null, campaign_name: null }]);

    const res = await download(ws, owner);
    expect(res.statusCode).toBe(200);
    const file = res.json() as { incomingLeads: Record<string, unknown>[] };
    expect(file.incomingLeads).toEqual([
      expect.objectContaining({ external_id: "800001", lead_id: kept.body.data.id, name: "Answer Kept Here", campaign_name: "Kept campaign" }),
    ]);
    expect(file.incomingLeads[0]).not.toHaveProperty("claim_token");
    expect(res.body).toContain("Answer Kept Here");
    for (const hidden of ["Answer Of Deleted Lead", "Deleted campaign", "Answer Elsewhere", claim]) expect(res.body).not.toContain(hidden);
    expect(res.body).not.toMatch(/"[a-z_]*(token|hash)[a-z_]*":/);
  });

  it("is for the owner only, and outsiders can't tell the business exists", async () => {
    const owner = await signIn(t.app, "9711100011", "Owner");
    const ws = await createBusiness(t.app, owner, "Owner Studio");
    const invite = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Manny", phone: "9711100012", role: "manager" },
    });
    const manager = await signIn(t.app, "9711100012", "Manny");
    const joined = await call(t.app, "POST", `/invitations/${invite.body.data.token}/accept`, { token: manager });
    expect(joined.status).toBe(200);

    const asManager = await download(ws, manager);
    expect(asManager.statusCode).toBe(403);
    expect(asManager.json()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });

    const stranger = await signIn(t.app, "9711100013", "Stranger");
    expect((await download(ws, stranger)).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/workspaces/${ws}/export` })).statusCode).toBe(401);
  });
});
