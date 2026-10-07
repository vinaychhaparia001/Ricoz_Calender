(function () {
  "use strict";
  var isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && window.location.port === "5173";
  window.RicozConfig = {
    API_BASE: window.RICOZ_API_BASE || (isLocalDev ? "http://localhost:3000/api" : "/api")
  };
})();