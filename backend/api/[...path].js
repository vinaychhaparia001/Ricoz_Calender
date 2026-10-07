"use strict";

const { openDatabase } = require("../src/db");
const { seedDatabase, isEmpty } = require("../src/seed");
const { createApp } = require("../src/app");

// Vercel functions have an ephemeral writable /tmp directory. The database is
// initialized once per warm function instance and seeded automatically.
const db = openDatabase();
if (isEmpty(db)) seedDatabase(db);

module.exports = createApp(db);
