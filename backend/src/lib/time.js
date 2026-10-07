"use strict";

// Same conventions as the frontend: dates are "YYYY-MM-DD", times are "HH:MM" (24h).
const { badRequest } = require("./errors");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n) => (n < 10 ? "0" + n : "" + n);

function minToTime(m) {
  return pad(Math.floor(m / 60)) + ":" + pad(m % 60);
}

function timeToMin(t) {
  const [h, m] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function isValidDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isValidTime(s) {
  return typeof s === "string" && TIME_RE.test(s);
}

function requireDate(value, field = "date") {
  if (!isValidDate(value)) throw badRequest(`${field} must be a valid date in YYYY-MM-DD format`);
  return value;
}

function requireTime(value, field = "start") {
  if (!isValidTime(value)) throw badRequest(`${field} must be a time in HH:MM (24h) format`);
  return value;
}

function requireDuration(value, field = "duration") {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(n) || n < 5 || n > 12 * 60) {
    throw badRequest(`${field} must be a whole number of minutes between 5 and 720`);
  }
  return n;
}

// Date helpers use UTC internally so results never shift with the server's timezone.
function ymdUTC(d) {
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymdUTC(d);
}

// Monday of the week containing dateStr (frontend weeks start on Monday).
function startOfWeekStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  return addDaysStr(dateStr, -dayFromMonday);
}

// "Today" in the server's local timezone.
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function isOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

module.exports = {
  pad, minToTime, timeToMin, isValidDate, isValidTime,
  requireDate, requireTime, requireDuration,
  addDaysStr, startOfWeekStr, todayStr, isOverlap,
};
