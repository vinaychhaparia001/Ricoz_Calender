"use strict";

// Loads the same starter data the frontend mocks in app.js: 5 people, 4 rooms,
// the default sharing settings, and (optionally) a week of demo meetings.
//
//   npm run seed        -> wipes the database and reseeds it

const crypto = require("crypto");
const { openDatabase } = require("./db");
const config = require("./config");
const { minToTime, addDaysStr, startOfWeekStr, todayStr } = require("./lib/time");

const PEOPLE = [
  { id: "you",   name: "You",          role: "Product Design", color: "#1F3A5F" },
  { id: "priya", name: "Priya Nair",   role: "Engineering",    color: "#2F6B4F" },
  { id: "dev",   name: "Dev Kapoor",   role: "Engineering",    color: "#B54834" },
  { id: "amara", name: "Amara Singh",  role: "Program Mgmt",   color: "#8A6D1F" },
  { id: "noah",  name: "Noah Fischer", role: "Design",         color: "#5B6472" },
];

const ROOMS = [
  { id: "r1", name: "Falcon", capacity: 4,  equipment: "Video conf, whiteboard",           floor: "3rd floor" },
  { id: "r2", name: "Orion",  capacity: 10, equipment: "Video conf, projector",            floor: "3rd floor" },
  { id: "r3", name: "Atlas",  capacity: 2,  equipment: "Phone only",                       floor: "2nd floor" },
  { id: "r4", name: "Vega",   capacity: 20, equipment: "Video conf, projector, stage mic", floor: "Ground floor" },
];

// The frontend's seed lists Priya as delegate but shows her access as "edit".
// Here the two agree: Priya is a full delegate.
const SHARING = { priya: "delegate", dev: "view", amara: "view", noah: "none" };

const TITLES = ["Sync", "1:1", "Planning", "Design crit", "Client call", "Standup", "Review", "Interview", "Retro"];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function seedDatabase(db, { demoEvents = config.seedDemoEvents } = {}) {
  const insPerson = db.prepare("INSERT INTO people (id, name, role, color) VALUES (@id, @name, @role, @color)");
  const insRoom = db.prepare("INSERT INTO rooms (id, name, capacity, equipment, floor) VALUES (@id, @name, @capacity, @equipment, @floor)");
  const insShare = db.prepare("INSERT INTO shares (owner_id, grantee_id, permission) VALUES ('you', ?, ?)");
  const insEvent = db.prepare(`INSERT INTO events (id, title, date, start, "end", room_id, organizer_id)
                               VALUES (@id, @title, @date, @start, @end, @room_id, @organizer_id)`);
  const insAttendee = db.prepare("INSERT INTO event_attendees (event_id, person_id) VALUES (?, ?)");

  db.transaction(() => {
    PEOPLE.forEach((p) => insPerson.run(p));
    ROOMS.forEach((r) => insRoom.run(r));
    Object.entries(SHARING).forEach(([who, perm]) => { if (perm !== "none") insShare.run(who, perm); });

    if (!demoEvents) return;

    const monday = startOfWeekStr(todayStr());
    const add = (title, date, startMin, endMin, attendees, room, organizer) => {
      const id = "e" + crypto.randomBytes(6).toString("hex");
      insEvent.run({ id, title, date, start: minToTime(startMin), end: minToTime(endMin), room_id: room, organizer_id: organizer });
      attendees.forEach((a) => insAttendee.run(id, a));
    };

    // A few random single-person blocks per weekday, like the frontend's generateSeed()
    for (let d = 0; d < 5; d++) {
      const date = addDaysStr(monday, d);
      for (const person of PEOPLE) {
        const n = randInt(1, 3);
        for (let i = 0; i < n; i++) {
          const startMin = randInt(9, 16) * 60 + (Math.random() < 0.5 ? 0 : 30);
          const endMin = startMin + [30, 60, 90][randInt(0, 2)];
          if (endMin > 18 * 60) continue;
          add(TITLES[randInt(0, TITLES.length - 1)], date, startMin, endMin, [person.id], null, person.id);
        }
      }
    }
    // Two team meetings so the shared calendar has real context
    add("Sprint planning", monday, 10 * 60, 11 * 60, ["you", "priya", "dev", "amara"], "r2", "you");
    add("Design review", addDaysStr(monday, 2), 14 * 60, 15 * 60, ["you", "priya", "noah"], "r1", "you");
  })();
}

function resetDatabase(db) {
  db.transaction(() => {
    ["event_attendees", "events", "shares", "rooms", "people"].forEach((t) => db.exec(`DELETE FROM ${t}`));
  })();
}

function isEmpty(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM people").get().n === 0;
}

module.exports = { seedDatabase, resetDatabase, isEmpty, PEOPLE, ROOMS };

if (require.main === module) {
  const db = openDatabase();
  if (process.argv.includes("--reset")) resetDatabase(db);
  if (isEmpty(db)) {
    seedDatabase(db);
    console.log("Database seeded.");
  } else {
    console.log("Database already has data. Run with --reset to wipe and reseed.");
  }
  db.close();
}
