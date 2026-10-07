"use strict";

const express = require("express");
const { badRequest } = require("../lib/errors");

module.exports = function sharingRoutes(sharing) {
  const router = express.Router();

  // GET /api/sharing — how the signed-in user's calendar is shared.
  // -> { owner, sharing: { priya: "delegate", dev: "view", ... }, delegate: "priya" | null }
  router.get("/sharing", (req, res) => res.json(sharing.getState(req.user.id)));

  // PUT /api/sharing/:personId   { permission: "none" | "view" | "edit" | "delegate" }
  // Making someone delegate automatically demotes the previous delegate to "edit".
  router.put("/sharing/:personId", (req, res) => {
    const permission = req.body && req.body.permission;
    if (typeof permission !== "string") throw badRequest("permission is required");
    res.json(sharing.setPermission(req.user.id, req.params.personId, permission));
  });

  return router;
};
