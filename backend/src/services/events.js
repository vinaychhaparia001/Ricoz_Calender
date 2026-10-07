"use strict";

const crypto = require("crypto");
const { badRequest, forbidden, notFound, conflict } = require("../lib/errors");
const {
  requireDate, requireTime, requireDuration, minToTime, timeToMin,
} = require("../lib/time");

const MAX_RANGE_DAYS = 120;

function createEventService(db, availability, sharing) {
  const qPerson = db.prepare("SELECT id FROM people");
  const qGet = db.prepare(`
    SELECT e.*, a.person_id
    FROM events e LEFT JOIN event_attendees a ON a.event_id = e.id
    WHERE e.id = ? ORDER BY a.rowid
  `);
  const qInsert = db.prepare(`
    INSERT INTO events (id, title, date, start, "end", room_id, organizer_id)
    VALUES (@id, @title, @date, @start, @end, @room_id, @organizer_id)
  `);
  const qUpdate = db.prepare(`
    UPDATE events SET title=@title, date=@date, start=@start, "end"=@end, room_id=@room_id WHERE id=@id
  `);
  const qDeleteAttendees = db.prepare("DELETE FROM event_attendees WHERE event_id = ?");
  const qAddAttendee = db.prepare("INSERT INTO event_attendees (event_id, person_id) VALUES (?, ?)");
  const qDelete = db.prepare("DELETE FROM events WHERE id = ?");

  const personIds = () => new Set(qPerson.all().map((p) => p.id));
  const newId = () => "e" + crypto.randomBytes(6).toString("hex");

  // ---- shaping rows into the JSON the frontend already expects ----
  function shape(rows) {
    const byId = new Map();
    for (const r of rows) {
      if (!byId.has(r.id)) {
        byId.set(r.id, {
          id: r.id, title: r.title, date: r.date, start: r.start, end: r.end,
          attendees: [], room: r.room_id, organizer: r.organizer_id,
        });
      }
      if (r.person_id) byId.get(r.id).attendees.push(r.person_id);
    }
    return [...byId.values()];
  }

  function get(id) {
    const rows = qGet.all(id);
    if (!rows.length) throw notFound(`No such event: ${id}`);
    return shape(rows)[0];
  }

  /**
   * Filters: date | from+to (inclusive) | person | room. Sorted by date then start time.
   * `person` may be a person id; the route resolves "me" before calling this.
   */
  function list({ date, from, to, person, room }) {
    const where = [];
    const params = [];

    if (date) {
      requireDate(date, "date");
      where.push("e.date = ?"); params.push(date);
    } else if (from || to) {
      if (!from || !to) throw badRequest("Provide both 'from' and 'to' for a date range");
      requireDate(from, "from"); requireDate(to, "to");
      if (from > to) throw badRequest("'from' must not be after 'to'");
      const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
      if (days > MAX_RANGE_DAYS) throw badRequest(`Date range too large (max ${MAX_RANGE_DAYS} days)`);
      where.push("e.date BETWEEN ? AND ?"); params.push(from, to);
    } else {
      throw badRequest("Provide either 'date' or both 'from' and 'to'");
    }
    if (person) {
      where.push("e.id IN (SELECT event_id FROM event_attendees WHERE person_id = ?)"); params.push(person);
    }
    if (room) { where.push("e.room_id = ?"); params.push(room); }

    const sql = `
      SELECT e.*, a.person_id
      FROM events e LEFT JOIN event_attendees a ON a.event_id = e.id
      WHERE ${where.join(" AND ")}
      ORDER BY e.date, e.start, e.id, a.rowid
    `;
    return shape(db.prepare(sql).all(...params));
  }

  // ---- validation shared by create and update ----
  function resolveTimes({ start, end, duration }, fallbackLenMin) {
    requireTime(start, "start");
    let endStr;
    if (end !== undefined && end !== null) {
      endStr = requireTime(end, "end");
    } else {
      const len = duration !== undefined ? requireDuration(duration) : fallbackLenMin;
      if (!len) throw badRequest("Provide either 'end' or 'duration'");
      endStr = minToTime(timeToMin(start) + len);
    }
    const startMin = timeToMin(start), endMin = timeToMin(endStr);
    if (endMin > 24 * 60) throw badRequest("Events must finish by midnight");
    if (endMin <= startMin) throw badRequest("'end' must be after 'start'");
    return { start, end: endStr };
  }

  function normalizeAttendees(input, organizerId) {
    if (input !== undefined && !Array.isArray(input)) throw badRequest("attendees must be an array of person ids");
    const known = personIds();
    const wanted = [organizerId, ...(input || [])];
    const unique = [...new Set(wanted)];
    const unknown = unique.filter((id) => !known.has(id));
    if (unknown.length) throw badRequest(`Unknown attendee(s): ${unknown.join(", ")}`);
    return unique; // organizer always first, like "you" in the frontend
  }

  function checkRoom(roomId, date, start, end, excludeEventId) {
    if (roomId === null || roomId === undefined) return null;
    if (typeof roomId !== "string" || !availability.roomExists(roomId)) {
      throw badRequest(`Unknown room: ${roomId}`);
    }
    const clashes = availability.roomConflicts(roomId, date, start, end, excludeEventId);
    if (clashes.length) {
      throw conflict("That room is already booked for this time", { conflicts: clashes });
    }
    return roomId;
  }

  function cleanTitle(title, fallback) {
    if (title === undefined || title === null || String(title).trim() === "") return fallback;
    if (typeof title !== "string") throw badRequest("title must be a string");
    const t = title.trim();
    if (t.length > 200) throw badRequest("title must be 200 characters or fewer");
    return t;
  }

  // ---- create ----
  const create = db.transaction((body, actorId) => {
    const organizerId = body.organizer || actorId;
    if (!personIds().has(organizerId)) throw badRequest(`Unknown organizer: ${organizerId}`);
    if (!sharing.canEditCalendarOf(organizerId, actorId)) {
      throw forbidden(`You don't have edit access to ${organizerId}'s calendar`);
    }

    const date = requireDate(body.date);
    const { start, end } = resolveTimes(body);
    const attendees = normalizeAttendees(body.attendees, organizerId);
    const roomId = checkRoom(body.room ?? null, date, start, end, "");
    const title = cleanTitle(body.title, "Untitled meeting");

    const id = newId();
    qInsert.run({ id, title, date, start, end, room_id: roomId, organizer_id: organizerId });
    attendees.forEach((p) => qAddAttendee.run(id, p));

    return {
      event: get(id),
      warnings: availability.attendeeConflicts(date, start, end, attendees, id),
    };
  });

  // ---- update (partial) ----
  const update = db.transaction((id, body, actorId) => {
    const existing = get(id);
    if (!sharing.canEditCalendarOf(existing.organizer, actorId)) {
      throw forbidden("You don't have permission to change this event");
    }

    const date = body.date !== undefined ? requireDate(body.date) : existing.date;
    const currentLen = timeToMin(existing.end) - timeToMin(existing.start);
    const { start, end } = resolveTimes(
      { start: body.start ?? existing.start, end: body.end, duration: body.duration },
      currentLen
    );
    const attendees = body.attendees !== undefined
      ? normalizeAttendees(body.attendees, existing.organizer)
      : existing.attendees;
    const roomId = checkRoom(body.room !== undefined ? body.room : existing.room, date, start, end, id);
    const title = cleanTitle(body.title, existing.title);

    qUpdate.run({ id, title, date, start, end, room_id: roomId });
    if (body.attendees !== undefined) {
      qDeleteAttendees.run(id);
      attendees.forEach((p) => qAddAttendee.run(id, p));
    }
    return {
      event: get(id),
      warnings: availability.attendeeConflicts(date, start, end, attendees, id),
    };
  });

  function remove(id, actorId) {
    const existing = get(id);
    if (!sharing.canEditCalendarOf(existing.organizer, actorId)) {
      throw forbidden("You don't have permission to delete this event");
    }
    qDelete.run(id);
  }

  return { get, list, create, update, remove };
}

module.exports = { createEventService };
