import { scoreUrl } from "./score.js";
import { hasCandidate, upsertCandidate, domainOf } from "./queue.js";
import { discoverFromBrave } from "./sources/brave.js";
import { discoverFromClutch } from "./sources/clutch.js";

function parseList(v, fallback) {
  if (!v) return fallback;
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Run a candidate URL through the scorer and enqueue if it passes basic checks.
async function processCandidate(env, urlInfo) {
  const domain = domainOf(urlInfo.url);
  if (!domain) return null;
  if (await hasCandidate(env, domain)) return null;

  let lead;
  try {
    lead = await scoreUrl(urlInfo.url, env);
  } catch (e) {
    console.warn("score failed for", urlInfo.url, e.message);
    return null;
  }

  // Skip if the model clearly didn't see an agency homepage.
  const fitFlags = ["ecommerceFocus", "doesShortForm", "doesBrandVideo", "rightSize"];
  const hits = fitFlags.filter((k) => lead.signals && lead.signals[k]).length;
  if (hits === 0) return null;

  lead.notes = lead.notes
    ? `${lead.notes}\n\nFound via: ${urlInfo.sourceQuery || "discovery"}`
    : `Found via: ${urlInfo.sourceQuery || "discovery"}`;

  return upsertCandidate(env, lead);
}

export async function runDiscovery(env, { limit = 25 } = {}) {
  const niches = parseList(env.DISCOVER_NICHES, [
    "performance marketing",
    "social media",
    "paid social",
    "video production",
    "creative",
    "brand",
    "DTC",
    "ecommerce",
  ]);
  const cities = parseList(env.DISCOVER_CITIES, [
    "Austin",
    "Los Angeles",
    "Brooklyn",
    "Miami",
    "Denver",
    "Chicago",
    "Portland",
    "Seattle",
    "Nashville",
    "Remote",
  ]);

  const [braveHits, clutchHits] = await Promise.all([
    discoverFromBrave(env, { niches, cities, limit: 25 }).catch((e) => {
      console.warn("brave source error", e);
      return [];
    }),
    discoverFromClutch(env, { limit: 15 }).catch((e) => {
      console.warn("clutch source error", e);
      return [];
    }),
  ]);

  const seen = new Set();
  const merged = [];
  for (const hit of [...braveHits, ...clutchHits]) {
    const host = domainOf(hit.url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    merged.push(hit);
  }

  const added = [];
  for (const hit of merged) {
    if (added.length >= limit) break;
    const rec = await processCandidate(env, hit);
    if (rec) added.push({ id: rec.id, name: rec.lead.name, website: rec.lead.website });
  }

  return added;
}
