"use strict";

// PLACEHOLDER IDENTITY — the frontend has no login screen ("Signed in as You"), so the
// API takes the acting user from an `X-User-Id` header and falls back to DEFAULT_USER_ID.
// This is NOT authentication: anyone can send any id. Before real use, replace this
// middleware with your SSO/JWT/session check and set req.user from the verified identity.

const config = require("../config");
const { ApiError } = require("../lib/errors");

function currentUser(db) {
  const q = db.prepare("SELECT id, name, role, color FROM people WHERE id = ?");
  return (req, _res, next) => {
    const id = req.get("X-User-Id") || config.defaultUserId;
    const user = q.get(id);
    if (!user) return next(new ApiError(401, "unknown_user", `Unknown user: ${id}`));
    req.user = user;
    next();
  };
}

module.exports = { currentUser };
