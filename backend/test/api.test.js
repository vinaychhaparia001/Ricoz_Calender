"use strict";

const { test, before, after, beforeEach, describe } = require("node:test");
const assert = require("node:assert/strict");

const { openDatabase } = require("../src/db");
const { seedDatabase, resetDatabase } = require("../src/seed");
const { createApp } = require("../src/app");
const { startOfWeekStr, addDaysStr } = require("../src/lib/time");

let db, server, base;

const MONDAY = startOfWeekStr("2030-01-09"); // a fixed future week keeps tests deterministic
const TUESDAY = addDaysStr(MONDAY, 1);

async function call(method, path, { body, user } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(user ? { "X-User-Id": user } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const post = (p, body, user) => call("POST", p, { body, user });
const get = (p, user) => call("GET", p, { user });

before(async () => {
  db = openDatabase(":memory:");
  seedDatabase(db, { demoEvents: false });
  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });

beforeEach(() => {
  resetDatabase(db);
  seedDatabase(db, { demoEvents: false });
});

describe("reference data", () => {
  test("health, people and rooms", async () => {
    assert.equal((await get("/api/health")).body.status, "ok");
    assert.equal((await get("/api/people")).body.people.length, 5);
    const rooms = (await get("/api/rooms")).body.rooms;
    assert.deepEqual(rooms.map((r) => r.name), ["Falcon", "Orion", "Atlas", "Vega"]);
  });

  test("unknown user is rejected; default user is 'you'", async () => {
    assert.equal((await get("/api/me")).body.user.id, "you");
    const r = await get("/api/me", "nobody");
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, "unknown_user");
  });

  test("malformed JSON returns 400", async () => {
    const res = await fetch(base + "/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
    assert.equal(res.status, 400);
  });

  test("unknown endpoint returns JSON 404", async () => {
    const r = await get("/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, "not_found");
  });
});

describe("events", () => {
  test("create returns the frontend event shape, with organizer first in attendees", async () => {
    const r = await post("/api/events", { title: "Roadmap", date: MONDAY, start: "10:00", duration: 60, attendees: ["priya", "dev"] });
    assert.equal(r.status, 201);
    assert.deepEqual(
      { ...r.body.event, id: undefined },
      { id: undefined, title: "Roadmap", date: MONDAY, start: "10:00", end: "11:00", attendees: ["you", "priya", "dev"], room: null, organizer: "you" }
    );
    assert.deepEqual(r.body.warnings, []);
  });

  test("blank title falls back to 'Untitled meeting' like the frontend", async () => {
    const r = await post("/api/events", { date: MONDAY, start: "09:00", duration: 30 });
    assert.equal(r.body.event.title, "Untitled meeting");
  });

  test("validation errors", async () => {
    const bad = async (body, fragment) => {
      const r = await post("/api/events", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.body.error.message, fragment);
    };
    await bad({ date: "2030-13-40", start: "10:00", duration: 30 }, /date/);
    await bad({ date: MONDAY, start: "25:00", duration: 30 }, /start/);
    await bad({ date: MONDAY, start: "10:00", end: "09:00" }, /after/);
    await bad({ date: MONDAY, start: "10:00" }, /end.*duration/);
    await bad({ date: MONDAY, start: "23:30", duration: 60 }, /midnight/);
    await bad({ date: MONDAY, start: "10:00", duration: 30, attendees: ["ghost"] }, /Unknown attendee/);
    await bad({ date: MONDAY, start: "10:00", duration: 30, room: "r99" }, /Unknown room/);
    await bad({ date: MONDAY, start: "10:00", duration: 30, attendees: "priya" }, /array/);
  });

  test("list by date, by range, by person (incl. 'me'), and requires a filter", async () => {
    await post("/api/events", { title: "A", date: MONDAY, start: "09:00", duration: 30, attendees: ["priya"] });
    await post("/api/events", { title: "B", date: TUESDAY, start: "09:00", duration: 30 }, "priya"); // priya's own
    assert.equal((await get(`/api/events?date=${MONDAY}`)).body.events.length, 1);
    assert.equal((await get(`/api/events?from=${MONDAY}&to=${TUESDAY}`)).body.events.length, 2);
    assert.equal((await get(`/api/events?from=${MONDAY}&to=${TUESDAY}&person=priya`)).body.events.length, 2);
    // "my calendar" for the default user only has A
    const mine = (await get(`/api/events?from=${MONDAY}&to=${TUESDAY}&person=me`)).body.events;
    assert.deepEqual(mine.map((e) => e.title), ["A"]);
    assert.equal((await get("/api/events")).status, 400);
    assert.equal((await get(`/api/events?from=${MONDAY}`)).status, 400);
    assert.equal((await get("/api/events?from=2030-01-01&to=2031-06-01")).status, 400);
  });

  test("results are sorted by date then start time", async () => {
    await post("/api/events", { title: "late", date: MONDAY, start: "15:00", duration: 30 });
    await post("/api/events", { title: "early", date: MONDAY, start: "09:00", duration: 30 });
    const titles = (await get(`/api/events?date=${MONDAY}`)).body.events.map((e) => e.title);
    assert.deepEqual(titles, ["early", "late"]);
  });

  test("PATCH moves an event and preserves its length; DELETE removes it", async () => {
    const { event } = (await post("/api/events", { title: "Move me", date: MONDAY, start: "10:00", duration: 90 })).body;
    const r = await call("PATCH", `/api/events/${event.id}`, { body: { start: "13:00" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.event.start, "13:00");
    assert.equal(r.body.event.end, "14:30");
    assert.equal((await call("DELETE", `/api/events/${event.id}`)).status, 204);
    assert.equal((await get(`/api/events/${event.id}`)).status, 404);
  });

  test("attendee conflicts are reported as warnings, not errors", async () => {
    await post("/api/events", { title: "Existing", date: MONDAY, start: "10:00", duration: 60, attendees: ["priya"] });
    const r = await post("/api/events", { title: "Overlap", date: MONDAY, start: "10:30", duration: 30, attendees: ["priya"] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.warnings.map((w) => w.person).sort(), ["priya", "you"]);
  });
});

describe("room booking and conflicts", () => {
  test("availability flips to booked after booking, and double-booking returns 409", async () => {
    const q = `date=${MONDAY}&start=10:00&duration=60`;
    const before = (await get(`/api/rooms/availability?${q}`)).body.rooms;
    assert.ok(before.every((r) => r.free));

    const book = await post("/api/rooms/r1/book", { date: MONDAY, start: "10:00", duration: 60 });
    assert.equal(book.status, 201);
    assert.equal(book.body.event.title, "Room booking");
    assert.equal(book.body.event.room, "r1");
    assert.deepEqual(book.body.event.attendees, ["you"]);

    const after = (await get(`/api/rooms/availability?${q}`)).body.rooms;
    assert.equal(after.find((r) => r.id === "r1").free, false);
    assert.equal(after.find((r) => r.id === "r1").conflicts.length, 1);
    assert.equal(after.find((r) => r.id === "r2").free, true);

    const again = await post("/api/rooms/r1/book", { date: MONDAY, start: "10:30", duration: 30 }, "priya");
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, "conflict");
    assert.equal(again.body.error.details.conflicts.length, 1);
  });

  test("back-to-back bookings do not conflict (end == next start)", async () => {
    assert.equal((await post("/api/rooms/r3/book", { date: MONDAY, start: "10:00", duration: 30 })).status, 201);
    assert.equal((await post("/api/rooms/r3/book", { date: MONDAY, start: "10:30", duration: 30 })).status, 201);
    assert.equal((await post("/api/rooms/r3/book", { date: MONDAY, start: "09:30", duration: 30 })).status, 201);
  });

  test("different day, same time is fine; unknown room is 404", async () => {
    await post("/api/rooms/r2/book", { date: MONDAY, start: "10:00", duration: 60 });
    assert.equal((await post("/api/rooms/r2/book", { date: TUESDAY, start: "10:00", duration: 60 })).status, 201);
    assert.equal((await post("/api/rooms/r99/book", { date: MONDAY, start: "10:00", duration: 60 })).status, 404);
  });

  test("creating a meeting with a taken room is rejected, editing an event into a taken room too", async () => {
    await post("/api/rooms/r4/book", { date: MONDAY, start: "14:00", duration: 60 });
    const clash = await post("/api/events", { date: MONDAY, start: "14:30", duration: 30, room: "r4" });
    assert.equal(clash.status, 409);

    const { event } = (await post("/api/events", { date: MONDAY, start: "16:00", duration: 30, room: "r4" })).body;
    const moved = await call("PATCH", `/api/events/${event.id}`, { body: { start: "14:00" } });
    assert.equal(moved.status, 409);
    // an event never conflicts with itself
    const same = await call("PATCH", `/api/events/${event.id}`, { body: { title: "renamed" } });
    assert.equal(same.status, 200);
  });

  test("availability query validates its input", async () => {
    assert.equal((await get("/api/rooms/availability?date=bad&start=10:00")).status, 400);
    assert.equal((await get(`/api/rooms/availability?date=${MONDAY}&start=10am`)).status, 400);
    assert.equal((await get(`/api/rooms/availability?date=${MONDAY}&start=10:00&duration=0`)).status, 400);
  });
});

describe("scheduling assistant", () => {
  test("free slots skip anyone's busy time and always include the requesting user", async () => {
    await post("/api/events", { title: "Priya busy", date: MONDAY, start: "10:00", duration: 60 }, "priya");
    const r = await get(`/api/availability/free-slots?date=${MONDAY}&duration=30&attendees=priya`);
    assert.equal(r.status, 200);
    const starts = r.body.slots.map((s) => s.start);
    assert.deepEqual(starts, ["09:00", "09:30", "11:00", "11:30", "12:00", "12:30"]);
    assert.deepEqual(r.body.attendees, ["you", "priya"]);

    // "you" being busy blocks slots even when they aren't listed
    await post("/api/events", { title: "You busy", date: MONDAY, start: "09:00", duration: 60 });
    const r2 = await get(`/api/availability/free-slots?date=${MONDAY}&duration=30&attendees=priya`);
    assert.equal(r2.body.slots[0].start, "11:00");
  });

  test("returns at most 6 slots, respects duration and the 9–6 window", async () => {
    const r = await get(`/api/availability/free-slots?date=${MONDAY}&duration=90`);
    assert.equal(r.body.slots.length, 6);
    assert.deepEqual(r.body.slots[0], { start: "09:00", end: "10:30" });

    // fully booked day -> no slots
    await post("/api/events", { date: MONDAY, start: "09:00", end: "18:00" });
    assert.deepEqual((await get(`/api/availability/free-slots?date=${MONDAY}&duration=30`)).body.slots, []);
  });

  test("a slot must fit before 6pm", async () => {
    await post("/api/events", { date: MONDAY, start: "09:00", end: "17:00" });
    const r = await get(`/api/availability/free-slots?date=${MONDAY}&duration=90`);
    assert.deepEqual(r.body.slots, []); // 17:00-18:30 would overrun
    const r30 = await get(`/api/availability/free-slots?date=${MONDAY}&duration=30`);
    assert.deepEqual(r30.body.slots.map((s) => s.start), ["17:00", "17:30"]);
  });

  test("bad input", async () => {
    assert.equal((await get("/api/availability/free-slots?date=nope")).status, 400);
    assert.equal((await get(`/api/availability/free-slots?date=${MONDAY}&duration=abc`)).status, 400);
    assert.equal((await get(`/api/availability/free-slots?date=${MONDAY}&attendees=ghost`)).status, 400);
  });

  test("best window picks the earliest slot with the most people free", async () => {
    let r = (await get(`/api/availability/best-window?weekOf=${MONDAY}`)).body.window;
    assert.deepEqual(r, { date: MONDAY, start: "09:00", end: "09:30", freeCount: 5, totalPeople: 5 });

    await post("/api/events", { title: "x", date: MONDAY, start: "09:00", end: "12:00", attendees: ["priya"] });
    r = (await get(`/api/availability/best-window?weekOf=${MONDAY}`)).body.window;
    assert.equal(r.date, MONDAY);
    assert.equal(r.start, "12:00");
    assert.equal(r.freeCount, 5);
  });

  test("best window looks at the week containing weekOf, not just Monday", async () => {
    const wed = addDaysStr(MONDAY, 2);
    const r = (await get(`/api/availability/best-window?weekOf=${wed}`)).body.window;
    assert.equal(r.date, MONDAY);
  });
});

describe("sharing & delegation", () => {
  test("starting state matches the frontend, and Priya is the delegate", async () => {
    const r = (await get("/api/sharing")).body;
    assert.deepEqual(r, { owner: "you", sharing: { priya: "delegate", dev: "view", amara: "view", noah: "none" }, delegate: "priya" });
  });

  test("only one delegate: promoting someone demotes the previous one to 'edit'", async () => {
    const r = await call("PUT", "/api/sharing/dev", { body: { permission: "delegate" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.delegate, "dev");
    assert.equal(r.body.sharing.dev, "delegate");
    assert.equal(r.body.sharing.priya, "edit");
    const delegates = Object.values(r.body.sharing).filter((p) => p === "delegate");
    assert.equal(delegates.length, 1);
  });

  test("demoting the delegate clears the delegate; setting 'none' revokes access", async () => {
    let r = (await call("PUT", "/api/sharing/priya", { body: { permission: "view" } })).body;
    assert.equal(r.delegate, null);
    assert.equal(r.sharing.priya, "view");
    r = (await call("PUT", "/api/sharing/dev", { body: { permission: "none" } })).body;
    assert.equal(r.sharing.dev, "none");
  });

  test("validation", async () => {
    assert.equal((await call("PUT", "/api/sharing/dev", { body: { permission: "admin" } })).status, 400);
    assert.equal((await call("PUT", "/api/sharing/dev", { body: {} })).status, 400);
    assert.equal((await call("PUT", "/api/sharing/ghost", { body: { permission: "view" } })).status, 404);
    assert.equal((await call("PUT", "/api/sharing/you", { body: { permission: "view" } })).status, 400);
  });

  test("the database itself refuses a second delegate", () => {
    assert.throws(
      () => db.prepare("INSERT INTO shares (owner_id, grantee_id, permission) VALUES ('you','dev','delegate')").run(),
      /UNIQUE/
    );
  });

  test("each user sees their own sharing settings", async () => {
    const r = (await get("/api/sharing", "priya")).body;
    assert.equal(r.owner, "priya");
    assert.ok(!("priya" in r.sharing));
    assert.equal(r.delegate, null);
  });
});

describe("access control follows sharing levels", () => {
  test("view-only and no-access users cannot create events on someone else's calendar", async () => {
    const body = { date: MONDAY, start: "10:00", duration: 30, organizer: "you" };
    assert.equal((await post("/api/events", body, "dev")).status, 403);   // view
    assert.equal((await post("/api/events", body, "noah")).status, 403);  // none
  });

  test("edit and delegate users can", async () => {
    const body = { date: MONDAY, start: "10:00", duration: 30, organizer: "you" };
    assert.equal((await post("/api/events", body, "priya")).status, 201); // delegate
    await call("PUT", "/api/sharing/amara", { body: { permission: "edit" } });
    assert.equal((await post("/api/events", { ...body, start: "11:00" }, "amara")).status, 201);
  });

  test("editing and deleting follow the same rule", async () => {
    const { event } = (await post("/api/events", { date: MONDAY, start: "10:00", duration: 30 })).body;
    assert.equal((await call("PATCH", `/api/events/${event.id}`, { body: { title: "hax" }, user: "noah" })).status, 403);
    assert.equal((await call("DELETE", `/api/events/${event.id}`, { user: "dev" })).status, 403);
    assert.equal((await call("PATCH", `/api/events/${event.id}`, { body: { title: "ok" }, user: "priya" })).status, 200);
    assert.equal((await call("DELETE", `/api/events/${event.id}`, { user: "priya" })).status, 204);
  });

  test("revoking access takes effect immediately", async () => {
    const body = { date: MONDAY, start: "10:00", duration: 30, organizer: "you" };
    assert.equal((await post("/api/events", body, "priya")).status, 201);
    await call("PUT", "/api/sharing/priya", { body: { permission: "none" } });
    assert.equal((await post("/api/events", { ...body, start: "12:00" }, "priya")).status, 403);
  });
});
