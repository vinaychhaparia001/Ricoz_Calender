"use strict";

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new ApiError(400, "bad_request", message, details);
const forbidden = (message) => new ApiError(403, "forbidden", message);
const notFound = (message) => new ApiError(404, "not_found", message);
const conflict = (message, details) => new ApiError(409, "conflict", message, details);

module.exports = { ApiError, badRequest, forbidden, notFound, conflict };
