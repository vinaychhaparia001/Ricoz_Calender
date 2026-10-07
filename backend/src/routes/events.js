"use strict";

const express = require("express");
const { badRequest } = require("../lib/errors");

module.exports = function eventsRoutes(events) {
  const router = express.Router();

  // GET /api/events?date=YYYY-MM-DD
  // GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD   (e.g. the 42 cells of the month grid)
  //   optional: &person=<id|me>  &room=<roomId>
  // "My calendar" = person=me, "Team calendar" = no person filter.
  router.get("/events", (req, res) => {
    const { date, from, to, room } = req.query;
    const person = req.query.person === "me" ? req.user.id : req.query.person;
    res.json({ events: events.list({ date, from, to, person, room }) });
  });

  router.get("/events/:id", (req, res) => res.json({ event: events.get(req.params.id) }));

  // POST /api/events
  // { title?, date, start, end | duration, attendees?: [ids], room?: roomId, organizer?: personId }
  router.post("/events", (req, res) => {
    if (!req.body || typeof req.body !== "object") throw badRequest("JSON body required");
    const { event, warnings } = events.create(req.body, req.user.id);
    res.status(201).json({ event, warnings });
  });

  // PATCH /api/events/:id — any subset of the create fields (organizer can't be changed)
  router.patch("/events/:id", (req, res) => {
    if (!req.body || typeof req.body !== "object") throw badRequest("JSON body required");
    const { event, warnings } = events.update(req.params.id, req.body, req.user.id);
    res.json({ event, warnings });
  });

  router.delete("/events/:id", (req, res) => {
    events.remove(req.params.id, req.user.id);
    res.status(204).end();
  });

  return router;
};
