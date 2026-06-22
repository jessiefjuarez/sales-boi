/* ============================================================
   api.js — thin client for the /api/* Worker endpoints. Throws
   on non-2xx and returns parsed JSON.
   ============================================================ */
(function () {
  "use strict";

  async function call(path, init) {
    const res = await fetch(path, init);
    let body = null;
    try {
      body = await res.json();
    } catch {
      // not JSON
    }
    if (!res.ok) {
      const msg = (body && body.error) || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return body;
  }

  function post(path, body) {
    return call(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  window.API = {
    scoreUrl(url) {
      return post("/api/score-url", { url });
    },
    runDiscovery(limit) {
      return post("/api/discover", { limit });
    },
    listQueue(status) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      return call("/api/queue" + qs);
    },
    confirm(id) {
      return post(`/api/queue/${encodeURIComponent(id)}/confirm`);
    },
    reject(id) {
      return post(`/api/queue/${encodeURIComponent(id)}/reject`);
    },
    snooze(id, days) {
      return post(`/api/queue/${encodeURIComponent(id)}/snooze`, { days });
    },
  };
})();
