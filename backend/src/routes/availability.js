"use strict";

const express = require("express");
const { requireDate, requireDuration } = require("../lib/time");

module.exports = function availabilityRoutes(availability) {
  const router = express.Router();

  // GET /api/availability/free-slots?date=YYYY-MM-DD&duration=30&attendees=priya,dev
  // Shared openings (9am–6pm, 30-min steps, max 6) for you + the listed people.
  router.get("/availability/free-slots", (req, res) => {
    const date = requireDate(req.query.date);
    const durationMin = requireDuration(req.query.duration ?? 30);
    const attendeeIds = String(req.query.attendees || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    res.json(availability.findFreeSlots({ date, durationMin, attendeeIds, userId: req.user.id }));
  });

  // GET /api/availability/best-window[?weekOf=YYYY-MM-DD]
  // The Mon–Fri half-hour slot where the most people are free.
  router.get("/availability/best-window", (req, res) => {
    const weekOf = req.query.weekOf ? requireDate(req.query.weekOf, "weekOf") : undefined;
    res.json({ window: availability.bestWindow({ weekOf }) });
  });

  return router;
};
