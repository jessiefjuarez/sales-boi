/* ============================================================
   store.js — local-first data layer.
   All state lives in one object persisted to localStorage.
   No backend, no build step. Import/export as JSON + CSV.
   ============================================================ */
(function () {
  "use strict";

  const KEY = "agencyflow:v1";

  // -- Domain constants -----------------------------------------------------
  const STATUSES = [
    "New",
    "Researching",
    "Ready to contact",
    "Contacted",
    "Follow-up due",
    "Replied",
    "Call booked",
    "Proposal sent",
    "Won",
    "Lost",
    "Dormant",
  ];

  // Pipeline columns (kanban) and which detailed statuses roll up into each.
  const STAGES = [
    "Prospect",
    "Contacted",
    "Replied",
    "Qualified",
    "Proposal sent",
    "Won",
    "Lost",
  ];

  const STATUS_TO_STAGE = {
    New: "Prospect",
    Researching: "Prospect",
    "Ready to contact": "Prospect",
    Dormant: "Prospect",
    Contacted: "Contacted",
    "Follow-up due": "Contacted",
    Replied: "Replied",
    "Call booked": "Qualified",
    "Proposal sent": "Proposal sent",
    Won: "Won",
    Lost: "Lost",
  };

  // When a card is dropped into a column, set the lead to this status.
  const STAGE_DEFAULT_STATUS = {
    Prospect: "Ready to contact",
    Contacted: "Contacted",
    Replied: "Replied",
    Qualified: "Call booked",
    "Proposal sent": "Proposal sent",
    Won: "Won",
    Lost: "Lost",
  };

  const OPP_STAGES = ["Prospect", "Replied", "Qualified", "Proposal sent", "Won", "Lost"];

  const TAG_SUGGESTIONS = [
    "Agency",
    "Business",
    "e-commerce",
    "performance agency",
    "social agency",
    "brand video",
    "short-form",
    "UGC",
    "DTC",
    "high-volume",
  ];

  // Weighting for the simple lead-scoring formula (sums to 100).
  const SCORE_WEIGHTS = {
    ecommerceFocus: 25,
    doesShortForm: 20,
    activeOutput: 20,
    rightSize: 15,
    remoteFriendly: 10,
    doesBrandVideo: 10,
  };

  const SCORE_LABELS = {
    ecommerceFocus: "Serves e-commerce / online brands",
    doesShortForm: "Produces short-form ad content",
    activeOutput: "High, active video output",
    rightSize: "Right size (small–mid, likely to outsource)",
    remoteFriendly: "Remote-friendly",
    doesBrandVideo: "Does longer brand/promo video",
  };

  // -- State ----------------------------------------------------------------
  let state = null;
  const listeners = [];

  function emptyState() {
    return { leads: [], contacts: [], activities: [], opportunities: [], tasks: [], settings: { theme: "light" } };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        state = JSON.parse(raw);
        if (!state.settings) state.settings = { theme: "light" };
        return;
      }
    } catch (e) {
      console.warn("Could not parse saved data, starting fresh.", e);
    }
    // First run → load seed data.
    seed();
  }

  function seed() {
    const s = window.SEED ? clone(window.SEED) : { leads: [], contacts: [], activities: [], opportunities: [], tasks: [] };
    state = Object.assign(emptyState(), s);
    persist();
  }

  function reset() {
    seed();
    notify();
  }

  function clearAll() {
    state = emptyState();
    persist();
    notify();
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save — storage may be full or blocked.", e);
    }
  }

  function notify() {
    persist();
    listeners.forEach((fn) => fn(state));
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  function getState() {
    return state;
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // -- Scoring --------------------------------------------------------------
  function scoreLead(lead) {
    const sig = lead.signals || {};
    let total = 0;
    Object.keys(SCORE_WEIGHTS).forEach((k) => {
      if (sig[k]) total += SCORE_WEIGHTS[k];
    });
    return total; // 0–100
  }

  function scoreBand(score) {
    if (score >= 75) return "high";
    if (score >= 45) return "medium";
    return "low";
  }

  // -- Leads ----------------------------------------------------------------
  function getLead(id) {
    return state.leads.find((l) => l.id === id) || null;
  }

  function addLead(data) {
    const lead = Object.assign(
      {
        id: uid("lead"),
        name: "Untitled agency",
        website: "",
        niche: "",
        location: "",
        size: "",
        services: [],
        tags: [],
        notes: "",
        source: "",
        dateAdded: todayISO(),
        status: "New",
        priority: false,
        followUpDate: "",
        signals: {},
      },
      data || {}
    );
    state.leads.unshift(lead);
    notify();
    return lead;
  }

  function updateLead(id, patch) {
    const lead = getLead(id);
    if (!lead) return;
    Object.assign(lead, patch);
    notify();
  }

  function deleteLead(id) {
    state.leads = state.leads.filter((l) => l.id !== id);
    state.contacts = state.contacts.filter((c) => c.leadId !== id);
    state.activities = state.activities.filter((a) => a.leadId !== id);
    state.opportunities = state.opportunities.filter((o) => o.leadId !== id);
    state.tasks = state.tasks.filter((t) => t.leadId !== id);
    notify();
  }

  function setLeadStage(id, stage) {
    const lead = getLead(id);
    if (!lead) return;
    lead.status = STAGE_DEFAULT_STATUS[stage] || lead.status;
    notify();
  }

  function stageOf(lead) {
    return STATUS_TO_STAGE[lead.status] || "Prospect";
  }

  // -- Contacts -------------------------------------------------------------
  function contactsFor(leadId) {
    return state.contacts.filter((c) => c.leadId === leadId);
  }
  function primaryContact(leadId) {
    return contactsFor(leadId)[0] || null;
  }
  function addContact(leadId, data) {
    const c = Object.assign({ id: uid("c"), leadId, name: "", role: "", email: "", linkedin: "", instagram: "" }, data || {});
    state.contacts.push(c);
    notify();
    return c;
  }
  function updateContact(id, patch) {
    const c = state.contacts.find((x) => x.id === id);
    if (c) Object.assign(c, patch), notify();
  }
  function deleteContact(id) {
    state.contacts = state.contacts.filter((c) => c.id !== id);
    notify();
  }

  // -- Activities -----------------------------------------------------------
  function activitiesFor(leadId) {
    return state.activities
      .filter((a) => a.leadId === leadId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  function addActivity(leadId, data) {
    const a = Object.assign(
      { id: uid("a"), leadId, type: "note", channel: "Note", direction: "out", date: todayISO(), summary: "" },
      data || {}
    );
    state.activities.push(a);
    notify();
    return a;
  }
  function deleteActivity(id) {
    state.activities = state.activities.filter((a) => a.id !== id);
    notify();
  }

  // -- Opportunities --------------------------------------------------------
  function opportunitiesFor(leadId) {
    return state.opportunities.filter((o) => o.leadId === leadId);
  }
  function addOpportunity(leadId, data) {
    const o = Object.assign(
      { id: uid("o"), leadId, name: "New opportunity", value: 0, probability: 25, stage: "Prospect", notes: "", expectedClose: "" },
      data || {}
    );
    state.opportunities.push(o);
    notify();
    return o;
  }
  function updateOpportunity(id, patch) {
    const o = state.opportunities.find((x) => x.id === id);
    if (o) Object.assign(o, patch), notify();
  }
  function deleteOpportunity(id) {
    state.opportunities = state.opportunities.filter((o) => o.id !== id);
    notify();
  }

  // -- Tasks / follow-ups ---------------------------------------------------
  function tasksFor(leadId) {
    return state.tasks.filter((t) => t.leadId === leadId);
  }
  function openTasks() {
    return state.tasks.filter((t) => !t.done);
  }
  function addTask(leadId, data) {
    const t = Object.assign({ id: uid("t"), leadId, title: "", dueDate: todayISO(), done: false }, data || {});
    state.tasks.push(t);
    notify();
    return t;
  }
  function updateTask(id, patch) {
    const t = state.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, patch), notify();
  }
  function toggleTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (t) (t.done = !t.done), notify();
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    notify();
  }

  // -- Date helpers ---------------------------------------------------------
  function isOverdue(iso) {
    return iso && iso < todayISO();
  }
  function isToday(iso) {
    return iso === todayISO();
  }
  function withinDays(iso, n) {
    if (!iso) return false;
    const t = todayISO();
    const end = new Date();
    end.setDate(end.getDate() + n);
    const endISO = end.toISOString().slice(0, 10);
    return iso >= t && iso <= endISO;
  }
  function monthKey(iso) {
    return iso ? iso.slice(0, 7) : "";
  }

  // -- Derived metrics for dashboard ---------------------------------------
  function metrics() {
    const leads = state.leads;
    const total = leads.length;
    const readyToContact = leads.filter((l) => l.status === "Ready to contact").length;
    const won = leads.filter((l) => l.status === "Won").length;
    const thisMonth = monthKey(todayISO());

    const followUpsDue = state.tasks.filter((t) => !t.done && (isOverdue(t.dueDate) || isToday(t.dueDate))).length;

    const repliesThisMonth = state.activities.filter(
      (a) => a.direction === "in" && monthKey(a.date) === thisMonth
    ).length;

    // Open pipeline value = expected value of non-closed opportunities.
    const pipelineValue = state.opportunities
      .filter((o) => o.stage !== "Won" && o.stage !== "Lost")
      .reduce((sum, o) => sum + (Number(o.value) || 0) * ((Number(o.probability) || 0) / 100), 0);

    const wonValue = state.opportunities
      .filter((o) => o.stage === "Won")
      .reduce((sum, o) => sum + (Number(o.value) || 0), 0);

    // Conversion by pipeline stage (count of leads in each).
    const byStage = {};
    STAGES.forEach((s) => (byStage[s] = 0));
    leads.forEach((l) => {
      byStage[stageOf(l)] = (byStage[stageOf(l)] || 0) + 1;
    });

    return {
      total,
      readyToContact,
      followUpsDue,
      repliesThisMonth,
      won,
      pipelineValue,
      wonValue,
      byStage,
    };
  }

  // Suggested next action for a lead (drives the "Today" view).
  function nextAction(lead) {
    const open = tasksFor(lead.id).filter((t) => !t.done).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    if (open.length) {
      const t = open[0];
      const tag = isOverdue(t.dueDate) ? "Overdue" : isToday(t.dueDate) ? "Today" : "Upcoming";
      return { label: t.title, due: t.dueDate, tag, taskId: t.id };
    }
    const map = {
      New: "Research this agency and score the fit",
      Researching: "Finish research, then mark Ready to contact",
      "Ready to contact": "Generate a cold email and send it",
      Contacted: "Set a follow-up date if no reply",
      "Follow-up due": "Send a follow-up message",
      Replied: "Reply and ask qualifying questions",
      "Call booked": "Prep questions and run the call",
      "Proposal sent": "Follow up on the proposal",
      Won: "Onboard and confirm first edit",
      Lost: "Archive or set a revisit date",
      Dormant: "Re-warm if a good moment appears",
    };
    return { label: map[lead.status] || "Review this lead", due: lead.followUpDate || "", tag: "Suggested", taskId: null };
  }

  // -- Import / Export ------------------------------------------------------
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    state = Object.assign(emptyState(), data);
    notify();
  }

  // CSV of leads (the most useful thing to round-trip with sheets/tools).
  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportLeadsCSV() {
    const cols = ["name", "website", "niche", "location", "size", "services", "tags", "status", "fitScore", "priority", "source", "dateAdded", "followUpDate", "notes", "contactName", "contactEmail"];
    const rows = [cols.join(",")];
    state.leads.forEach((l) => {
      const c = primaryContact(l.id);
      const row = {
        name: l.name,
        website: l.website,
        niche: l.niche,
        location: l.location,
        size: l.size,
        services: (l.services || []).join("; "),
        tags: (l.tags || []).join("; "),
        status: l.status,
        fitScore: scoreLead(l),
        priority: l.priority ? "yes" : "",
        source: l.source,
        dateAdded: l.dateAdded,
        followUpDate: l.followUpDate,
        notes: l.notes,
        contactName: c ? c.name : "",
        contactEmail: c ? c.email : "",
      };
      rows.push(cols.map((k) => csvEscape(row[k])).join(","));
    });
    return rows.join("\n");
  }

  // Minimal CSV parser (handles quotes + commas). Returns array of objects.
  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += ch;
      }
      i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const header = rows.shift().map((h) => h.trim());
    return rows
      .filter((r) => r.some((c) => c.trim() !== ""))
      .map((r) => {
        const obj = {};
        header.forEach((h, idx) => (obj[h] = (r[idx] || "").trim()));
        return obj;
      });
  }

  function importLeadsCSV(text) {
    const records = parseCSV(text);
    let added = 0;
    records.forEach((rec) => {
      const lead = addLeadSilent({
        name: rec.name || rec.Name || rec.agency || "Untitled agency",
        website: rec.website || rec.Website || "",
        niche: rec.niche || rec.Niche || "",
        location: rec.location || rec.Location || "",
        size: rec.size || rec.Size || "",
        services: splitList(rec.services || rec.Services),
        tags: splitList(rec.tags || rec.Tags),
        status: STATUSES.indexOf(rec.status) >= 0 ? rec.status : "New",
        source: rec.source || rec.Source || "CSV import",
        notes: rec.notes || rec.Notes || "",
      });
      const cName = rec.contactName || rec.contact || rec.Contact;
      const cEmail = rec.contactEmail || rec.email || rec.Email;
      if (cName || cEmail) {
        state.contacts.push({ id: uid("c"), leadId: lead.id, name: cName || "", role: rec.contactRole || "", email: cEmail || "", linkedin: rec.linkedin || "", instagram: rec.instagram || "" });
      }
      added++;
    });
    notify();
    return added;
  }

  function splitList(v) {
    if (!v) return [];
    return String(v).split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  }

  // Like addLead but without notifying (for bulk import).
  function addLeadSilent(data) {
    const lead = Object.assign(
      { id: uid("lead"), name: "Untitled agency", website: "", niche: "", location: "", size: "", services: [], tags: [], notes: "", source: "", dateAdded: todayISO(), status: "New", priority: false, followUpDate: "", signals: {} },
      data || {}
    );
    state.leads.unshift(lead);
    return lead;
  }

  // -- Public API -----------------------------------------------------------
  window.Store = {
    // constants
    STATUSES, STAGES, OPP_STAGES, STATUS_TO_STAGE, STAGE_DEFAULT_STATUS, TAG_SUGGESTIONS, SCORE_WEIGHTS, SCORE_LABELS,
    // lifecycle
    load, reset, clearAll, subscribe, getState, persist, notify, todayISO,
    // scoring
    scoreLead, scoreBand,
    // leads
    getLead, addLead, updateLead, deleteLead, setLeadStage, stageOf,
    // contacts
    contactsFor, primaryContact, addContact, updateContact, deleteContact,
    // activities
    activitiesFor, addActivity, deleteActivity,
    // opportunities
    opportunitiesFor, addOpportunity, updateOpportunity, deleteOpportunity,
    // tasks
    tasksFor, openTasks, addTask, updateTask, toggleTask, deleteTask,
    // dates
    isOverdue, isToday, withinDays, monthKey,
    // derived
    metrics, nextAction,
    // io
    exportJSON, importJSON, exportLeadsCSV, importLeadsCSV,
  };
})();
