const API_URL = "https://api.anthropic.com/v1/messages";

export async function callClaude(env, { system, user, model, maxTokens = 1024 }) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY secret is not set. Run: wrangler secret put ANTHROPIC_API_KEY");
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || env.SCORE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return text;
}

// Extracts the first JSON object or array from a model response. Models often
// wrap JSON in ```json fences or add a sentence around it.
export function parseJson(text) {
  if (!text) throw new Error("empty model response");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[\[{]/);
  if (start === -1) throw new Error("no JSON in model response");
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
  }
  if (end === -1) throw new Error("unterminated JSON in model response");
  return JSON.parse(body.slice(start, end + 1));
}
