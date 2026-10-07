"use strict";

const express = require("express");
const { badRequest, notFound } = require("../lib/errors");
const { requireDate, requireTime, requireDuration, minToTime, timeToMin } = require("../lib/time");

module.exports = function roomsRoutes(db, availability, events) {
  const router = express.Router();
  const qAll = db.prepare("SELECT * FROM rooms ORDER BY rowid");
  const qOne = db.prepare("SELECT * FROM rooms WHERE id = ?");

  function slotFromQuery(src) {
    const date = requireDate(src.date);
    const start = requireTime(src.start, "start");
    const duration = requireDuration(src.duration ?? 30);
    const endMin = timeToMin(start) + duration;
    if (endMin > 24 * 60) throw badRequest("Bookings must finish by midnight");
    return { date, start, duration, end: minToTime(endMin) };
  }

  // GET /api/rooms — static room list (capacity, equipment, floor)
  router.get("/rooms", (_req, res) => res.json({ rooms: qAll.all() }));

  // GET /api/rooms/availability?date=YYYY-MM-DD&start=HH:MM&duration=30
  // Every room with `free: true|false` (+ the clashing events) for that slot.
  router.get("/rooms/availability", (req, res) => {
    const slot = slotFromQuery(req.query);
    res.json({
      date: slot.date, start: slot.start, end: slot.end, duration: slot.duration,
      rooms: availability.roomsAvailability({ date: slot.date, start: slot.start, endStr: slot.end }),
    });
  });

  // POST /api/rooms/:id/book   { date, start, duration, title? }
  // Creates an event in that room with you as the attendee. 409 if the room is taken.
  router.post("/rooms/:id/book", (req, res) => {
    const room = qOne.get(req.params.id);
    if (!room) throw notFound(`No such room: ${req.params.id}`);
    const slot = slotFromQuery(req.body || {});
    const { event, warnings } = events.create(
      {
        title: (req.body && req.body.title) || "Room booking",
        date: slot.date, start: slot.start, duration: slot.duration,
        attendees: [], room: room.id,
      },
      req.user.id
    );
    res.status(201).json({ event, room, warnings });
  });

  return router;
};
