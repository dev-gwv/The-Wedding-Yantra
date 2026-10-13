// "Add an event and run it": Events and the calendar, a new event with three functions, then the
// event page: the team, the checklist, what's handed to the client, and money received.

/** Dates as the business sees them (India), n days from today: "YYYY-MM-DD". */
const day = (n) => new Date(Date.now() + 5.5 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
const BUSY = 9; // days out: two events on one day, a red dot in the calendar
const WEDDING = 52; // days out: the new event's wedding day

/** A wedding planner with two on the team, a few clients, a saved venue and some events booked. */
export async function setup({ api, signIn, tail }) {
  const owner = await signIn(`+91987696${tail}`, "Riya Kapoor");
  const ws = (await api("POST", "/workspaces", { name: "Shubh Vivah Weddings", businessTypeId: "wedding_planner", city: "Jaipur" }, owner)).id;
  const at = (p) => `/workspaces/${ws}${p}`;
  await api("PATCH", at(""), { phone: "9876500000", address: "C-Scheme, Jaipur", pricesConfirmed: true }, owner);
  for (const [i, name] of ["Kabir Mehta", "Neha Joshi"].entries()) {
    const phone = `98668${tail}${i}`;
    const inv = await api("POST", at("/invitations"), { name, phone, role: "staff" }, owner);
    const t = await signIn(`+91${phone}`, name);
    await api("POST", `/invitations/${inv.token}/accept`, undefined, t);
  }
  await api("POST", at("/venues"), {
    name: "Rambagh Palace",
    venueType: "palace",
    address: "Bhawani Singh Rd, Jaipur",
    city: "Jaipur",
    mapsUrl: "https://maps.google.com/?q=Rambagh+Palace+Jaipur",
    contactPerson: "Vikram Singh",
    phone: "9829000000",
    musicCutoff: "22:00",
    loadIn: "Service gate 2, from 10 am",
  }, owner);
  await api("POST", at("/clients"), { name: "Ananya Sharma", phone: "9812345670", city: "Jaipur", relation: "bride" }, owner);
  const booked = [
    ["Kapoor family", "9811100001", "Kapoor wedding", "wedding", [["Haldi", BUSY - 1, "10:00"], ["Wedding", BUSY, "19:00"]]],
    ["Verma family", "9811100002", "Verma engagement", "engagement", [["Sagai / Engagement", BUSY, "12:00"]]],
    ["Mehta family", "9811100003", "Mehta reception", "reception", [["Reception", BUSY + 34, "19:30"]]],
  ];
  for (const [client, phone, title, eventType, functions] of booked) {
    await api("POST", at("/events"), {
      newClient: { name: client, phone },
      title,
      eventType,
      city: "Jaipur",
      functions: functions.map(([name, d, startTime]) => ({ name, date: day(d), startTime })),
    }, owner);
  }
  return { token: owner, workspace: ws };
}

export async function run(k) {
  const { page, BASE, wait } = k;
  const dialog = page.getByRole("dialog");

  // ---- Title, over the Events page ------------------------------------------------------------
  await page.goto(`${BASE}/app/events`);
  await page.getByRole("link", { name: "New event" }).waitFor({ timeout: 20000 });
  await k.title("Add an event and run it", "Step by step · from booking to the big day", "Wedding Yantra · How to");
  await k.start("01-title");
  await k.say("01-title");
  await k.hold("01-title");
  await k.clear();

  // ---- Events, month by month ------------------------------------------------------------------
  await wait(300);
  k.mark("02-events");
  await k.say("02-events");
  await k.ring(page.getByRole("tab", { name: "Upcoming" }));
  await k.hold("02-events");

  // ---- The calendar: a red-dot day -----------------------------------------------------------------
  k.mark("03-calendar");
  await k.say("03-calendar");
  await k.press(page.getByRole("tab", { name: "Calendar" }), 900);
  const busy = page.getByRole("button", { name: /, 2 booked$/ });
  if (day(BUSY).slice(0, 7) !== day(0).slice(0, 7)) await page.getByRole("button", { name: "Next month" }).click();
  await busy.waitFor({ timeout: 20000 });
  await busy.evaluate((el) => el.scrollIntoView({ block: "center" })); // clear of the caption
  await k.cue("03-calendar", 1);
  // Today starts picked, and a picked day's dots turn white: ring it while it's red, tap it last.
  await k.ring(busy);
  await k.tap(busy, "03-calendar", 1200);
  await wait(500);
  await page.evaluate(() => window.scrollBy({ top: 260 })); // that day's bookings, under the month
  await wait(1400);

  // ---- Accepted quotes make events by themselves ------------------------------------------------
  await page.getByRole("tab", { name: "Upcoming" }).click();
  await wait(400);
  k.mark("04-quotes");
  await k.say("04-quotes");
  await k.hold("04-quotes");

  // ---- 1. New event -----------------------------------------------------------------------------
  k.mark("05-new");
  await k.say("05-new", "1");
  await k.tap(page.getByRole("link", { name: "New event" }), "05-new", 1200);

  // ---- 2. The client ----------------------------------------------------------------------------
  const find = page.getByRole("combobox", { name: "Find a client" });
  await find.waitFor({ timeout: 20000 });
  await wait(300);
  k.mark("06-client");
  await k.say("06-client", "2");
  await k.ring(find);
  await k.type(find, "Ananya");
  await k.press(page.getByRole("option", { name: /^Ananya Sharma/ }), 800);
  await k.cue("06-client", 1);
  await k.ring(page.getByRole("button", { name: "New", exact: true })); // shown, not tapped
  await k.hold("06-client");
  await k.unring();

  // ---- 3. Name, type, value, venue -------------------------------------------------------------------
  k.mark("07-details");
  await k.say("07-details", "3");
  const name = page.getByLabel("Event name");
  await k.ring(name);
  await k.type(name, "Ananya & Rohan wedding");
  const type = page.getByLabel("Type", { exact: true });
  await k.ring(type);
  await wait(500);
  await type.selectOption("wedding");
  await wait(500);
  const value = page.getByLabel("Booking value (₹)");
  await k.cue("07-details", 1);
  await k.ring(value);
  await k.type(value, "600000");
  const venue = page.getByLabel("Main venue");
  await k.ring(venue);
  await k.type(venue, "Rambagh Palace");
  await page.keyboard.press("Escape");
  await k.type(page.getByLabel("City", { exact: true }), "Jaipur");
  await k.unring();
  await k.hold("07-details");

  // ---- 4. The functions, each with its date and time ------------------------------------------------
  k.mark("08-functions");
  await k.say("08-functions", "4");
  async function fn(i, option, date, time) {
    const box = page.getByRole("combobox", { name: `Function ${i + 1}` });
    // Mid-screen, so its list opens clear of the caption.
    await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await wait(450);
    if (i === 0) await k.ring(box, "Tap here"); // a new row opens its list by itself
    // A few letters bring it to the top of the list, clear of the caption.
    await k.type(box, option.slice(0, 3));
    await wait(300);
    // Its own list: the Type dropdown's options (Mehendi, Sangeet…) have the same names.
    const list = page.locator(`[id="${await box.getAttribute("aria-controls")}"]`);
    await k.press(list.getByRole("option", { name: option, exact: true }), 700);
    await page.getByLabel("Date", { exact: true }).nth(i).fill(date);
    await wait(350);
    await page.getByLabel("Time", { exact: true }).nth(i).fill(time);
    await wait(450);
  }
  const addFunction = page.getByRole("button", { name: /Add a function/ });
  await fn(0, "Mehendi", day(WEDDING - 2), "16:00");
  await k.press(addFunction, 700);
  await fn(1, "Sangeet", day(WEDDING - 1), "19:00");
  await k.press(addFunction, 700);
  await fn(2, "Wedding", day(WEDDING), "18:30");
  await k.hold("08-functions");

  // ---- 5. Create event ------------------------------------------------------------------------------
  k.mark("09-create");
  await k.say("09-create", "5");
  await k.tap(page.getByRole("button", { name: "Create event" }), "09-create", 1200);
  await page.waitForURL(/\/app\/events\/[0-9a-f-]{36}$/, { timeout: 20000 });

  // ---- The event page ---------------------------------------------------------------------------------
  await page.getByRole("heading", { name: "Ananya & Rohan wedding" }).waitFor({ timeout: 20000 });
  await wait(600);
  k.mark("10-event");
  await k.say("10-event");
  await k.ring(page.getByRole("heading", { name: "Functions" }));
  await wait(1800);
  await page.getByRole("heading", { name: /^Venue/ }).first().scrollIntoViewIfNeeded();
  await k.unring();
  await k.hold("10-event");

  // ---- 6. The team ------------------------------------------------------------------------------------
  k.mark("11-team");
  await k.say("11-team", "6");
  await k.press(page.getByRole("button", { name: "Choose the team" }), 900);
  await dialog.waitFor();
  await k.cue("11-team", 1);
  for (const [who, role, reach] of [["Kabir Mehta", "Lead coordinator", "14:00"], ["Neha Joshi", "Guest desk", "15:30"]]) {
    await k.press(dialog.locator("label").filter({ hasText: who }).first(), 700);
    const roleField = page.getByLabel(`${who} role at this event`);
    await k.ring(roleField);
    await k.type(roleField, role);
    await page.getByLabel(`When ${who} should reach`).fill(reach);
    await wait(400);
  }
  await k.press(dialog.getByRole("button", { name: "Save team" }), 900);
  await dialog.waitFor({ state: "hidden" });
  await k.hold("11-team");

  // ---- Their role and time to reach -------------------------------------------------------------------
  const team = page.getByRole("heading", { name: "Team", exact: true });
  await team.scrollIntoViewIfNeeded();
  await wait(300);
  k.mark("12-their-day");
  await k.say("12-their-day", "6");
  await k.ring(page.getByText("Lead coordinator").first());
  await k.hold("12-their-day");
  await k.unring();

  // ---- 7. The checklist ---------------------------------------------------------------------------------
  k.mark("13-checklist");
  await k.say("13-checklist", "7");
  await k.press(page.getByRole("button", { name: /^Add \d+ steps$/ }), 1000);
  await page.getByRole("progressbar", { name: "Checklist progress" }).waitFor({ timeout: 20000 });
  await wait(400);
  await page.getByRole("heading", { name: "Checklist", exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await k.hold("13-checklist");

  // ---- 8. For the client ----------------------------------------------------------------------------------
  k.mark("14-client");
  await k.say("14-client", "8");
  await k.press(page.getByRole("button", { name: /Add a deliverable/ }), 900);
  await dialog.waitFor();
  await wait(400);
  await k.press(dialog.getByRole("button", { name: "Run sheet" }), 900);
  await wait(600);
  await k.press(dialog.getByRole("button", { name: "Add", exact: true }), 800);
  await dialog.waitFor({ state: "hidden" });
  await k.hold("14-client");

  // ---- 9. Money received -------------------------------------------------------------------------------------
  k.mark("15-money");
  await k.say("15-money", "9");
  await k.press(page.getByRole("button", { name: /Money received/ }), 900);
  await dialog.waitFor();
  await wait(400);
  const amount = dialog.getByLabel("Amount (₹)");
  await k.ring(amount);
  await k.type(amount, "200000");
  await k.ring(dialog.getByRole("button", { name: "UPI", exact: true })); // already chosen
  await wait(700);
  await k.press(dialog.getByRole("button", { name: /^Save .* received$/ }), 800);
  await k.press(dialog.getByRole("button", { name: "Done", exact: true }), 1000);
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Money", exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await wait(300);
  // What's paid and what's due, long enough to read.
  await k.ring(page.getByText("Received", { exact: true }).first());
  await wait(2200);
  await k.unring();
  await k.hold("15-money");

  // ---- 10. Edit, and Mark done after the event ---------------------------------------------------------------
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await wait(700);
  k.mark("16-edit");
  await k.say("16-edit", "10");
  await k.ring(page.getByRole("link", { name: "Edit dates and details" }));
  await k.cue("16-edit", 1);
  await k.ring(page.getByRole("button", { name: "Mark done" }));
  await k.hold("16-edit");
  await k.clear();

  // ---- End card -----------------------------------------------------------------------------------------------
  await k.title("Need help?", "Open More, then Help, to watch this again", "Wedding Yantra");
  k.mark("17-help");
  await k.say("17-help");
  await k.hold("17-help", 1500);
}
