const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

// Domains that aren't agency homepages — directories, marketplaces, social sites.
const BLOCKED_HOSTS = new Set([
  "clutch.co", "www.clutch.co",
  "upwork.com", "www.upwork.com",
  "fiverr.com", "www.fiverr.com",
  "linkedin.com", "www.linkedin.com",
  "indeed.com", "www.indeed.com",
  "glassdoor.com", "www.glassdoor.com",
  "instagram.com", "www.instagram.com",
  "facebook.com", "www.facebook.com",
  "twitter.com", "www.twitter.com", "x.com",
  "youtube.com", "www.youtube.com",
  "medium.com", "www.medium.com",
  "github.com", "www.github.com",
  "g2.com", "www.g2.com",
  "trustpilot.com", "www.trustpilot.com",
  "reddit.com", "www.reddit.com",
  "wikipedia.org", "en.wikipedia.org",
  "designrush.com", "www.designrush.com",
  "sortlist.com", "www.sortlist.com",
  "agencyspotter.com", "www.agencyspotter.com",
]);

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Build a small set of queries tailored to the editor's ICP.
export function buildQueries({ niches, cities }) {
  const queries = [];
  for (const niche of niches.slice(0, 3)) {
    for (const city of cities.slice(0, 3)) {
      queries.push(`"${niche}" agency ecommerce ${city} -site:clutch.co -site:linkedin.com`);
    }
  }
  // A few non-geo queries focused on ICP signals.
  queries.push(`"short-form video" agency DTC ecommerce -site:clutch.co -site:linkedin.com`);
  queries.push(`"performance marketing" agency shopify clients -site:clutch.co -site:linkedin.com`);
  queries.push(`"UGC agency" ecommerce brands portfolio -site:clutch.co -site:linkedin.com`);
  return queries;
}

async function searchOne(env, query, count = 8) {
  if (!env.BRAVE_SEARCH_API_KEY) return [];
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}&safesearch=moderate&country=us`;
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "x-subscription-token": env.BRAVE_SEARCH_API_KEY,
    },
  });
  if (!res.ok) {
    console.warn("brave search failed", res.status, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  const results = (data.web && data.web.results) || [];
  return results
    .map((r) => r.url)
    .filter(Boolean)
    .filter((u) => {
      const host = hostnameOf(u);
      return host && !BLOCKED_HOSTS.has(host);
    });
}

// Collapse a list of URLs to unique origins (homepages).
function toOrigins(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    try {
      const origin = new URL(u).origin;
      if (!seen.has(origin)) {
        seen.add(origin);
        out.push(origin);
      }
    } catch {}
  }
  return out;
}

export async function discoverFromBrave(env, { niches, cities, limit = 20 } = {}) {
  if (!env.BRAVE_SEARCH_API_KEY) {
    console.log("BRAVE_SEARCH_API_KEY not set, skipping brave source");
    return [];
  }
  const queries = buildQueries({ niches, cities });
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    if (out.length >= limit) break;
    const urls = await searchOne(env, q, 6);
    for (const origin of toOrigins(urls)) {
      if (out.length >= limit) break;
      const host = hostnameOf(origin);
      if (seen.has(host)) continue;
      seen.add(host);
      out.push({ url: origin, sourceQuery: q });
    }
  }
  return out;
}
