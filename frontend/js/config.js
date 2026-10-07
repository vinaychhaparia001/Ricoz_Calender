/* Frontend runtime config.
 * By default the app calls "/api" on the same origin (works on Vercel with a rewrite,
 * or when the backend serves the API on the same host).
 * For local dev (frontend on :5173, backend on :3000) it auto-points to localhost:3000.
 * To use a different backend, set window.RICOZ_API_BASE before this file loads. */
(function () {
  "use strict";
  var isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && window.location.port === "5173";
  window.RicozConfig = {
    API_BASE: window.RICOZ_API_BASE || (isLocalDev ? "http://localhost:3000/api")
  };
})();
