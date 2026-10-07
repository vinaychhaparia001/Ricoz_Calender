"use strict";

const express = require("express");

module.exports = function peopleRoutes(db) {
  const router = express.Router();
  const qAll = db.prepare("SELECT id, name, role, color FROM people ORDER BY rowid");

  // GET /api/people — the team list (replaces PEOPLE in app.js)
  router.get("/people", (_req, res) => res.json({ people: qAll.all() }));

  // GET /api/me — who the API thinks is making the request
  router.get("/me", (req, res) => res.json({ user: req.user }));

  return router;
};
