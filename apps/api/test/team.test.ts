import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Team = {
  members: { id: string; role: string; isYou: boolean; name: string }[];
  invitations: { id: string; phone: string }[];
};

describe("team and invitations", () => {
  it("invites by phone, and only that phone can join", async () => {
    const owner = await signIn(t.app, "9833333333", "Owner");
    const ws = await createBusiness(t.app, owner);

    const invite = await call<{ token: string; invitation: { id: string } }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Pooja", phone: "9844444444", role: "staff" },
    });
    expect(invite.status).toBe(201);
    const inviteToken = invite.body.data.token;

    const preview = await call<{ workspaceName: string; phoneMasked: string; status: string }>(
      t.app,
      "GET",
      `/invitations/${inviteToken}`,
    );
    expect(preview.body.data).toMatchObject({ workspaceName: "Riya Makeup Studio", status: "pending" });
    expect(preview.body.data.phoneMasked).toBe("+91 ••••• •4444");

    const stranger = await signIn(t.app, "9855555555");
    const wrongPhone = await call(t.app, "POST", `/invitations/${inviteToken}/accept`, { token: stranger });
    expect(wrongPhone.status).toBe(403);

    const pooja = await signIn(t.app, "9844444444");
    const accepted = await call<{ workspaceId: string }>(t.app, "POST", `/invitations/${inviteToken}/accept`, {
      token: pooja,
    });
    expect(accepted.body.data.workspaceId).toBe(ws);

    const again = await call(t.app, "POST", `/invitations/${inviteToken}/accept`, { token: pooja });
    expect(again.status).toBe(410);

    const me = await call<{ user: { name: string }; workspaces: { role: string }[] }>(t.app, "GET", "/auth/me", {
      token: pooja,
    });
    expect(me.body.data.user.name).toBe("Pooja");
    expect(me.body.data.workspaces[0]?.role).toBe("staff");

    const team = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    expect(team.body.data.members.map((m) => m.role)).toEqual(["owner", "staff"]);
    expect(team.body.data.invitations).toEqual([]);

    // Staff can see the team but not invitations, and can't invite.
    const staffView = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: pooja });
    expect(staffView.status).toBe(200);
    const staffInvite = await call(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: pooja,
      body: { name: "X Y", phone: "9866666666", role: "staff" },
    });
    expect(staffInvite.status).toBe(403);
    const staffEdit = await call(t.app, "PATCH", `/workspaces/${ws}`, { token: pooja, body: { city: "Delhi" } });
    expect(staffEdit.status).toBe(403);
  });

  it("enforces role rules", async () => {
    const owner = await signIn(t.app, "9877777777", "Owner Two");
    const ws = await createBusiness(t.app, owner, "Two Studio");

    const ownerInvite = await call(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Second Owner", phone: "9888888888", role: "owner" },
    });
    expect(ownerInvite.status).toBe(403);

    const selfInvite = await call(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Me Again", phone: "9877777777", role: "staff" },
    });
    expect(selfInvite.status).toBe(409);

    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Manager Mona", phone: "9888888888", role: "manager" },
    });
    const mona = await signIn(t.app, "9888888888");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: mona });

    const team = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    const ownerMember = team.body.data.members.find((m) => m.role === "owner")!;
    const monaMember = team.body.data.members.find((m) => m.role === "manager")!;

    // A manager can't invite another manager, change the owner, or promote anyone to manager.
    const mgrInvite = await call(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: mona,
      body: { name: "Other Manager", phone: "9899999999", role: "manager" },
    });
    expect(mgrInvite.status).toBe(403);
    const touchOwner = await call(t.app, "DELETE", `/workspaces/${ws}/members/${ownerMember.id}`, { token: mona });
    expect(touchOwner.status).toBe(403);
    const selfChange = await call(t.app, "PATCH", `/workspaces/${ws}/members/${monaMember.id}`, {
      token: mona,
      body: { role: "staff" },
    });
    expect(selfChange.status).toBe(403);

    // The owner can change and remove the manager.
    const demote = await call(t.app, "PATCH", `/workspaces/${ws}/members/${monaMember.id}`, {
      token: owner,
      body: { role: "accountant" },
    });
    expect(demote.status).toBe(200);
    const remove = await call(t.app, "DELETE", `/workspaces/${ws}/members/${monaMember.id}`, { token: owner });
    expect(remove.status).toBe(200);
    const gone = await call(t.app, "GET", `/workspaces/${ws}`, { token: mona });
    expect(gone.status).toBe(404);
  });

  it("replaces an earlier invite to the same number and lets it be cancelled", async () => {
    const owner = await signIn(t.app, "9811112222", "Owner Three");
    const ws = await createBusiness(t.app, owner, "Three Studio");
    const first = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Ravi Kumar", phone: "9811113333", role: "freelancer" },
    });
    const second = await call<{ token: string; invitation: { id: string } }>(
      t.app,
      "POST",
      `/workspaces/${ws}/invitations`,
      { token: owner, body: { name: "Ravi Kumar", phone: "9811113333", role: "staff" } },
    );
    const oldPreview = await call<{ status: string }>(t.app, "GET", `/invitations/${first.body.data.token}`);
    expect(oldPreview.body.data.status).toBe("revoked");

    const team = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    expect(team.body.data.invitations).toHaveLength(1);

    const revoke = await call(t.app, "DELETE", `/workspaces/${ws}/invitations/${second.body.data.invitation.id}`, {
      token: owner,
    });
    expect(revoke.status).toBe(200);
    const badId = await call(t.app, "DELETE", `/workspaces/${ws}/invitations/not-an-id`, { token: owner });
    expect(badId.status).toBe(404);
  });
});
