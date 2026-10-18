import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type ExportFile = { filename: string; contentType: string; data: string; rows: number };

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.query(`DELETE FROM lead_form_submissions`);
});

/** The files inside a zip, read from its central directory. */
function unzip(buf: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const dataAt = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    files.set(name, inflateRawSync(buf.subarray(dataAt, dataAt + size)).toString("utf8"));
    at += 46 + nameLen;
  }
  return files;
}

const download = (token: string, ws: string, query: string) => call<ExportFile>(t.app, "GET", `/workspaces/${ws}/leads/export?${query}`, { token });

describe("leads as a spreadsheet", () => {
  it("downloads one partner's enquiries as Excel, and the form's as CSV", async () => {
    const owner = await signIn(t.app, "9310000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Export Studio");
    const { slug } = (await call<{ slug: string }>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner })).body.data;
    const partner = (await call<{ id: string; code: string }>(t.app, "POST", `/workspaces/${ws}/partners`, { token: owner, body: { name: "Riya Boutique" } })).body.data;

    const enquire = (body: object) => call(t.app, "POST", `/public/forms/${slug}`, { body });
    expect((await enquire({ name: "Meera Joshi", phone: "9810000001", eventType: "wedding", eventDate: "2027-02-14", city: "Jaipur", message: "Photos & <decor>", p: partner.code })).status).toBe(201);
    expect((await enquire({ name: "Anil Rao", phone: "9810000002", p: partner.code })).status).toBe(201);
    expect((await enquire({ name: "=HYPERLINK(1)", phone: "9810000003" })).status).toBe(201);

    const xlsx = await download(owner, ws, `partnerId=${partner.id}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.body.data).toMatchObject({ rows: 2, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(xlsx.body.data.filename).toMatch(/^export-studio-leads-riya-boutique-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const files = unzip(Buffer.from(xlsx.body.data.data, "base64"));
    expect([...files.keys()]).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]));
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Meera Joshi");
    expect(sheet).toContain("Anil Rao");
    expect(sheet).toContain("Photos &amp; &lt;decor&gt;");
    expect(sheet).toContain("9810000001");
    expect(sheet).toContain("14-02-2027");
    expect(sheet).toContain("Riya Boutique");
    expect(sheet).not.toContain("HYPERLINK");

    const csv = await download(owner, ws, "source=enquiry_form&format=csv");
    expect(csv.body.data.rows).toBe(1);
    expect(csv.body.data.filename).toMatch(/\.csv$/);
    const text = Buffer.from(csv.body.data.data, "base64").toString("utf8");
    expect(text.startsWith("﻿Enquired on,Name,Mobile")).toBe(true);
    // A name that looks like a formula can't run in Excel.
    expect(text).toContain("'=HYPERLINK(1)");

    expect((await download(owner, ws, "")).body.data.rows).toBe(3);
    expect((await download(owner, ws, "format=pdf")).status).toBe(400);
  });

  it("follows who sees which leads", async () => {
    const owner = await signIn(t.app, "9320000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Scope Studio");
    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Owner Lead", phone: "9820000009" } });
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Arfin Khan", phone: "9320000002", role: "staff", department: "sales" },
    });
    const staff = await signIn(t.app, "9320000002", "Arfin Khan");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: staff, body: { name: "Staff Lead", phone: "9820000010" } });

    const mine = await download(staff, ws, "format=csv");
    expect(mine.body.data.rows).toBe(1);
    expect(Buffer.from(mine.body.data.data, "base64").toString("utf8")).toContain("Staff Lead");

    const inv2 = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Ravi Accounts", phone: "9320000003", role: "staff", department: "accountant" },
    });
    const accounts = await signIn(t.app, "9320000003", "Ravi Accounts");
    await call(t.app, "POST", `/invitations/${inv2.body.data.token}/accept`, { token: accounts });
    expect((await download(accounts, ws, "")).status).toBe(403);
  });
});
