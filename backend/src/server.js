"use strict";

const config = require("./config");
const { openDatabase } = require("./db");
const { seedDatabase, isEmpty } = require("./seed");
const { createApp } = require("./app");

const db = openDatabase();
if (isEmpty(db)) {
  seedDatabase(db);
  console.log("Empty database detected — loaded starter people, rooms and sharing settings.");
}

const server = createApp(db).listen(config.port, () => {
  console.log(`RicozCalendar API listening on http://localhost:3000/api`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
