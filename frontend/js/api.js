/* Thin client for the RicozCalendar backend API. */
(function () {
  "use strict";

  async function api(path, options) {
    options = options || {};
    var cfg = { method: options.method || "GET", headers: { "Content-Type": "application/json" } };
    if (options.body !== undefined) cfg.body = JSON.stringify(options.body);
    var response = await fetch(window.RicozConfig.API_BASE + path, cfg);
    var data = null;
    try { data = await response.json(); } catch (e) {}
    if (!response.ok) {
      var message = data && data.error && data.error.message ? data.error.message : "Request failed";
      throw new Error(message);
    }
    return data;
  }

  window.RicozApi = { request: api };
})();
