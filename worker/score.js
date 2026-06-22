import { callClaude, parseJson } from "./claude.js";

// Strip a page down to something Claude can read cheaply.
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "";
}

function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : "";
}

function normaliseUrl(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.origin;
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `You evaluate creative/marketing agencies as potential clients for a remote freelance video editor.

The editor's ICP:
- Small to midsize creative, performance-marketing, social-media, or content-production agencies
- Agencies serving e-commerce / DTC / online brands
- Produce short-form video ads, social cuts, or longer brand/promo videos
- Likely to outsource overflow editing to freelancers (small enough not to staff in-house, busy enough to need help)
- Remote-friendly working style

Given an agency's homepage text, output STRICT JSON matching this exact shape (no commentary, no markdown fence):

{
  "name": "string — the agency name as they brand themselves",
  "niche": "string — short label like 'Performance marketing agency' or 'Social/UGC agency'",
  "location": "string — city, state/country if visible; '' if not",
  "size": "string — one of: '', 'Solo / micro (1–5)', 'Small (6–15)', 'Mid (16–40)', 'Large (40+)'",
  "services": ["string"],
  "tags": ["string — short tags from the set: e-commerce, performance agency, social agency, brand video, short-form, UGC, DTC, high-volume"],
  "notes": "string — 1–2 sentences: one specific thing about THIS agency worth referencing in outreach (a client, a campaign, a specialty). No fluff.",
  "signals": {
    "ecommerceFocus": boolean,
    "doesShortForm": boolean,
    "activeOutput": boolean,
    "rightSize": boolean,
    "remoteFriendly": boolean,
    "doesBrandVideo": boolean
  },
  "rationale": "string — 2–3 sentences explaining the fit verdict",
  "draftMessage": "string — a short cold email (under 120 words) referencing the specific 'notes' hook above. First person, plain language, no buzzwords. End with a low-friction CTA about overflow editing."
}

Signal definitions:
- ecommerceFocus: serves e-commerce / DTC / online retail brands
- doesShortForm: visibly produces short-form ad or social video
- activeOutput: appears to ship a lot (case studies, recent work, social cadence)
- rightSize: small-to-mid, likely to outsource overflow rather than staff in-house
- remoteFriendly: distributed team, remote work mentioned, or works with freelancers
- doesBrandVideo: longer brand / promo / story-driven video work shown`;

function userPromptFor(url, html) {
  const title = extractTitle(html);
  const desc = extractMeta(html, "description") || extractMeta(html, "og:description");
  const text = stripHtml(html).slice(0, 7000);
  return `URL: ${url}
Title: ${title}
Description: ${desc}

Homepage text (truncated):
${text}`;
}

const DEFAULT_SIGNALS = {
  ecommerceFocus: false,
  doesShortForm: false,
  activeOutput: false,
  rightSize: false,
  remoteFriendly: false,
  doesBrandVideo: false,
};

function normaliseLead(raw, website) {
  const signals = Object.assign({}, DEFAULT_SIGNALS, raw.signals || {});
  return {
    name: String(raw.name || "Untitled agency").trim().slice(0, 200),
    website,
    niche: String(raw.niche || "").trim().slice(0, 120),
    location: String(raw.location || "").trim().slice(0, 120),
    size: String(raw.size || "").trim(),
    services: Array.isArray(raw.services) ? raw.services.slice(0, 8).map(String) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 6).map(String) : [],
    notes: String(raw.notes || "").trim().slice(0, 600),
    signals,
    rationale: String(raw.rationale || "").trim().slice(0, 600),
    draftMessage: String(raw.draftMessage || "").trim().slice(0, 1200),
    source: "AI discovery",
    status: "Ready to contact",
  };
}

export async function scoreUrl(rawUrl, env) {
  const website = normaliseUrl(rawUrl);
  if (!website) throw new Error("invalid url");

  let html = "";
  try {
    const res = await fetch(website, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SalesBoi/1.0)" },
      cf: { cacheTtl: 3600 },
    });
    if (res.ok) html = await res.text();
  } catch (e) {
    console.warn("fetch failed for", website, e);
  }

  if (!html) {
    throw new Error(`could not fetch ${website}`);
  }

  const text = await callClaude(env, {
    system: SYSTEM_PROMPT,
    user: userPromptFor(website, html),
    maxTokens: 1200,
  });

  const parsed = parseJson(text);
  return normaliseLead(parsed, website);
}
