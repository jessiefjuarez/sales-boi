// KV-backed candidate queue. Keys:
//   cand:<domain>     -> full candidate record (status: pending|confirmed|rejected|snoozed)
// We also store a small index list so we can list without prefix-scanning too much.
//
// Status transitions:
//   pending -> confirmed | rejected | snoozed
//   snoozed (after snoozeUntil < today) -> pending again on read

const KEY_PREFIX = "cand:";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function domainKey(domain) {
  return KEY_PREFIX + String(domain).toLowerCase();
}

export function domainOf(url) {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : "https://" + url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function hasCandidate(env, domain) {
  const v = await env.QUEUE.get(domainKey(domain));
  return !!v;
}

export async function upsertCandidate(env, candidate) {
  const domain = domainOf(candidate.website);
  if (!domain) return null;

  const existing = await env.QUEUE.get(domainKey(domain), "json");
  if (existing && existing.status !== "rejected") {
    // Don't clobber confirmed/snoozed records; let the user re-act.
    return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: domain,
    domain,
    status: "pending",
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    lead: candidate,
  };
  await env.QUEUE.put(domainKey(domain), JSON.stringify(record));
  return record;
}

export async function listQueue(env, { status = "pending" } = {}) {
  const out = [];
  let cursor;
  for (let i = 0; i < 10; i++) {
    const page = await env.QUEUE.list({ prefix: KEY_PREFIX, cursor });
    for (const k of page.keys) {
      const rec = await env.QUEUE.get(k.name, "json");
      if (!rec) continue;

      // Auto-reactivate snoozed candidates whose snooze date has passed.
      if (rec.status === "snoozed" && rec.snoozeUntil && rec.snoozeUntil <= todayISO()) {
        rec.status = "pending";
        delete rec.snoozeUntil;
        rec.updatedAt = new Date().toISOString();
        await env.QUEUE.put(k.name, JSON.stringify(rec));
      }

      if (status === "all" || rec.status === status) out.push(rec);
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return out;
}

export async function actOnCandidate(env, id, action, body = {}) {
  const key = domainKey(id);
  const rec = await env.QUEUE.get(key, "json");
  if (!rec) return { ok: false, error: "not found" };

  if (action === "confirm") {
    rec.status = "confirmed";
  } else if (action === "reject") {
    rec.status = "rejected";
  } else if (action === "snooze") {
    const days = Number(body.days) || 14;
    const d = new Date();
    d.setDate(d.getDate() + days);
    rec.status = "snoozed";
    rec.snoozeUntil = d.toISOString().slice(0, 10);
  } else {
    return { ok: false, error: "unknown action" };
  }
  rec.updatedAt = new Date().toISOString();
  await env.QUEUE.put(key, JSON.stringify(rec));
  return { ok: true, record: rec };
}
