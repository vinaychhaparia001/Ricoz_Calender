"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  capacity  INTEGER NOT NULL CHECK (capacity > 0),
  equipment TEXT NOT NULL DEFAULT '',
  floor     TEXT NOT NULL DEFAULT ''
);

-- "start"/"end" are zero-padded "HH:MM" strings, so plain string comparison orders them correctly.
CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  date         TEXT NOT NULL,
  start        TEXT NOT NULL,
  "end"        TEXT NOT NULL,
  room_id      TEXT REFERENCES rooms(id) ON DELETE RESTRICT,
  organizer_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start < "end")
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_room_date ON events(room_id, date);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_attendees_person ON event_attendees(person_id);

-- owner_id shares their calendar with grantee_id at the given access level.
CREATE TABLE IF NOT EXISTS shares (
  owner_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  grantee_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('none','view','edit','delegate')),
  PRIMARY KEY (owner_id, grantee_id),
  CHECK (owner_id <> grantee_id)
);
-- The database itself guarantees at most one delegate per calendar owner.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_delegate_per_owner
  ON shares(owner_id) WHERE permission = 'delegate';
`;

function openDatabase(dbPath = config.dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDatabase };
