/* ============================================================
   app.js — UI layer: routing, rendering, interactions.
   Plain DOM, no framework. Re-renders the active view on change.
   ============================================================ */
(function () {
  "use strict";

  const S = window.Store;
  const P = window.PROMPTS;

  // ---- tiny DOM helpers ---------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function money(n) {
    return "$" + Math.round(Number(n) || 0).toLocaleString();
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function relDay(iso) {
    if (!iso) return "";
    const today = S.todayISO();
    if (iso === today) return "Today";
    const a = new Date(iso + "T00:00:00"), b = new Date(today + "T00:00:00");
    const diff = Math.round((a - b) / 86400000);
    if (diff === -1) return "Yesterday";
    if (diff === 1) return "Tomorrow";
    if (diff < 0) return Math.abs(diff) + "d ago";
    return "in " + diff + "d";
  }
  function stageClass(stage) {
    return "s-" + stage.toLowerCase().replace(/[^a-z]/g, "");
  }

  // ---- routing ------------------------------------------------------------
  let route = "today";
  let currentLeadId = null; // for detail modal

  const ROUTES = {
    today: renderToday,
    dashboard: renderDashboard,
    discovery: renderDiscovery,
    leads: renderLeads,
    contacts: renderContacts,
    pipeline: renderPipeline,
    prompts: renderPrompts,
    data: renderData,
  };

  const contactFilters = { q: "", sort: "name" };

  // Cached queue list so the view doesn't flash empty while re-rendering.
  let discoveryCache = { items: null, loading: false, error: null };

  function go(r) {
    route = r;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.route === r));
    render();
  }

  function render() {
    const view = $("#view");
    view.innerHTML = "";
    (ROUTES[route] || renderToday)(view);
  }

  // ---- view state (filters) ----------------------------------------------
  const leadFilters = { q: "", status: "all", tag: "all", sort: "fit" };

  // =========================================================================
  //  TODAY
  // =========================================================================
  function renderToday(view) {
    const st = S.getState();
    const m = S.metrics();
    const greeting = (() => {
      const h = new Date().getHours();
      return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    })();

    // Actionable leads: those with open tasks due now/overdue, or that are
    // ready to contact / awaiting follow-up.
    const actionable = st.leads
      .map((l) => ({ lead: l, action: S.nextAction(l) }))
      .filter(({ lead, action }) => {
        if (lead.status === "Won" || lead.status === "Lost") return false;
        if (action.tag === "Overdue" || action.tag === "Today") return true;
        if (lead.status === "Ready to contact") return true;
        if (action.due && S.withinDays(action.due, 7)) return true;
        return false;
      })
      .sort((a, b) => order(a.action) - order(b.action));

    function order(a) {
      if (a.tag === "Overdue") return 0;
      if (a.tag === "Today") return 1;
      if (a.tag === "Suggested" && true) return 3;
      return 2;
    }

    view.appendChild(
      el(`<div class="page-head">
        <div>
          <h1 class="page-title">${greeting}.</h1>
          <p class="page-sub">${actionable.length ? `${actionable.length} ${actionable.length === 1 ? "lead needs" : "leads need"} attention today.` : "You're all caught up. Add or score a new lead to keep momentum."}</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" id="addLeadTop">+ New lead</button>
        </div>
      </div>`)
    );

    const grid = el(`<div class="today-grid"></div>`);

    // Left: next actions
    const left = el(`<div class="card pad"><div class="subhead"><h2 class="section-title">Next actions</h2><span class="muted small">${actionable.length} queued</span></div><div id="actionList"></div></div>`);
    const list = $("#actionList", left);
    if (!actionable.length) {
      list.appendChild(el(`<div class="empty"><div class="em-ico">✓</div><h3>Nothing due</h3><p>Generate outreach for a "Ready to contact" lead, or import a new batch.</p></div>`));
    }
    actionable.forEach(({ lead, action }) => {
      const flagCls = action.tag === "Overdue" ? "over" : action.tag === "Today" ? "today" : action.tag === "Suggested" ? "sugg" : "up";
      const row = el(`<div class="action-row">
        <div class="action-main">
          <div class="action-name">${esc(lead.name)} ${lead.priority ? '<span class="star">★</span>' : ""}</div>
          <div class="action-next">${esc(action.label)}${action.due ? ` · <span class="muted">${relDay(action.due)}</span>` : ""}</div>
        </div>
        <span class="flag ${flagCls}">${action.tag}</span>
      </div>`);
      row.addEventListener("click", () => openLead(lead.id));
      list.appendChild(row);
    });
    grid.appendChild(left);

    // Right: snapshot + follow-ups this week
    const upcoming = st.tasks
      .filter((t) => !t.done && t.dueDate && S.withinDays(t.dueDate, 7))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

    const right = el(`<div class="stack" style="gap:18px">
      <div class="card pad">
        <h2 class="section-title">This week</h2>
        <div class="stack" style="gap:6px;margin-top:12px">
          <div class="row-between"><span class="muted">Follow-ups due</span><strong>${m.followUpsDue}</strong></div>
          <div class="row-between"><span class="muted">Ready to contact</span><strong>${m.readyToContact}</strong></div>
          <div class="row-between"><span class="muted">Replies this month</span><strong>${m.repliesThisMonth}</strong></div>
          <div class="row-between"><span class="muted">Open pipeline value</span><strong>${money(m.pipelineValue)}</strong></div>
        </div>
      </div>
      <div class="card pad">
        <h2 class="section-title">Upcoming follow-ups</h2>
        <div id="weekTasks" class="stack" style="gap:8px;margin-top:12px"></div>
      </div>
    </div>`);
    const wt = $("#weekTasks", right);
    if (!upcoming.length) wt.appendChild(el(`<p class="muted small">No scheduled follow-ups in the next 7 days.</p>`));
    upcoming.forEach((t) => {
      const lead = S.getLead(t.leadId);
      const dueCls = S.isOverdue(t.dueDate) ? "over" : S.isToday(t.dueDate) ? "today" : "";
      const r = el(`<div class="task-row">
        <input type="checkbox" />
        <div class="action-main"><div class="tt">${esc(t.title)}</div><div class="muted small">${lead ? esc(lead.name) : ""}</div></div>
        <span class="due ${dueCls}">${relDay(t.dueDate)}</span>
      </div>`);
      $("input", r).addEventListener("change", () => { S.toggleTask(t.id); });
      r.addEventListener("click", (e) => { if (e.target.tagName !== "INPUT" && lead) openLead(lead.id); });
      wt.appendChild(r);
    });
    grid.appendChild(right);

    view.appendChild(grid);
    $("#addLeadTop").addEventListener("click", () => openLeadForm());
  }

  // =========================================================================
  //  DASHBOARD
  // =========================================================================
  function renderDashboard(view) {
    const m = S.metrics();
    view.appendChild(
      el(`<div class="page-head">
        <div><h1 class="page-title">Dashboard</h1><p class="page-sub">Your client-acquisition engine at a glance.</p></div>
        <div class="head-actions"><button class="btn btn-primary" id="addLeadTop">+ New lead</button></div>
      </div>`)
    );

    const stats = el(`<div class="stat-grid">
      <div class="stat"><div class="stat-label">Total leads</div><div class="stat-value">${m.total}</div><div class="stat-foot">in your pipeline</div></div>
      <div class="stat"><div class="stat-label">Ready to contact</div><div class="stat-value">${m.readyToContact}</div><div class="stat-foot">queued for outreach</div></div>
      <div class="stat ${m.followUpsDue ? "accent" : ""}"><div class="stat-label">Follow-ups due</div><div class="stat-value">${m.followUpsDue}</div><div class="stat-foot">today or overdue</div></div>
      <div class="stat"><div class="stat-label">Replies this month</div><div class="stat-value">${m.repliesThisMonth}</div><div class="stat-foot">inbound activity</div></div>
    </div>`);
    view.appendChild(stats);

    const grid = el(`<div class="grid-2" style="margin-top:16px"></div>`);

    // Funnel
    const funnel = el(`<div class="card pad"><h2 class="section-title">Conversion by stage</h2><div class="funnel" id="funnel"></div></div>`);
    const f = $("#funnel", funnel);
    const max = Math.max(1, ...S.STAGES.map((s) => m.byStage[s] || 0));
    S.STAGES.forEach((s) => {
      const c = m.byStage[s] || 0;
      f.appendChild(el(`<div class="funnel-row"><span class="fl">${s}</span><div class="funnel-track"><div class="funnel-fill" style="width:${(c / max) * 100}%"></div></div><span class="fc">${c}</span></div>`));
    });
    grid.appendChild(funnel);

    // Pipeline value + won
    const wonCount = m.won;
    const val = el(`<div class="stack" style="gap:16px">
      <div class="stat accent"><div class="stat-label">Open pipeline value</div><div class="stat-value">${money(m.pipelineValue)}</div><div class="stat-foot">probability-weighted, open opportunities</div></div>
      <div class="grid-2" style="gap:14px">
        <div class="stat"><div class="stat-label">Won clients</div><div class="stat-value">${wonCount}</div><div class="stat-foot">${money(m.wonValue)} booked</div></div>
        <div class="stat"><div class="stat-label">Conversion</div><div class="stat-value">${m.total ? Math.round((wonCount / m.total) * 100) : 0}%</div><div class="stat-foot">leads → won</div></div>
      </div>
    </div>`);
    grid.appendChild(val);

    view.appendChild(grid);
    $("#addLeadTop").addEventListener("click", () => openLeadForm());
  }

  // =========================================================================
  //  LEADS
  // =========================================================================
  function renderLeads(view) {
    const st = S.getState();
    view.appendChild(
      el(`<div class="page-head">
        <div><h1 class="page-title">Leads</h1><p class="page-sub">${st.leads.length} agencies tracked.</p></div>
        <div class="head-actions">
          <button class="btn" id="addByUrlTop">+ From URL</button>
          <button class="btn btn-primary" id="addLeadTop">+ New lead</button>
        </div>
      </div>`)
    );

    // Toolbar
    const tb = el(`<div class="toolbar">
      <div class="search"><input class="input" id="leadSearch" placeholder="Search agencies, niches, notes…" value="${esc(leadFilters.q)}" /></div>
      <select class="select" id="statusFilter"></select>
      <select class="select" id="sortBy"></select>
    </div>`);
    const sf = $("#statusFilter", tb);
    sf.appendChild(el(`<option value="all">All statuses</option>`));
    S.STATUSES.forEach((s) => sf.appendChild(el(`<option value="${s}" ${leadFilters.status === s ? "selected" : ""}>${s}</option>`)));
    const sb = $("#sortBy", tb);
    [["fit", "Sort: Fit score"], ["recent", "Sort: Recently added"], ["name", "Sort: Name A–Z"], ["follow", "Sort: Follow-up date"]].forEach(([v, label]) =>
      sb.appendChild(el(`<option value="${v}" ${leadFilters.sort === v ? "selected" : ""}>${label}</option>`))
    );
    view.appendChild(tb);

    // Tag chips
    const allTags = uniqueTags(st.leads);
    if (allTags.length) {
      const chips = el(`<div class="chip-row" style="margin:-6px 0 16px"></div>`);
      chips.appendChild(makeTagChip("all", "All"));
      allTags.forEach((t) => chips.appendChild(makeTagChip(t, t)));
      view.appendChild(chips);
    }

    // Filter + sort
    let rows = st.leads.slice();
    const q = leadFilters.q.toLowerCase().trim();
    if (q) rows = rows.filter((l) => (l.name + " " + l.niche + " " + l.location + " " + l.notes + " " + (l.tags || []).join(" ")).toLowerCase().includes(q));
    if (leadFilters.status !== "all") rows = rows.filter((l) => l.status === leadFilters.status);
    if (leadFilters.tag !== "all") rows = rows.filter((l) => (l.tags || []).includes(leadFilters.tag));
    rows.sort((a, b) => {
      if (leadFilters.sort === "fit") return S.scoreLead(b) - S.scoreLead(a);
      if (leadFilters.sort === "name") return a.name.localeCompare(b.name);
      if (leadFilters.sort === "recent") return (b.dateAdded || "").localeCompare(a.dateAdded || "");
      if (leadFilters.sort === "follow") return (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999");
      return 0;
    });

    if (!rows.length) {
      view.appendChild(el(`<div class="card"><div class="empty"><div class="em-ico">☰</div><h3>No leads match</h3><p>Try clearing filters, or add a new agency.</p></div></div>`));
    } else {
      const wrap = el(`<div class="table-wrap"><table class="leads"><thead><tr>
        <th>Agency</th><th>Niche</th><th>Fit</th><th>Status</th><th>Tags</th><th>Opportunities</th><th>Follow-up</th>
      </tr></thead><tbody></tbody></table></div>`);
      const tbody = $("tbody", wrap);
      rows.forEach((l) => {
        const score = S.scoreLead(l);
        const band = S.scoreBand(score);
        const stage = S.stageOf(l);
        const due = l.followUpDate ? `<span class="due ${S.isOverdue(l.followUpDate) ? "over" : S.isToday(l.followUpDate) ? "today" : ""}">${relDay(l.followUpDate)}</span>` : '<span class="muted small">—</span>';
        const openOpps = S.opportunitiesFor(l.id).filter((o) => o.stage !== "Lost");
        const oppVal = openOpps.reduce((s, o) => s + (Number(o.value) || 0), 0);
        const oppCell = openOpps.length
          ? `<div>${openOpps.length} open</div>${oppVal ? `<div class="lead-sub">${money(oppVal)}</div>` : ""}`
          : '<span class="muted small">—</span>';
        const tr = el(`<tr>
          <td><div class="lead-name">${lead_priority_star(l)}${esc(l.name)}</div><div class="lead-sub">${esc(l.location || "")}</div></td>
          <td>${esc(l.niche || "—")}<div class="lead-sub">${esc(l.size || "")}</div></td>
          <td><span class="score ${band}"><span class="dot"></span>${score}</span></td>
          <td><span class="pill ${stageClass(stage)}">${esc(l.status)}</span></td>
          <td><div class="tags">${(l.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></td>
          <td>${oppCell}</td>
          <td>${due}</td>
        </tr>`);
        tr.addEventListener("click", () => openLead(l.id));
        tbody.appendChild(tr);
      });
      view.appendChild(wrap);
    }

    // wire toolbar
    const search = $("#leadSearch", tb);
    search.addEventListener("input", () => { leadFilters.q = search.value; debouncedRerender(); });
    sf.addEventListener("change", () => { leadFilters.status = sf.value; render(); });
    sb.addEventListener("change", () => { leadFilters.sort = sb.value; render(); });
    $("#addLeadTop").addEventListener("click", () => openLeadForm());
    $("#addByUrlTop").addEventListener("click", () => openAddByUrlModal());
  }

  // =========================================================================
  //  ADD BY URL — paste a website, Claude scores it, instant lead.
  // =========================================================================
  function openAddByUrlModal() {
    const panel = el(`<div></div>`);
    panel.appendChild(el(`<div class="modal-head">
      <h2 class="modal-title">Add lead from URL</h2>
      <button class="x" id="ux">✕</button>
    </div>`));
    panel.appendChild(el(`<div class="form-grid">
      <div class="field full">
        <label>Agency website</label>
        <input class="input" id="urlInput" placeholder="https://northloop.studio" autofocus />
        <p class="muted small" style="margin-top:6px">Claude reads the homepage and pre-fills a scored lead.</p>
      </div>
      <div class="field full" id="urlStatus" hidden><div class="muted small"></div></div>
    </div>`));
    panel.appendChild(el(`<div class="modal-foot">
      <button class="btn" id="uCancel">Cancel</button>
      <button class="btn btn-primary" id="uScore">Score & add</button>
    </div>`));

    openModal(panel);
    $("#ux", panel).addEventListener("click", closeModal);
    $("#uCancel", panel).addEventListener("click", closeModal);

    const input = $("#urlInput", panel);
    const statusBox = $("#urlStatus", panel);
    const submitBtn = $("#uScore", panel);

    async function submit() {
      const url = input.value.trim();
      if (!url) return toast("Paste a URL first");
      submitBtn.disabled = true;
      statusBox.hidden = false;
      statusBox.querySelector("div").textContent = "Reading homepage and scoring…";
      try {
        const { lead } = await window.API.scoreUrl(url);
        const created = S.addLead(lead);
        if (lead.draftMessage) {
          S.addActivity(created.id, {
            type: "draft",
            channel: "Email",
            direction: "out",
            summary: lead.draftMessage,
          });
        }
        toast("Lead added");
        closeModal();
        openLead(created.id);
      } catch (e) {
        statusBox.querySelector("div").textContent = "Failed: " + e.message;
        submitBtn.disabled = false;
      }
    }
    submitBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  // =========================================================================
  //  DISCOVERY — AI-sourced candidates awaiting review.
  // =========================================================================
  function renderDiscovery(view) {
    view.appendChild(
      el(`<div class="page-head">
        <div>
          <h1 class="page-title">Discovery</h1>
          <p class="page-sub">AI-sourced agencies for review. Confirm to push into Leads.</p>
        </div>
        <div class="head-actions">
          <button class="btn" id="addByUrlTop">+ From URL</button>
          <button class="btn btn-primary" id="runDisc">Run discovery now</button>
        </div>
      </div>`)
    );

    const tabs = el(`<div class="chip-row" style="margin-bottom:16px">
      <button class="fchip ${discoveryCache.status !== "snoozed" ? "active" : ""}" data-tab="pending">Pending</button>
      <button class="fchip ${discoveryCache.status === "snoozed" ? "active" : ""}" data-tab="snoozed">Snoozed</button>
    </div>`);
    view.appendChild(tabs);

    const listWrap = el(`<div id="discList"></div>`);
    view.appendChild(listWrap);

    function paintList() {
      listWrap.innerHTML = "";
      if (discoveryCache.loading) {
        listWrap.appendChild(el(`<div class="card"><div class="empty"><div class="em-ico">…</div><h3>Loading</h3><p>Fetching candidates from the queue.</p></div></div>`));
        return;
      }
      if (discoveryCache.error) {
        listWrap.appendChild(el(`<div class="card pad"><h3 class="section-title">Couldn't load queue</h3><p class="muted small">${esc(discoveryCache.error)}</p><p class="muted small">Check that the Worker is deployed and ANTHROPIC_API_KEY is set.</p></div>`));
        return;
      }
      const items = discoveryCache.items || [];
      if (!items.length) {
        listWrap.appendChild(el(`<div class="card"><div class="empty"><div class="em-ico">✺</div><h3>No candidates yet</h3><p>Click <strong>Run discovery now</strong> to find a fresh batch, or paste a URL with <strong>+ From URL</strong>.</p></div></div>`));
        return;
      }
      const grid = el(`<div class="stack" style="gap:14px"></div>`);
      items.forEach((rec) => grid.appendChild(makeDiscoveryCard(rec)));
      listWrap.appendChild(grid);
    }

    async function loadQueue(status) {
      discoveryCache.loading = true;
      discoveryCache.error = null;
      discoveryCache.status = status;
      paintList();
      try {
        const { items } = await window.API.listQueue(status);
        discoveryCache.items = items;
      } catch (e) {
        discoveryCache.error = e.message;
        discoveryCache.items = [];
      }
      discoveryCache.loading = false;
      paintList();
    }

    $$("button[data-tab]", tabs).forEach((b) =>
      b.addEventListener("click", () => {
        $$(".fchip", tabs).forEach((x) => x.classList.toggle("active", x === b));
        loadQueue(b.dataset.tab);
      })
    );

    $("#runDisc").addEventListener("click", async () => {
      const btn = $("#runDisc");
      btn.disabled = true;
      btn.textContent = "Searching…";
      try {
        const { added } = await window.API.runDiscovery(15);
        toast(added && added.length ? `Added ${added.length} new candidate${added.length === 1 ? "" : "s"}` : "No new candidates this run");
        await loadQueue(discoveryCache.status || "pending");
      } catch (e) {
        toast("Discovery failed: " + e.message);
      }
      btn.disabled = false;
      btn.textContent = "Run discovery now";
    });

    $("#addByUrlTop").addEventListener("click", () => openAddByUrlModal());

    loadQueue(discoveryCache.status || "pending");
  }

  function makeDiscoveryCard(rec) {
    const lead = rec.lead;
    const score = S.scoreLead(lead);
    const band = S.scoreBand(score);
    const host = (() => {
      try { return new URL(lead.website).hostname.replace(/^www\./, ""); } catch { return lead.website; }
    })();

    const card = el(`<div class="card pad">
      <div class="row-between" style="gap:16px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="lead-name" style="font-size:18px">${esc(lead.name)}</div>
          <div class="lead-sub"><a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(host)} ↗</a> · ${esc(lead.niche || "—")}${lead.location ? " · " + esc(lead.location) : ""}${lead.size ? " · " + esc(lead.size) : ""}</div>
          ${lead.tags && lead.tags.length ? `<div class="tags" style="margin-top:8px">${lead.tags.slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
        </div>
        <div style="text-align:right;flex:0 0 auto">
          <span class="score ${band}"><span class="dot"></span>${score}</span>
        </div>
      </div>

      ${lead.rationale ? `<p class="muted small" style="margin-top:12px">${esc(lead.rationale)}</p>` : ""}

      <details style="margin-top:12px">
        <summary class="muted small" style="cursor:pointer">Draft outreach</summary>
        <div class="card pad" style="margin-top:8px;background:var(--soft, transparent)">
          <pre style="white-space:pre-wrap;font-family:inherit;margin:0;font-size:14px">${esc(lead.draftMessage || "—")}</pre>
          ${lead.draftMessage ? `<div style="margin-top:8px"><button class="btn btn-sm" data-act="copy">Copy draft</button></div>` : ""}
        </div>
      </details>

      <div class="row-between" style="margin-top:14px;gap:8px">
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" data-act="snooze">Snooze 14d</button>
          <button class="btn btn-sm" data-act="reject">Reject</button>
        </div>
        <button class="btn btn-primary btn-sm" data-act="confirm">Confirm → Leads</button>
      </div>
    </div>`);

    function actionBtn(name) { return $(`button[data-act="${name}"]`, card); }

    const copyBtn = actionBtn("copy");
    if (copyBtn) copyBtn.addEventListener("click", () => copyText(lead.draftMessage, "Draft copied"));

    actionBtn("snooze").addEventListener("click", async () => {
      try {
        await window.API.snooze(rec.id, 14);
        discoveryCache.items = (discoveryCache.items || []).filter((x) => x.id !== rec.id);
        toast("Snoozed 14 days");
        render();
      } catch (e) { toast("Snooze failed: " + e.message); }
    });

    actionBtn("reject").addEventListener("click", async () => {
      try {
        await window.API.reject(rec.id);
        discoveryCache.items = (discoveryCache.items || []).filter((x) => x.id !== rec.id);
        toast("Rejected");
        render();
      } catch (e) { toast("Reject failed: " + e.message); }
    });

    actionBtn("confirm").addEventListener("click", async () => {
      try {
        await window.API.confirm(rec.id);
        const created = S.addLead({
          name: lead.name,
          website: lead.website,
          niche: lead.niche,
          location: lead.location,
          size: lead.size,
          services: lead.services || [],
          tags: lead.tags || [],
          notes: lead.notes || "",
          source: lead.source || "AI discovery",
          status: lead.status || "Ready to contact",
          signals: lead.signals || {},
        });
        if (lead.draftMessage) {
          S.addActivity(created.id, {
            type: "draft",
            channel: "Email",
            direction: "out",
            summary: lead.draftMessage,
          });
        }
        discoveryCache.items = (discoveryCache.items || []).filter((x) => x.id !== rec.id);
        toast("Added to Leads");
        render();
      } catch (e) { toast("Confirm failed: " + e.message); }
    });

    return card;
  }

  function lead_priority_star(l) {
    return l.priority ? '<span class="star" title="Priority">★</span> ' : "";
  }
  function makeTagChip(value, label) {
    const c = el(`<button class="fchip ${leadFilters.tag === value ? "active" : ""}">${esc(label)}</button>`);
    c.addEventListener("click", () => { leadFilters.tag = value; render(); });
    return c;
  }
  function uniqueTags(leads) {
    const set = new Set();
    leads.forEach((l) => (l.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }

  let rerenderTimer = null;
  function debouncedRerender() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      // re-render only the table portion by re-rendering the view but keep focus
      const active = document.activeElement;
      const selStart = active && active.selectionStart;
      render();
      const s = $("#leadSearch");
      if (s) { s.focus(); try { s.setSelectionRange(selStart, selStart); } catch (e) {} }
    }, 160);
  }

  // =========================================================================
  //  CONTACTS — all contacts across all leads in one table.
  // =========================================================================
  function renderContacts(view) {
    const st = S.getState();
    const leadById = Object.fromEntries(st.leads.map((l) => [l.id, l]));

    // A lead qualifies its contacts for this page if a meeting was booked
    // (status reached Call booked or further along the funnel) OR if the
    // lead has at least one opportunity logged.
    const MEETING_STATUSES = new Set(["Call booked", "Proposal sent", "Won"]);
    const leadOppsById = {};
    st.leads.forEach((l) => (leadOppsById[l.id] = S.opportunitiesFor(l.id)));
    const leadQualifies = (l) =>
      MEETING_STATUSES.has(l.status) || (leadOppsById[l.id] || []).length > 0;
    const hasPastProject = (l) =>
      (leadOppsById[l.id] || []).some((o) => o.stage === "Won");

    // Total contacts saved overall vs. the filtered subset shown on this page.
    const qualifyingContactCount = st.contacts.filter((c) => {
      const l = leadById[c.leadId];
      return l && leadQualifies(l);
    }).length;
    const hiddenCount = st.contacts.length - qualifyingContactCount;

    view.appendChild(
      el(`<div class="page-head">
        <div>
          <h1 class="page-title">Contacts</h1>
          <p class="page-sub">${qualifyingContactCount} contact${qualifyingContactCount === 1 ? "" : "s"} from booked meetings or active projects${hiddenCount > 0 ? ` · <span class="muted">${hiddenCount} hidden until their lead progresses</span>` : ""}.</p>
        </div>
        <div class="head-actions"><button class="btn btn-primary" id="addContactTop">+ New contact</button></div>
      </div>`)
    );

    const tb = el(`<div class="toolbar">
      <div class="search"><input class="input" id="contactSearch" placeholder="Search name, role, email, agency…" value="${esc(contactFilters.q)}" /></div>
      <select class="select" id="contactSort"></select>
    </div>`);
    const sb = $("#contactSort", tb);
    [["name", "Sort: Name A–Z"], ["agency", "Sort: Agency A–Z"], ["role", "Sort: Role"]].forEach(([v, label]) =>
      sb.appendChild(el(`<option value="${v}" ${contactFilters.sort === v ? "selected" : ""}>${label}</option>`))
    );
    view.appendChild(tb);

    // Build rows: only contacts whose lead still exists and qualifies.
    let rows = st.contacts
      .map((c) => ({ contact: c, lead: leadById[c.leadId] }))
      .filter((r) => r.lead && leadQualifies(r.lead));

    const q = contactFilters.q.toLowerCase().trim();
    if (q) {
      rows = rows.filter((r) => {
        const c = r.contact, l = r.lead;
        const blob = `${c.name} ${c.role} ${c.email} ${c.linkedin} ${c.instagram} ${l.name} ${l.niche}`.toLowerCase();
        return blob.includes(q);
      });
    }

    rows.sort((a, b) => {
      if (contactFilters.sort === "agency") return a.lead.name.localeCompare(b.lead.name);
      if (contactFilters.sort === "role") return (a.contact.role || "").localeCompare(b.contact.role || "");
      return (a.contact.name || "").localeCompare(b.contact.name || "");
    });

    if (!rows.length) {
      const emptyTitle = q
        ? "No contacts match"
        : qualifyingContactCount === 0 && st.contacts.length > 0
          ? "No qualifying contacts yet"
          : "No contacts yet";
      const emptyBody = q
        ? "Try clearing the search."
        : qualifyingContactCount === 0 && st.contacts.length > 0
          ? `${st.contacts.length} contact${st.contacts.length === 1 ? "" : "s"} are saved on leads that haven't booked a meeting or opened a project yet. They'll appear here once the lead reaches <strong>Call booked</strong> or gets an opportunity.`
          : "Open any lead and use <strong>+ Add contact</strong>, or click <strong>+ New contact</strong> above.";
      view.appendChild(
        el(`<div class="card"><div class="empty">
          <div class="em-ico">◉</div>
          <h3>${emptyTitle}</h3>
          <p>${emptyBody}</p>
        </div></div>`)
      );
    } else {
      const wrap = el(`<div class="table-wrap"><table class="leads"><thead><tr>
        <th>Name</th><th>Role</th><th>Agency</th><th>Past project</th><th>Email</th><th>Links</th>
      </tr></thead><tbody></tbody></table></div>`);
      const tbody = $("tbody", wrap);
      rows.forEach(({ contact, lead }) => {
        const links = [];
        if (contact.linkedin) links.push(`<a href="${esc(contact.linkedin)}" target="_blank" rel="noopener" title="LinkedIn" onclick="event.stopPropagation()">in</a>`);
        if (contact.instagram) links.push(`<a href="${esc(contact.instagram)}" target="_blank" rel="noopener" title="Instagram" onclick="event.stopPropagation()">ig</a>`);
        const email = contact.email
          ? `<a href="mailto:${esc(contact.email)}" onclick="event.stopPropagation()">${esc(contact.email)}</a>`
          : '<span class="muted small">—</span>';
        const pastProject = hasPastProject(lead)
          ? '<span class="pill s-won" title="At least one Won opportunity">✓ Yes</span>'
          : '<span class="muted small">—</span>';
        const tr = el(`<tr>
          <td><div class="lead-name">${esc(contact.name || "—")}</div></td>
          <td>${esc(contact.role || "—")}</td>
          <td><div class="lead-name">${esc(lead.name)}</div><div class="lead-sub">${esc(lead.niche || "")}</div></td>
          <td>${pastProject}</td>
          <td>${email}</td>
          <td><div class="tags">${links.join("") || '<span class="muted small">—</span>'}</div></td>
        </tr>`);
        tr.addEventListener("click", () => openLead(lead.id));
        tbody.appendChild(tr);
      });
      view.appendChild(wrap);
    }

    const search = $("#contactSearch", tb);
    search.addEventListener("input", () => {
      contactFilters.q = search.value;
      clearTimeout(contactRerenderTimer);
      contactRerenderTimer = setTimeout(() => {
        render();
        const s = $("#contactSearch");
        if (s) { s.focus(); try { s.setSelectionRange(s.value.length, s.value.length); } catch (e) {} }
      }, 160);
    });
    sb.addEventListener("change", () => { contactFilters.sort = sb.value; render(); });
    $("#addContactTop").addEventListener("click", () => openNewContactPicker());
  }

  let contactRerenderTimer = null;

  // Prompts the user to pick a lead, then opens it on the contacts tab of the
  // lead detail. Lighter than building a separate "new contact" modal.
  function openNewContactPicker() {
    const st = S.getState();
    if (!st.leads.length) return toast("Add a lead first");

    const panel = el(`<div></div>`);
    panel.appendChild(el(`<div class="modal-head">
      <h2 class="modal-title">Pick the agency</h2>
      <button class="x" id="px">✕</button>
    </div>`));
    panel.appendChild(el(`<div class="form-grid">
      <div class="field full">
        <label>Which agency is this contact for?</label>
        <select class="select" id="pickLead" style="width:100%"></select>
        <p class="muted small" style="margin-top:6px">You'll add the contact's details on the next screen.</p>
      </div>
    </div>`));
    panel.appendChild(el(`<div class="modal-foot">
      <button class="btn" id="pCancel">Cancel</button>
      <button class="btn btn-primary" id="pGo">Continue</button>
    </div>`));

    const sel = $("#pickLead", panel);
    st.leads
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((l) => sel.appendChild(el(`<option value="${l.id}">${esc(l.name)}</option>`)));

    openModal(panel);
    $("#px", panel).addEventListener("click", closeModal);
    $("#pCancel", panel).addEventListener("click", closeModal);
    $("#pGo", panel).addEventListener("click", () => {
      const leadId = sel.value;
      closeModal();
      openLead(leadId);
    });
  }

  // =========================================================================
  //  PIPELINE (kanban)
  // =========================================================================
  let dragLeadId = null;
  function renderPipeline(view) {
    const st = S.getState();
    view.appendChild(
      el(`<div class="page-head">
        <div><h1 class="page-title">Pipeline</h1><p class="page-sub">Drag a card to move it through your stages.</p></div>
        <div class="head-actions"><button class="btn btn-primary" id="addLeadTop">+ New lead</button></div>
      </div>`)
    );

    const board = el(`<div class="board"></div>`);
    S.STAGES.forEach((stage) => {
      const inStage = st.leads.filter((l) => S.stageOf(l) === stage);
      const col = el(`<div class="col" data-stage="${stage}">
        <div class="col-head"><h3>${stage}</h3><span class="col-count">${inStage.length}</span></div>
        <div class="col-body"></div>
      </div>`);
      const body = $(".col-body", col);
      inStage.forEach((l) => body.appendChild(makeKanbanCard(l)));

      // drop handlers
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drop-target"); });
      col.addEventListener("dragleave", () => col.classList.remove("drop-target"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("drop-target");
        if (dragLeadId) {
          S.setLeadStage(dragLeadId, stage);
          toast(`Moved to ${stage}`);
        }
      });
      board.appendChild(col);
    });
    view.appendChild(board);
    $("#addLeadTop").addEventListener("click", () => openLeadForm());
  }

  function makeKanbanCard(l) {
    const score = S.scoreLead(l);
    const band = S.scoreBand(score);
    const opps = S.opportunitiesFor(l.id).filter((o) => o.stage !== "Lost");
    const oppVal = opps.reduce((s, o) => s + (Number(o.value) || 0), 0);
    const card = el(`<div class="kcard" draggable="true">
      <div class="kname">${lead_priority_star(l)}${esc(l.name)}</div>
      <div class="kmeta">${esc(l.niche || "")}</div>
      <div class="krow">
        <span class="score ${band}"><span class="dot"></span>${score}</span>
        ${oppVal ? `<span class="muted small">${money(oppVal)}</span>` : ""}
      </div>
    </div>`);
    card.addEventListener("dragstart", () => { dragLeadId = l.id; card.classList.add("dragging"); });
    card.addEventListener("dragend", () => { dragLeadId = null; card.classList.remove("dragging"); });
    card.addEventListener("click", () => openLead(l.id));
    return card;
  }

  // =========================================================================
  //  PROMPTS
  // =========================================================================
  let promptLeadId = null;
  let promptTplId = "cold_email";
  function renderPrompts(view) {
    const st = S.getState();
    view.appendChild(
      el(`<div class="page-head">
        <div><h1 class="page-title">AI Prompts</h1><p class="page-sub">Pick a lead + a template. Copy the prompt into Claude or Perplexity.</p></div>
      </div>`)
    );

    if (!promptLeadId && st.leads.length) promptLeadId = st.leads[0].id;

    const layout = el(`<div class="prompt-layout"></div>`);

    // left column: template list grouped by category
    const left = el(`<div><div class="prompt-list" id="tplList"></div></div>`);
    const tplList = $("#tplList", left);
    const cats = [];
    P.TEMPLATES.forEach((t) => { if (!cats.includes(t.category)) cats.push(t.category); });
    cats.forEach((cat) => {
      tplList.appendChild(el(`<div class="cat-label">${esc(cat)}</div>`));
      P.TEMPLATES.filter((t) => t.category === cat).forEach((t) => {
        const b = el(`<button class="prompt-pick ${t.id === promptTplId ? "active" : ""}">
          <div class="pp-title">${esc(t.title)}</div>
          <div class="pp-cat">${t.needsLead ? "lead-specific" : "general"}</div>
        </button>`);
        b.addEventListener("click", () => { promptTplId = t.id; render(); });
        tplList.appendChild(b);
      });
    });
    layout.appendChild(left);

    // right column: lead picker + output
    const tpl = P.TEMPLATES.find((t) => t.id === promptTplId) || P.TEMPLATES[0];
    const right = el(`<div class="card pad"></div>`);

    const picker = el(`<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div class="inline">
        <label class="muted small">Lead</label>
        <select class="select" id="promptLead" ${tpl.needsLead ? "" : "disabled"}></select>
      </div>
      <div class="muted small">${esc(tpl.hint || "")}</div>
    </div>`);
    const pl = $("#promptLead", picker);
    if (!st.leads.length) pl.appendChild(el(`<option>No leads yet</option>`));
    st.leads.forEach((l) => pl.appendChild(el(`<option value="${l.id}" ${l.id === promptLeadId ? "selected" : ""}>${esc(l.name)}</option>`)));
    right.appendChild(picker);

    const lead = tpl.needsLead ? S.getLead(promptLeadId) : null;
    const contact = lead ? S.primaryContact(lead.id) : null;
    const vars = P.variablesFor(lead, contact);
    const text = P.fill(tpl.body, vars);

    right.appendChild(el(`<div class="prompt-output" id="promptOut">${esc(text)}</div>`));
    const actions = el(`<div class="inline" style="margin-top:14px">
      <button class="btn btn-primary" id="copyPrompt">⧉ Copy prompt</button>
      ${lead ? `<button class="btn" id="saveDraft">Log as draft on ${esc(lead.name)}</button>` : ""}
    </div>`);
    right.appendChild(actions);
    layout.appendChild(right);
    view.appendChild(layout);

    // wire
    if (!pl.disabled) pl.addEventListener("change", () => { promptLeadId = pl.value; render(); });
    $("#copyPrompt").addEventListener("click", () => copyText(text, "Prompt copied"));
    const sd = $("#saveDraft");
    if (sd) sd.addEventListener("click", () => {
      S.addActivity(lead.id, { type: "note", channel: "Draft", direction: "out", summary: `Generated "${tpl.title}" draft.\n\n${text.slice(0, 400)}${text.length > 400 ? "…" : ""}` });
      toast("Saved to lead's outreach log");
    });
  }

  // =========================================================================
  //  DATA (import / export / settings)
  // =========================================================================
  function renderData(view) {
    const st = S.getState();
    view.appendChild(
      el(`<div class="page-head"><div><h1 class="page-title">Data</h1><p class="page-sub">Everything is stored locally in your browser. Back it up anytime.</p></div></div>`)
    );

    const grid = el(`<div class="grid-2"></div>`);

    const backup = el(`<div class="card pad">
      <h2 class="section-title">Backup & restore</h2>
      <p class="muted small" style="margin-top:4px">Full JSON snapshot of leads, contacts, activities, opportunities and tasks.</p>
      <div class="inline" style="margin-top:14px">
        <button class="btn btn-primary" id="expJSON">⤓ Export JSON</button>
        <button class="btn" id="impJSONBtn">⤒ Import JSON</button>
        <input type="file" id="impJSON" accept="application/json" hidden />
      </div>
    </div>`);
    grid.appendChild(backup);

    const csv = el(`<div class="card pad">
      <h2 class="section-title">CSV (leads)</h2>
      <p class="muted small" style="margin-top:4px">Round-trip with spreadsheets or prospecting tools. Columns: name, website, niche, tags, status, contactName, contactEmail…</p>
      <div class="inline" style="margin-top:14px">
        <button class="btn btn-primary" id="expCSV">⤓ Export leads CSV</button>
        <button class="btn" id="impCSVBtn">⤒ Import leads CSV</button>
        <input type="file" id="impCSV" accept=".csv,text/csv" hidden />
      </div>
    </div>`);
    grid.appendChild(csv);

    view.appendChild(grid);

    const danger = el(`<div class="card pad" style="margin-top:16px">
      <h2 class="section-title">Sample & reset</h2>
      <p class="muted small" style="margin-top:4px">${st.leads.length} leads currently stored.</p>
      <div class="inline" style="margin-top:14px">
        <button class="btn" id="loadSample">Reload sample data</button>
        <button class="btn btn-danger" id="clearAll">Clear everything</button>
      </div>
    </div>`);
    view.appendChild(danger);

    const stats = el(`<div class="card pad" style="margin-top:16px">
      <h2 class="section-title">Where AI plugs in later</h2>
      <p class="muted small" style="margin-top:6px;max-width:60ch">Right now the app generates copy-ready prompts you paste into Claude or Perplexity — zero API keys, fully private. When you're ready to automate, the <span class="kbd">automation-roadmap.md</span> file explains how to wire a real Claude API call behind the "Copy prompt" buttons, auto-import leads from prospecting tools, and connect email sending. The data model is already shaped for it.</p>
    </div>`);
    view.appendChild(stats);

    // wire
    $("#expJSON").addEventListener("click", () => download("agencyflow-backup.json", S.exportJSON(), "application/json"));
    $("#impJSONBtn").addEventListener("click", () => $("#impJSON").click());
    $("#impJSON").addEventListener("change", (e) => readFile(e, (text) => {
      try { S.importJSON(text); toast("Data imported"); go("dashboard"); }
      catch (err) { toast("Couldn't read that JSON file"); }
    }));
    $("#expCSV").addEventListener("click", () => download("agencyflow-leads.csv", S.exportLeadsCSV(), "text/csv"));
    $("#impCSVBtn").addEventListener("click", () => $("#impCSV").click());
    $("#impCSV").addEventListener("change", (e) => readFile(e, (text) => {
      const n = S.importLeadsCSV(text);
      toast(`Imported ${n} lead${n === 1 ? "" : "s"}`);
      go("leads");
    }));
    $("#loadSample").addEventListener("click", () => {
      if (confirm("Replace current data with the sample set?")) { S.reset(); toast("Sample data loaded"); go("dashboard"); }
    });
    $("#clearAll").addEventListener("click", () => {
      if (confirm("Delete ALL data? This cannot be undone.")) { S.clearAll(); toast("All data cleared"); go("leads"); }
    });
  }

  // =========================================================================
  //  LEAD DETAIL (modal)
  // =========================================================================
  function openLead(id) {
    currentLeadId = id;
    const lead = S.getLead(id);
    if (!lead) return;
    renderLeadDetail();
  }

  function renderLeadDetail() {
    const lead = S.getLead(currentLeadId);
    if (!lead) return closeModal();
    const score = S.scoreLead(lead);
    const band = S.scoreBand(score);
    const contacts = S.contactsFor(lead.id);
    const activities = S.activitiesFor(lead.id);
    const opps = S.opportunitiesFor(lead.id);
    const tasks = S.tasksFor(lead.id).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const action = S.nextAction(lead);

    const panel = el(`<div></div>`);

    panel.appendChild(el(`<div class="modal-head">
      <div>
        <div class="inline" style="margin-bottom:4px">
          <span class="pill ${stageClass(S.stageOf(lead))}">${esc(lead.status)}</span>
          <span class="score ${band}"><span class="dot"></span>${score} fit</span>
          ${lead.priority ? '<span class="star">★ Priority</span>' : ""}
        </div>
        <h2 class="modal-title">${esc(lead.name)}</h2>
        <div class="muted small">${esc(lead.niche || "")}${lead.location ? " · " + esc(lead.location) : ""}${lead.website ? ` · <a href="${esc(lead.website)}" target="_blank" rel="noopener">website ↗</a>` : ""}</div>
      </div>
      <div class="inline">
        <button class="btn btn-sm" id="editLead">Edit</button>
        <button class="x" id="closeModal" aria-label="Close">✕</button>
      </div>
    </div>`));

    // quick action bar
    const bar = el(`<div class="card pad" style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><div class="muted small">Suggested next action</div><div style="font-weight:600">${esc(action.label)}${action.due ? ` · <span class="muted">${relDay(action.due)}</span>` : ""}</div></div>
      <div class="inline">
        <select class="select" id="quickStatus"></select>
        <button class="btn btn-primary btn-sm" id="goPrompt">✦ Generate outreach</button>
      </div>
    </div>`);
    const qs = $("#quickStatus", bar);
    S.STATUSES.forEach((s) => qs.appendChild(el(`<option ${s === lead.status ? "selected" : ""}>${s}</option>`)));
    panel.appendChild(bar);

    const wrap = el(`<div class="detail-wrap"></div>`);

    // LEFT: overview, contacts, opportunities
    const left = el(`<div></div>`);

    // overview
    left.appendChild(el(`<div class="detail-block">
      <div class="subhead"><h3 class="section-title">Overview</h3></div>
      <dl class="dl">
        <dt>Niche</dt><dd>${esc(lead.niche || "—")}</dd>
        <dt>Size</dt><dd>${esc(lead.size || "—")}</dd>
        <dt>Services</dt><dd>${(lead.services || []).map((s) => esc(s)).join(", ") || "—"}</dd>
        <dt>Tags</dt><dd><div class="tags">${(lead.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("") || "—"}</div></dd>
        <dt>Source</dt><dd>${esc(lead.source || "—")}</dd>
        <dt>Added</dt><dd>${fmtDate(lead.dateAdded)}</dd>
        <dt>Follow-up</dt><dd>${lead.followUpDate ? fmtDate(lead.followUpDate) + ` <span class="muted small">(${relDay(lead.followUpDate)})</span>` : "—"}</dd>
      </dl>
    </div>`));

    // notes
    left.appendChild(el(`<div class="detail-block">
      <div class="subhead"><h3 class="section-title">Notes</h3></div>
      <textarea class="input" id="leadNotes" rows="3" placeholder="Research notes, hooks, anything to remember…">${esc(lead.notes || "")}</textarea>
    </div>`));

    // contacts
    const contactBlock = el(`<div class="detail-block"><div class="subhead"><h3 class="section-title">Contacts</h3></div><div id="contactList"></div></div>`);
    const cl = $("#contactList", contactBlock);
    contacts.forEach((c) => {
      const card = el(`<div class="contact-card">
        <div class="row-between"><div class="cc-name">${esc(c.name || "Unnamed")} ${c.role ? `<span class="muted small">· ${esc(c.role)}</span>` : ""}</div>
        <button class="x" data-del="${c.id}" title="Remove">✕</button></div>
        <div class="muted small">${c.email ? esc(c.email) + " · " : ""}${c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}${c.instagram ? " · " + esc(c.instagram) : ""}</div>
      </div>`);
      $("[data-del]", card).addEventListener("click", () => { S.deleteContact(c.id); });
      cl.appendChild(card);
    });
    const cform = el(`<div class="miniform">
      <input class="input" id="cName" placeholder="Name" />
      <input class="input" id="cRole" placeholder="Role" />
      <input class="input" id="cEmail" placeholder="Email" />
      <button class="btn btn-sm" id="addContact">Add</button>
    </div>`);
    contactBlock.appendChild(cform);
    left.appendChild(contactBlock);

    // opportunities
    const oppBlock = el(`<div class="detail-block"><div class="subhead"><h3 class="section-title">Opportunities</h3><button class="btn btn-sm" id="addOpp">+ Add</button></div><div id="oppList"></div></div>`);
    const ol = $("#oppList", oppBlock);
    if (!opps.length) ol.appendChild(el(`<p class="muted small">No opportunities yet. Add a test project, retainer, or overflow arrangement.</p>`));
    opps.forEach((o) => ol.appendChild(makeOppCard(o)));
    left.appendChild(oppBlock);

    wrap.appendChild(left);

    // RIGHT: outreach log, follow-ups
    const right = el(`<div></div>`);

    // tasks / follow-ups
    const taskBlock = el(`<div class="detail-block"><div class="subhead"><h3 class="section-title">Follow-ups</h3></div><div id="taskList"></div></div>`);
    const tl = $("#taskList", taskBlock);
    if (!tasks.length) tl.appendChild(el(`<p class="muted small">No tasks. Add one below.</p>`));
    tasks.forEach((t) => {
      const dueCls = S.isOverdue(t.dueDate) ? "over" : S.isToday(t.dueDate) ? "today" : "";
      const r = el(`<div class="task-row ${t.done ? "done" : ""}">
        <input type="checkbox" ${t.done ? "checked" : ""} />
        <div class="action-main"><div class="tt">${esc(t.title)}</div></div>
        <span class="due ${dueCls}">${t.dueDate ? relDay(t.dueDate) : ""}</span>
        <button class="x" data-del="${t.id}">✕</button>
      </div>`);
      $("input", r).addEventListener("change", () => S.toggleTask(t.id));
      $("[data-del]", r).addEventListener("click", () => S.deleteTask(t.id));
      tl.appendChild(r);
    });
    const tform = el(`<div class="miniform">
      <input class="input" id="tTitle" placeholder="Next step…" />
      <input class="input" id="tDate" type="date" value="${S.todayISO()}" style="flex:0 0 auto" />
      <button class="btn btn-sm" id="addTask">Add</button>
    </div>`);
    taskBlock.appendChild(tform);
    right.appendChild(taskBlock);

    // outreach / conversation log
    const logBlock = el(`<div class="detail-block"><div class="subhead"><h3 class="section-title">Outreach &amp; conversation log</h3></div><div class="timeline" id="timeline"></div></div>`);
    const tlEl = $("#timeline", logBlock);
    if (!activities.length) tlEl.appendChild(el(`<p class="muted small">Nothing logged yet. Record sent emails, replies, calls and notes here.</p>`));
    activities.forEach((a) => {
      const item = el(`<div class="tl-item">
        <div class="tl-dot ${a.direction === "in" ? "in" : ""}"></div>
        <div>
          <div class="row-between"><strong class="small">${esc(a.channel)}${a.direction === "in" ? " · reply" : ""}</strong><span class="tl-meta">${fmtDate(a.date)}</span></div>
          <div class="small" style="white-space:pre-wrap;margin-top:2px">${esc(a.summary)}</div>
          <button class="btn btn-ghost btn-sm" data-del="${a.id}" style="margin-top:4px;padding:2px 6px">Delete</button>
        </div>
      </div>`);
      $("[data-del]", item).addEventListener("click", () => S.deleteActivity(a.id));
      tlEl.appendChild(item);
    });
    const aform = el(`<div style="margin-top:12px">
      <div class="miniform" style="margin-top:0">
        <select class="select" id="aChannel" style="min-width:120px">
          <option>Email</option><option>LinkedIn</option><option>Instagram</option><option>Call</option><option>Note</option>
        </select>
        <select class="select" id="aDir" style="min-width:110px"><option value="out">Outbound</option><option value="in">Inbound</option></select>
      </div>
      <div class="miniform">
        <input class="input" id="aSummary" placeholder="What happened? (e.g. Sent cold email)" />
        <button class="btn btn-sm" id="addActivity">Log</button>
      </div>
    </div>`);
    logBlock.appendChild(aform);
    right.appendChild(logBlock);

    wrap.appendChild(right);
    panel.appendChild(wrap);

    // footer
    panel.appendChild(el(`<div class="modal-foot">
      <button class="btn btn-danger" id="deleteLead">Delete lead</button>
      <button class="btn" id="closeModal2">Close</button>
    </div>`));

    openModal(panel);

    // ---- wire detail interactions ----
    $("#closeModal", panel).addEventListener("click", closeModal);
    $("#closeModal2", panel).addEventListener("click", closeModal);
    $("#editLead", panel).addEventListener("click", () => openLeadForm(lead.id));
    $("#goPrompt", panel).addEventListener("click", () => { promptLeadId = lead.id; closeModal(); go("prompts"); });

    qs.addEventListener("change", () => S.updateLead(lead.id, { status: qs.value }));

    const notes = $("#leadNotes", panel);
    notes.addEventListener("change", () => S.updateLead(lead.id, { notes: notes.value }));

    $("#addContact", panel).addEventListener("click", () => {
      const name = $("#cName", panel).value.trim();
      const role = $("#cRole", panel).value.trim();
      const email = $("#cEmail", panel).value.trim();
      if (!name && !email) return toast("Add a name or email");
      S.addContact(lead.id, { name, role, email });
    });

    $("#addOpp", panel).addEventListener("click", () => {
      S.addOpportunity(lead.id, { name: "Test project", value: 300, probability: 30, stage: "Replied" });
    });

    $("#addTask", panel).addEventListener("click", () => {
      const title = $("#tTitle", panel).value.trim();
      const date = $("#tDate", panel).value;
      if (!title) return toast("Describe the next step");
      S.addTask(lead.id, { title, dueDate: date });
    });

    $("#addActivity", panel).addEventListener("click", () => {
      const summary = $("#aSummary", panel).value.trim();
      if (!summary) return toast("Add a quick note");
      S.addActivity(lead.id, { channel: $("#aChannel", panel).value, direction: $("#aDir", panel).value, summary, type: "note" });
    });

    $("#deleteLead", panel).addEventListener("click", () => {
      if (confirm(`Delete ${lead.name} and all its data?`)) { S.deleteLead(lead.id); closeModal(); }
    });
  }

  function makeOppCard(o) {
    const card = el(`<div class="opp-card">
      <div class="oc-head"><strong>${esc(o.name)}</strong><span class="opp-val">${money(o.value)}</span></div>
      <div class="muted small" style="margin-top:2px">${esc(o.stage)} · ${o.probability}% · close ${o.expectedClose ? fmtDate(o.expectedClose) : "—"}</div>
      <div class="bar"><span style="width:${Math.min(100, Number(o.probability) || 0)}%"></span></div>
      ${o.notes ? `<div class="small muted" style="margin-top:6px">${esc(o.notes)}</div>` : ""}
      <div class="inline" style="margin-top:8px">
        <button class="btn btn-ghost btn-sm" data-edit>Edit</button>
        <button class="btn btn-ghost btn-sm btn-danger" data-del>Delete</button>
      </div>
    </div>`);
    $("[data-del]", card).addEventListener("click", () => S.deleteOpportunity(o.id));
    $("[data-edit]", card).addEventListener("click", () => openOppForm(o));
    return card;
  }

  // ---- Opportunity edit form (small modal-in-modal via prompt-ish form) ----
  function openOppForm(o) {
    const panel = el(`<div></div>`);
    panel.appendChild(el(`<div class="modal-head"><h2 class="modal-title">Edit opportunity</h2><button class="x" id="ox">✕</button></div>`));
    const form = el(`<div class="form-grid">
      <div class="field full"><label>Name</label><input class="input" id="oName" value="${esc(o.name)}" /></div>
      <div class="field"><label>Estimated value ($)</label><input class="input" id="oVal" type="number" value="${esc(o.value)}" /></div>
      <div class="field"><label>Probability (%)</label><input class="input" id="oProb" type="number" min="0" max="100" value="${esc(o.probability)}" /></div>
      <div class="field"><label>Stage</label><select class="select" id="oStage" style="width:100%"></select></div>
      <div class="field"><label>Expected close</label><input class="input" id="oClose" type="date" value="${esc(o.expectedClose || "")}" /></div>
      <div class="field full"><label>Notes</label><textarea class="input" id="oNotes" rows="2">${esc(o.notes || "")}</textarea></div>
    </div>`);
    const os = $("#oStage", form);
    S.OPP_STAGES.forEach((s) => os.appendChild(el(`<option ${s === o.stage ? "selected" : ""}>${s}</option>`)));
    panel.appendChild(form);
    panel.appendChild(el(`<div class="modal-foot"><button class="btn" id="oCancel">Cancel</button><button class="btn btn-primary" id="oSave">Save</button></div>`));
    openModal(panel);

    const back = () => renderLeadDetail();
    $("#ox", panel).addEventListener("click", back);
    $("#oCancel", panel).addEventListener("click", back);
    $("#oSave", panel).addEventListener("click", () => {
      S.updateOpportunity(o.id, {
        name: $("#oName", panel).value.trim() || "Opportunity",
        value: Number($("#oVal", panel).value) || 0,
        probability: Number($("#oProb", panel).value) || 0,
        stage: $("#oStage", panel).value,
        expectedClose: $("#oClose", panel).value,
        notes: $("#oNotes", panel).value,
      });
      renderLeadDetail();
    });
  }

  // =========================================================================
  //  LEAD FORM (add / edit)
  // =========================================================================
  function openLeadForm(id) {
    const editing = !!id;
    const lead = editing ? S.getLead(id) : {
      name: "", website: "", niche: "", location: "", size: "", services: [], tags: [],
      notes: "", source: "", status: "New", priority: false, followUpDate: "", signals: {},
    };
    const sig = Object.assign({}, lead.signals);

    const panel = el(`<div></div>`);
    panel.appendChild(el(`<div class="modal-head">
      <h2 class="modal-title">${editing ? "Edit lead" : "New lead"}</h2>
      <button class="x" id="lx">✕</button>
    </div>`));

    const form = el(`<div class="form-grid">
      <div class="field"><label>Agency name *</label><input class="input" id="fName" value="${esc(lead.name)}" placeholder="North Loop Studio" /></div>
      <div class="field"><label>Website</label><input class="input" id="fWebsite" value="${esc(lead.website)}" placeholder="https://…" /></div>
      <div class="field"><label>Niche / type</label><input class="input" id="fNiche" value="${esc(lead.niche)}" placeholder="Performance / paid social agency" /></div>
      <div class="field"><label>Location</label><input class="input" id="fLocation" value="${esc(lead.location)}" placeholder="Austin, TX / Remote" /></div>
      <div class="field"><label>Agency size</label><select class="select" id="fSize" style="width:100%"></select></div>
      <div class="field"><label>Source</label><input class="input" id="fSource" value="${esc(lead.source)}" placeholder="Instagram, referral, cold email…" /></div>
      <div class="field full"><label>Services offered <span class="muted tiny">(comma separated)</span></label><input class="input" id="fServices" value="${esc((lead.services || []).join(", "))}" placeholder="Paid social ads, UGC, brand films" /></div>
      <div class="field full"><label>Tags <span class="muted tiny">(comma separated)</span></label><input class="input" id="fTags" value="${esc((lead.tags || []).join(", "))}" placeholder="e-commerce, performance agency, short-form" />
        <div class="chip-row" id="tagSuggest" style="margin-top:6px"></div></div>
      <div class="field"><label>Status</label><select class="select" id="fStatus" style="width:100%"></select></div>
      <div class="field"><label>Follow-up date</label><input class="input" id="fFollow" type="date" value="${esc(lead.followUpDate || "")}" /></div>
      <div class="field full"><label>Notes</label><textarea class="input" id="fNotes" rows="3" placeholder="Something specific you noticed about their work…">${esc(lead.notes || "")}</textarea></div>
    </div>`);

    // size + status options
    const sizeSel = $("#fSize", form);
    ["", "Solo / micro (1–5)", "Small (6–15)", "Mid (16–40)", "Large (40+)"].forEach((s) =>
      sizeSel.appendChild(el(`<option ${s === lead.size ? "selected" : ""}>${s || "Select…"}</option>`))
    );
    const statSel = $("#fStatus", form);
    S.STATUSES.forEach((s) => statSel.appendChild(el(`<option ${s === lead.status ? "selected" : ""}>${s}</option>`)));

    // tag suggestions
    const tagSuggest = $("#tagSuggest", form);
    S.TAG_SUGGESTIONS.forEach((t) => {
      const c = el(`<button type="button" class="fchip">+ ${esc(t)}</button>`);
      c.addEventListener("click", () => {
        const input = $("#fTags", form);
        const cur = input.value.split(",").map((x) => x.trim()).filter(Boolean);
        if (!cur.includes(t)) cur.push(t);
        input.value = cur.join(", ");
      });
      tagSuggest.appendChild(c);
    });
    panel.appendChild(form);

    // scoring panel
    const scoreBox = el(`<div class="card pad" style="margin-top:16px">
      <div class="row-between"><h3 class="section-title">Fit score</h3><div><span class="score-preview" id="scoreNum">0</span><span class="muted">/100</span></div></div>
      <p class="muted small" style="margin:4px 0 10px">Check what's true — the score updates automatically.</p>
      <div id="sigList"></div>
      <label class="check" style="margin-top:6px;border-top:1px solid var(--line);padding-top:12px">
        <input type="checkbox" id="fPriority" ${lead.priority ? "checked" : ""} /> <span><strong>★ Priority lead</strong> — pin to the top of Today</span>
      </label>
    </div>`);
    const sigList = $("#sigList", scoreBox);
    Object.keys(S.SCORE_WEIGHTS).forEach((k) => {
      const row = el(`<label class="check"><input type="checkbox" data-sig="${k}" ${sig[k] ? "checked" : ""} /> <span>${esc(S.SCORE_LABELS[k])} <span class="muted tiny">+${S.SCORE_WEIGHTS[k]}</span></span></label>`);
      $("input", row).addEventListener("change", (e) => { sig[k] = e.target.checked; updateScore(); });
      sigList.appendChild(row);
    });
    panel.appendChild(scoreBox);

    function updateScore() {
      $("#scoreNum", scoreBox).textContent = S.scoreLead({ signals: sig });
    }
    updateScore();

    panel.appendChild(el(`<div class="modal-foot">
      <button class="btn" id="lCancel">Cancel</button>
      <button class="btn btn-primary" id="lSave">${editing ? "Save changes" : "Add lead"}</button>
    </div>`));

    openModal(panel);

    const close = () => (editing ? renderLeadDetail() : closeModal());
    $("#lx", panel).addEventListener("click", close);
    $("#lCancel", panel).addEventListener("click", close);

    $("#lSave", panel).addEventListener("click", () => {
      const name = $("#fName", panel).value.trim();
      if (!name) return toast("Agency name is required");
      const data = {
        name,
        website: $("#fWebsite", panel).value.trim(),
        niche: $("#fNiche", panel).value.trim(),
        location: $("#fLocation", panel).value.trim(),
        size: sizeSel.value,
        source: $("#fSource", panel).value.trim(),
        services: splitInput($("#fServices", panel).value),
        tags: splitInput($("#fTags", panel).value),
        status: statSel.value,
        followUpDate: $("#fFollow", panel).value,
        notes: $("#fNotes", panel).value,
        priority: $("#fPriority", panel).checked,
        signals: sig,
      };
      if (editing) {
        S.updateLead(id, data);
        toast("Lead updated");
        renderLeadDetail();
      } else {
        const created = S.addLead(data);
        toast("Lead added");
        openLead(created.id);
      }
    });
  }

  function splitInput(v) {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // =========================================================================
  //  Modal + toast + utilities
  // =========================================================================
  function openModal(content) {
    const root = $("#modalRoot");
    const panel = $("#modalPanel");
    panel.innerHTML = "";
    panel.appendChild(content);
    root.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modalRoot").hidden = true;
    $("#modalPanel").innerHTML = "";
    document.body.style.overflow = "";
    currentLeadId = null;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  function copyText(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(msg || "Copied")).catch(() => fallbackCopy(text, msg));
    } else fallbackCopy(text, msg);
  }
  function fallbackCopy(text, msg) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) { toast("Copy failed — select manually"); }
    document.body.removeChild(ta);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast("Downloaded " + filename);
  }
  function readFile(event, cb) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsText(file);
    event.target.value = "";
  }

  // =========================================================================
  //  Theme
  // =========================================================================
  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    const st = S.getState();
    st.settings.theme = theme;
    S.persist();
    const label = $(".theme-label");
    if (label) label.textContent = theme === "dark" ? "Light" : "Dark";
  }

  // =========================================================================
  //  Boot
  // =========================================================================
  function boot() {
    S.load();

    // Re-render the current view whenever data changes (keeps modal in sync).
    S.subscribe(() => {
      render();
      if (!$("#modalRoot").hidden && currentLeadId) renderLeadDetail();
    });

    // nav
    $$(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.route)));

    // theme
    applyTheme((S.getState().settings && S.getState().settings.theme) || "light");
    $("#themeToggle").addEventListener("click", () =>
      applyTheme(document.body.getAttribute("data-theme") === "dark" ? "light" : "dark")
    );

    // modal close on backdrop / escape
    $("#modalRoot").addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modalRoot").hidden) closeModal(); });

    go("today");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
