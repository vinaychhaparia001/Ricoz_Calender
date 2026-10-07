"use strict";

const express = require("express");
const cors = require("cors");
const config = require("./config");
const { ApiError } = require("./lib/errors");
const { currentUser } = require("./middleware/currentUser");
const { createAvailabilityService } = require("./services/availability");
const { createSharingService } = require("./services/sharing");
const { createEventService } = require("./services/events");

function createApp(db) {
  const availability = createAvailabilityService(db);
  const sharing = createSharingService(db);
  const events = createEventService(db, availability, sharing);

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin.includes("*") ? "*" : config.corsOrigin }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  const api = express.Router();
  api.use(currentUser(db));
  api.use(require("./routes/people")(db));
  api.use(require("./routes/events")(events));
  api.use(require("./routes/availability")(availability));
  api.use(require("./routes/rooms")(db, availability, events));
  api.use(require("./routes/sharing")(sharing));
  app.use("/api", api);

  app.use("/api", (_req, _res, next) => next(new ApiError(404, "not_found", "No such endpoint")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "bad_json", message: "Request body is not valid JSON" } });
    }
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
    }
    console.error(err);
    res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  return app;
}

module.exports = { createApp };
