# sales-boi

AI sales assistant for a remote video editor targeting agencies. Local-first CRM in the browser, plus a Cloudflare Worker that auto-discovers agency leads, scores them with Claude, and queues them for you to review.

Live: https://sales-boi.jessiefjuarez.workers.dev

## What it does

- **Today / Dashboard / Leads / Pipeline / Prompts / Data** — the original local-first CRM (data in `localStorage`).
- **Discovery (new)** — every morning at 6am PT, the Worker searches a handful of agency-finding sources, sends each candidate's homepage to Claude Haiku for ICP-aware scoring, and drops the results into a review queue.
- **"+ From URL" (new)** — paste any agency website, get a scored Lead pre-filled with a drafted outreach message in one click.
- **Confirm / Snooze / Reject** — one click on a Discovery card pushes a Lead into the local CRM (with the AI draft saved as an Activity) or hides it.

## Architecture

```
index.html, assets/        ← static SPA (served by Worker static-assets)
worker/index.js            ← /api/* routes + scheduled() cron handler
  ├── claude.js            ← Anthropic Messages API client
  ├── score.js             ← fetch homepage → Claude → Lead record
  ├── queue.js             ← KV-backed candidate queue
  ├── discover.js          ← orchestrate sources + scoring
  └── sources/
      ├── brave.js         ← Brave Search API
      └── clutch.js        ← Clutch.co directory pages (best-effort)
```

The Worker is one binary. Static requests fall through to `env.ASSETS.fetch`; anything under `/api/*` is handled by the Worker.

## First-time setup

You'll need a Cloudflare account (free) and an Anthropic API key.

### 1. Install wrangler

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the KV namespace for the discovery queue

```bash
npx wrangler kv:namespace create QUEUE
```

Wrangler prints something like:

```
[[kv_namespaces]]
binding = "QUEUE"
id = "abc123..."
```

Open `wrangler.toml` and replace `REPLACE_WITH_KV_ID_FROM_WRANGLER` with the printed `id`.

### 4. Add secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY
# paste your key from console.anthropic.com → API Keys

# Optional but recommended — gives the queue more candidates:
npx wrangler secret put BRAVE_SEARCH_API_KEY
# free 2k/mo tier: https://api.search.brave.com
```

Without `BRAVE_SEARCH_API_KEY`, discovery falls back to Clutch only (works but lower volume). Without `ANTHROPIC_API_KEY`, the scoring endpoint will error.

### 5. Deploy

```bash
npm run deploy
```

Wrangler uploads the static files + Worker and prints your URL.

## Daily use

1. **Morning** — open the site. The Discovery tab shows whatever the cron found overnight.
2. **Per card** — read the AI rationale + draft. Click:
   - **Confirm → Leads** to push it into your local CRM (the draft is saved as an Activity you can copy from the lead detail).
   - **Snooze 14d** to revisit later.
   - **Reject** to dismiss permanently.
3. **Anytime** — paste a URL into "+ From URL" on the Leads or Discovery page for instant ad-hoc scoring.
4. **Want more?** — click **Run discovery now** on the Discovery tab to trigger a fresh sweep.

## Tuning the ICP

The scoring prompt lives in `worker/score.js` (`SYSTEM_PROMPT`). The signal weights (the 0–100 fit score) live in `assets/js/store.js` (`SCORE_WEIGHTS`). The discovery niches and cities live in `wrangler.toml` (`DISCOVER_NICHES`, `DISCOVER_CITIES`) — edit, redeploy, done.

## Costs (typical)

- **Cloudflare Workers + KV**: free tier handles single-user load.
- **Claude Haiku 4.5**: ~$0.50/day for ~25 discoveries/day = ~$15/mo.
- **Brave Search**: free 2,000 queries/month.

Total: under $20/mo, often under $5.

## Local dev

```bash
npm run dev
```

Opens at `http://localhost:8787`. The static assets and the `/api/*` Worker run together. KV is simulated locally; put dev secrets in a `.dev.vars` file:

```
ANTHROPIC_API_KEY=sk-ant-...
BRAVE_SEARCH_API_KEY=BSA...
```

## Migration note

If you previously deployed by uploading files via the Cloudflare dashboard, this repo replaces that flow with `wrangler deploy`. The first `npm run deploy` will overwrite the dashboard upload with the same site + the new Worker.
