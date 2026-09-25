import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

/**
 * The most important guarantee of a SaaS: one business can never see or touch another
 * business's data, even by guessing IDs.
 */
describe("tenant isolation", () => {
  it("keeps two businesses completely apart", async () => {
    const alice = await signIn(t.app, "9700000001", "Alice");
    const bob = await signIn(t.app, "9700000002", "Bob");
    const aliceWs = await createBusiness(t.app, alice, "Alice Decor");
    const bobWs = await createBusiness(t.app, bob, "Bob Sounds");

    const aliceInvite = await call<{ invitation: { id: string } }>(t.app, "POST", `/workspaces/${aliceWs}/invitations`, {
      token: alice,
      body: { name: "Helper One", phone: "9700000003", role: "staff" },
    });
    const aliceTeam = await call<{ members: { id: string }[] }>(t.app, "GET", `/workspaces/${aliceWs}/team`, {
      token: alice,
    });
    const aliceOwnerMemberId = aliceTeam.body.data.members[0]!.id;

    // Bob reads and writes against Alice's business: always "not found".
    const attempts = [
      call(t.app, "GET", `/workspaces/${aliceWs}`, { token: bob }),
      call(t.app, "GET", `/workspaces/${aliceWs}/home`, { token: bob }),
      call(t.app, "GET", `/workspaces/${aliceWs}/team`, { token: bob }),
      call(t.app, "PATCH", `/workspaces/${aliceWs}`, { token: bob, body: { city: "Hacked" } }),
      call(t.app, "POST", `/workspaces/${aliceWs}/invitations`, {
        token: bob,
        body: { name: "Spy Person", phone: "9700000009", role: "staff" },
      }),
      call(t.app, "DELETE", `/workspaces/${aliceWs}/members/${aliceOwnerMemberId}`, { token: bob }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

    // Bob uses his own business in the URL with Alice's IDs: still "not found".
    const crossRevoke = await call(
      t.app,
      "DELETE",
      `/workspaces/${bobWs}/invitations/${aliceInvite.body.data.invitation.id}`,
      { token: bob },
    );
    expect(crossRevoke.status).toBe(404);
    const crossMember = await call(t.app, "PATCH", `/workspaces/${bobWs}/members/${aliceOwnerMemberId}`, {
      token: bob,
      body: { role: "staff" },
    });
    expect(crossMember.status).toBe(404);

    // Alice's data is untouched.
    const check = await call<{ city: string }>(t.app, "GET", `/workspaces/${aliceWs}`, { token: alice });
    expect(check.body.data.city).toBe("Jaipur");
    const team = await call<{ invitations: unknown[] }>(t.app, "GET", `/workspaces/${aliceWs}/team`, { token: alice });
    expect(team.body.data.invitations).toHaveLength(1);

    // Each person only sees their own business.
    const bobMe = await call<{ workspaces: { id: string }[] }>(t.app, "GET", "/auth/me", { token: bob });
    expect(bobMe.body.data.workspaces.map((w) => w.id)).toEqual([bobWs]);
  });
});
