import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Field = { id: string; entity: string; label: string; kind: string; options: string[] };
type WithCustom = { id: string; custom: Record<string, unknown> };

describe("custom fields", () => {
  it("lets a business add its own details to enquiries, clients and events", async () => {
    const owner = await signIn(t.app, "9780000001", "Riya Owner");
    const ws = await createBusiness(t.app, owner, "Riya Makeup Studio");
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: "Aman", phone: "9780000002", role: "staff" } });
    const staff = await signIn(t.app, "9780000002", "Aman");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });

    // Nothing to start with; only owners and managers change the list.
    expect((await call<Field[]>(t.app, "GET", `/workspaces/${ws}/custom-fields`, { token: staff })).body.data).toEqual([]);
    const leadFields = {
      entity: "lead",
      fields: [
        { label: "Skin type", kind: "choice", options: ["Dry", "Oily", "Normal"] },
        { label: "Trial wanted", kind: "yes_no" },
        { label: "Trial date", kind: "date" },
      ],
    };
    expect((await call(t.app, "PUT", `/workspaces/${ws}/custom-fields`, { token: staff, body: leadFields })).status).toBe(403);
    expect((await call(t.app, "PUT", `/workspaces/${ws}/custom-fields`, { token: owner, body: { entity: "lead", fields: [{ label: "Skin", kind: "choice", options: ["Dry"] }] } })).status).toBe(400);
    const saved = await call<Field[]>(t.app, "PUT", `/workspaces/${ws}/custom-fields`, { token: owner, body: leadFields });
    expect(saved.status).toBe(200);
    expect(saved.body.data.map((f) => f.label)).toEqual(["Skin type", "Trial wanted", "Trial date"]);
    const [skin, trial, trialDate] = saved.body.data as [Field, Field, Field];
    const [people] = (
      await call<Field[]>(t.app, "PUT", `/workspaces/${ws}/custom-fields`, { token: owner, body: { entity: "event", fields: [{ label: "People getting ready", kind: "number" }] } })
    ).body.data as [Field];

    // Filled on an enquiry; bad values are named per field.
    const bad = await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Neha Kapoor", custom: { [skin.id]: "Shiny", [people.id]: 4 } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields).toMatchObject({ [`custom.${skin.id}`]: "Pick one from the list", [`custom.${people.id}`]: "This field no longer exists" });
    const lead = await call<WithCustom>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Neha Kapoor", custom: { [skin.id]: "Oily", [trial.id]: "true", [trialDate.id]: "" } },
    });
    expect(lead.status).toBe(201);
    expect(lead.body.data.custom).toEqual({ [skin.id]: "Oily", [trial.id]: true });

    // Editing merges: a value left out stays, a blank one clears.
    const edited = await call<WithCustom>(t.app, "PATCH", `/workspaces/${ws}/leads/${lead.body.data.id}`, {
      token: owner,
      body: { custom: { [trial.id]: "", [trialDate.id]: "2026-10-20" } },
    });
    expect(edited.body.data.custom).toEqual({ [skin.id]: "Oily", [trialDate.id]: "2026-10-20" });

    // Removing a field hides it from the list; its old value can't be written again.
    await call(t.app, "PUT", `/workspaces/${ws}/custom-fields`, {
      token: owner,
      body: { entity: "lead", fields: [{ id: trialDate.id, label: "Trial on", kind: "date" }, { id: skin.id, label: "Skin type", kind: "choice", options: ["Dry", "Oily", "Normal"] }] },
    });
    const now = (await call<Field[]>(t.app, "GET", `/workspaces/${ws}/custom-fields`, { token: staff })).body.data;
    expect(now.map((f) => [f.entity, f.label])).toEqual([
      ["lead", "Trial on"],
      ["lead", "Skin type"],
      ["event", "People getting ready"],
    ]);
    expect(now.find((f) => f.label === "Trial on")!.id).toBe(trialDate.id);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/leads/${lead.body.data.id}`, { token: owner, body: { custom: { [trial.id]: "true" } } })).status).toBe(400);

    // Clients and events too.
    const [allergy] = (
      await call<Field[]>(t.app, "PUT", `/workspaces/${ws}/custom-fields`, { token: owner, body: { entity: "client", fields: [{ label: "Allergies", kind: "text" }] } })
    ).body.data as [Field];
    const client = await call<WithCustom>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Kapoor Family", custom: { [allergy.id]: "  Nuts " } } });
    expect(client.body.data.custom).toEqual({ [allergy.id]: "Nuts" });
    const event = await call<WithCustom>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { clientId: client.body.data.id, title: "Kapoor wedding", functions: [{ name: "Wedding", date: "2026-12-10" }], custom: { [people.id]: "6" } },
    });
    expect(event.status).toBe(201);
    expect(event.body.data.custom).toEqual({ [people.id]: 6 });
    const wrong = await call(t.app, "PATCH", `/workspaces/${ws}/events/${event.body.data.id}`, { token: owner, body: { custom: { [people.id]: "six" } } });
    expect(wrong.body.error.fields).toEqual({ [`custom.${people.id}`]: "Enter a number" });

    // Another business can't use these fields.
    const other = await signIn(t.app, "9780000003", "Other Owner");
    const ws2 = await createBusiness(t.app, other, "Other Studio");
    expect((await call<Field[]>(t.app, "GET", `/workspaces/${ws2}/custom-fields`, { token: other })).body.data).toEqual([]);
    expect((await call(t.app, "POST", `/workspaces/${ws2}/leads`, { token: other, body: { name: "Some One", custom: { [skin.id]: "Oily" } } })).status).toBe(400);
    expect(
      (await call(t.app, "PUT", `/workspaces/${ws2}/custom-fields`, { token: other, body: { entity: "lead", fields: [{ id: skin.id, label: "Taken over", kind: "text" }] } })).body.data,
    ).toEqual([expect.objectContaining({ label: "Taken over" })]);
    const mine = (await call<Field[]>(t.app, "GET", `/workspaces/${ws}/custom-fields`, { token: owner })).body.data;
    expect(mine.find((f) => f.id === skin.id)!.label).toBe("Skin type");
  });
});
