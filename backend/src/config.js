"use strict";

require("dotenv").config();

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),
  dbPath: process.env.DB_PATH || (process.env.VERCEL ? "/tmp/ricoz-calendar.db" : "./data/ricoz-calendar.db"),
  corsOrigin: (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim()).filter(Boolean),
  defaultUserId: process.env.DEFAULT_USER_ID || "you",
  seedDemoEvents: (process.env.SEED_DEMO_EVENTS || "true").toLowerCase() !== "false",

  // Business rules — same values the frontend uses in app.js
  workDayStartMin: 9 * 60,
  workDayEndMin: 18 * 60,
  slotStepMin: 30,
  maxFreeSlots: 6,
  permissions: ["none", "view", "edit", "delegate"],
};
