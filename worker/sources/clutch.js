// Clutch.co publishes agency directory pages by category. This source pulls
// agency website links from a few category pages. Clutch has bot protection,
// so this is best-effort — failures are logged and skipped.

const CATEGORY_URLS = [
  "https://clutch.co/agencies/social-media-marketing",
  "https://clutch.co/agencies/digital",
  "https://clutch.co/agencies/video-production",
  "https://clutch.co/agencies/advertising",
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Pull "Visit Website" external links out of a Clutch listing page HTML.
// Clutch wraps these as <a href="https://clutch.co/go/website?u=ENCODED_URL">.
function extractAgencyUrls(html) {
  const out = new Set();
  const re = /clutch\.co\/go\/website\?u=([^"'&]+)/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const decoded = decodeURIComponent(m[1]);
      const origin = new URL(decoded).origin;
      out.add(origin);
    } catch {}
  }
  // Fallback: direct external links inside the listing area.
  if (out.size === 0) {
    const re2 = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*Visit\s+Website/gi;
    let m2;
    while ((m2 = re2.exec(html))) {
      try {
        const host = hostnameOf(m2[1]);
        if (host && !host.endsWith("clutch.co")) out.add(new URL(m2[1]).origin);
      } catch {}
    }
  }
  return Array.from(out);
}

async function fetchOne(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "accept": "text/html,application/xhtml+xml",
      },
      cf: { cacheTtl: 6 * 3600 },
    });
    if (!res.ok) {
      console.warn("clutch fetch", url, res.status);
      return [];
    }
    const html = await res.text();
    return extractAgencyUrls(html);
  } catch (e) {
    console.warn("clutch fetch error", url, e);
    return [];
  }
}

export async function discoverFromClutch(env, { limit = 15 } = {}) {
  const seen = new Set();
  const out = [];
  for (const url of CATEGORY_URLS) {
    if (out.length >= limit) break;
    const urls = await fetchOne(url);
    for (const origin of urls) {
      if (out.length >= limit) break;
      const host = hostnameOf(origin);
      if (seen.has(host)) continue;
      seen.add(host);
      out.push({ url: origin, sourceQuery: url });
    }
  }
  return out;
}
