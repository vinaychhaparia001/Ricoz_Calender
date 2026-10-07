"use strict";

// Server-side versions of the frontend's scheduling logic:
//   findFreeSlots   <- findFreeSlots()   (Scheduling assistant, "Available times")
//   bestWindow      <- bestWeekWindow()  (Scheduling assistant, "Best open window this week")
//   roomsAvailability / roomConflicts <- isRoomFree() (Room booking, live conflict checking)

const config = require("../config");
const { badRequest } = require("../lib/errors");
const {
  minToTime, timeToMin, isOverlap, addDaysStr, startOfWeekStr, todayStr,
} = require("../lib/time");

function createAvailabilityService(db) {
  const qPeopleIds = db.prepare("SELECT id FROM people ORDER BY rowid");
  const qRooms = db.prepare("SELECT * FROM rooms ORDER BY rowid");
  const qRoomExists = db.prepare("SELECT 1 FROM rooms WHERE id = ?");

  // Each row: one (event, attendee) pair for the given date range.
  const qBusyRows = db.prepare(`
    SELECT e.id AS event_id, e.title, e.date, e.start, e."end", a.person_id
    FROM events e
    JOIN event_attendees a ON a.event_id = e.id
    WHERE e.date BETWEEN ? AND ?
  `);

  const qRoomConflicts = db.prepare(`
    SELECT id, title, date, start, "end"
    FROM events
    WHERE room_id = ? AND date = ? AND start < ? AND ? < "end" AND id <> ?
    ORDER BY start
  `);

  const qAttendeeConflicts = db.prepare(`
    SELECT a.person_id, e.id AS event_id, e.title, e.start, e."end"
    FROM events e
    JOIN event_attendees a ON a.event_id = e.id
    WHERE e.date = ? AND e.start < ? AND ? < e."end" AND e.id <> ?
  `);

  // person -> date -> [{start,end}] (minutes)
  function busyIndex(fromDate, toDate) {
    const index = new Map();
    for (const r of qBusyRows.all(fromDate, toDate)) {
      if (!index.has(r.person_id)) index.set(r.person_id, new Map());
      const byDate = index.get(r.person_id);
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push({ start: timeToMin(r.start), end: timeToMin(r.end) });
    }
    return index;
  }

  function isFree(index, personId, date, startMin, endMin) {
    const list = index.get(personId)?.get(date);
    if (!list) return true;
    return !list.some((b) => isOverlap(startMin, endMin, b.start, b.end));
  }

  /**
   * Shared free slots for a group on one day. The requesting user is always included,
   * exactly like the frontend always includes "you".
   */
  function findFreeSlots({ date, durationMin, attendeeIds, userId }) {
    const known = new Set(qPeopleIds.all().map((p) => p.id));
    const unknown = attendeeIds.filter((id) => !known.has(id));
    if (unknown.length) throw badRequest(`Unknown attendee(s): ${unknown.join(", ")}`);

    const everyone = [userId, ...attendeeIds.filter((id) => id !== userId)];
    const index = busyIndex(date, date);
    const slots = [];

    for (let t = config.workDayStartMin; t + durationMin <= config.workDayEndMin; t += config.slotStepMin) {
      if (everyone.every((p) => isFree(index, p, date, t, t + durationMin))) {
        slots.push({ start: minToTime(t), end: minToTime(t + durationMin) });
        if (slots.length >= config.maxFreeSlots) break;
      }
    }
    return { date, duration: durationMin, attendees: everyone, slots };
  }

  /**
   * The Mon–Fri half-hour window in the week containing `weekOf` (default: today)
   * when the most people are free. Ties go to the earliest window, as in the frontend.
   */
  function bestWindow({ weekOf } = {}) {
    const monday = startOfWeekStr(weekOf || todayStr());
    const friday = addDaysStr(monday, 4);
    const people = qPeopleIds.all().map((p) => p.id);
    const index = busyIndex(monday, friday);

    let best = null;
    for (let d = 0; d < 5; d++) {
      const date = addDaysStr(monday, d);
      for (let t = config.workDayStartMin; t + 30 <= config.workDayEndMin; t += 30) {
        let freeCount = 0;
        for (const p of people) if (isFree(index, p, date, t, t + 30)) freeCount++;
        if (!best || freeCount > best.freeCount) best = { date, start: t, freeCount };
      }
    }
    if (!best) return null;
    return {
      date: best.date,
      start: minToTime(best.start),
      end: minToTime(best.start + 30),
      freeCount: best.freeCount,
      totalPeople: people.length,
    };
  }

  /** Events already using this room during [startMin, endMin) on `date`. */
  function roomConflicts(roomId, date, startStr, endStr, excludeEventId = "") {
    return qRoomConflicts.all(roomId, date, endStr, startStr, excludeEventId);
  }

  /** Every room with a live free/booked flag for the requested slot. */
  function roomsAvailability({ date, start, endStr }) {
    return qRooms.all().map((room) => {
      const conflicts = roomConflicts(room.id, date, start, endStr);
      return { ...room, free: conflicts.length === 0, conflicts };
    });
  }

  /** People from `attendeeIds` who already have something overlapping this slot. */
  function attendeeConflicts(date, startStr, endStr, attendeeIds, excludeEventId = "") {
    const wanted = new Set(attendeeIds);
    return qAttendeeConflicts
      .all(date, endStr, startStr, excludeEventId)
      .filter((r) => wanted.has(r.person_id))
      .map((r) => ({
        type: "attendee_conflict",
        person: r.person_id,
        event: { id: r.event_id, title: r.title, start: r.start, end: r.end },
      }));
  }

  const roomExists = (id) => !!qRoomExists.get(id);

  return { findFreeSlots, bestWindow, roomConflicts, roomsAvailability, attendeeConflicts, roomExists };
}

module.exports = { createAvailabilityService };
