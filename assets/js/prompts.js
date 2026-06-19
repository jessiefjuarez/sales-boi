/* ============================================================
   prompts.js — built-in AI prompt templates for a remote video
   editor targeting agencies. Templates use {{variables}} that get
   auto-filled from the selected lead.
   ============================================================ */
(function () {
  "use strict";

  // The editor's fixed positioning details. Edit these once and every
  // generated prompt reflects them. (Surfaced in Settings later if wanted.)
  const ME = {
    role: "remote video editor who supports agencies with short-form ads and longer brand/promo videos",
    basePrice: "around $300 for a simple 30–60 second edit when footage and direction are provided",
    edits: "short-form paid ad edits, UGC-style cuts, and longer brand/promo videos",
  };

  const TEMPLATES = [
    {
      id: "find_leads",
      title: "Find agency leads",
      category: "Research",
      needsLead: false,
      hint: "Paste into Perplexity or Claude to source a fresh batch.",
      body:
        "Find 20 small to midsize agencies in the United States that create social content, paid ads, or brand videos for e-commerce brands or online businesses. " +
        "Return a table with: agency name, website, niche, probable decision-maker roles, and a one-line reason each might need freelance overflow video editing support. " +
        "Favor agencies that publish a high volume of short-form video and appear remote-friendly.",
    },
    {
      id: "fit_summary",
      title: "Agency fit summary",
      category: "Research",
      needsLead: true,
      hint: "Drop in their site/notes to get a quick read on fit.",
      body:
        "Summarize this agency in plain language. Explain what they do, what kinds of clients they appear to serve, whether they seem like a good fit for a remote freelance video editor, and which person at the agency is the best outreach target.\n\n" +
        "Agency: {{name}}\nWebsite: {{website}}\nNiche: {{niche}}\nServices: {{services}}\nLocation: {{location}}\nWhat I already know: {{notes}}",
    },
    {
      id: "cold_email",
      title: "Personalized cold email",
      category: "Outreach",
      needsLead: true,
      hint: "Your main first-touch email.",
      body:
        "Write a cold email under 120 words to this agency. Mention one specific thing about their work, briefly explain that I am a " +
        ME.role +
        ", and make a soft offer to help with overflow editing. Keep it concise and natural — no buzzwords, no hard sell.\n\n" +
        "Agency: {{name}}\nWebsite: {{website}}\nNiche: {{niche}}\nServices: {{services}}\nContact: {{contactName}} ({{contactRole}})\nSomething specific I noticed: {{notes}}",
    },
    {
      id: "linkedin_dm",
      title: "LinkedIn DM",
      category: "Outreach",
      needsLead: true,
      hint: "Short, personal, low-pressure.",
      body:
        "Write a short LinkedIn DM to this agency contact. Make it personal, not spammy. Mention one relevant observation, explain how I could help with editing support as a " +
        ME.role +
        ", and end with a low-pressure CTA.\n\n" +
        "Contact: {{contactName}} ({{contactRole}})\nAgency: {{name}}\nNiche: {{niche}}\nObservation / hook: {{notes}}",
    },
    {
      id: "follow_up",
      title: "Follow-up email (no reply)",
      category: "Outreach",
      needsLead: true,
      hint: "Send 3–5 days after first touch.",
      body:
        "Write a polite follow-up email for an agency that has not replied after my first message. Keep it short and friendly, add a tiny bit of new value, and restate the overflow editing angle.\n\n" +
        "Agency: {{name}}\nNiche: {{niche}}\nContact: {{contactName}}\nContext from first message: {{notes}}",
    },
    {
      id: "interested_reply",
      title: "Reply to interested agency",
      category: "Closing",
      needsLead: true,
      hint: "When they reply with interest.",
      body:
        "Write a reply to an agency that expressed interest. Thank them, briefly explain the types of edits I handle (" +
        ME.edits +
        "), mention my starting point of " +
        ME.basePrice +
        ", and ask the most important next-step questions (volume, turnaround, footage/direction provided, and where they get stuck).\n\n" +
        "Agency: {{name}}\nContact: {{contactName}} ({{contactRole}})\nWhat they said / context: {{notes}}",
    },
    {
      id: "notes_to_recap",
      title: "Meeting notes → recap",
      category: "Closing",
      needsLead: true,
      hint: "Paste rough call notes below the prompt.",
      body:
        "Turn these rough notes into a clean recap email with bullet points, project scope, next steps, and any open questions. Keep the tone warm and professional.\n\n" +
        "Agency: {{name}}\nContact: {{contactName}}\n\nRough notes:\n{{notes}}",
    },
    {
      id: "proposal_summary",
      title: "Notes → proposal summary",
      category: "Closing",
      needsLead: true,
      hint: "Turn a discovery call into a scoped proposal.",
      body:
        "Turn these meeting notes into a short proposal summary for a remote video editing arrangement. Include: scope, deliverables, suggested pricing (starting from " +
        ME.basePrice +
        "), turnaround, and a simple way to start (a paid test edit). Keep it to one page.\n\n" +
        "Agency: {{name}}\nContact: {{contactName}}\n\nNotes:\n{{notes}}",
    },
  ];

  // Build the variable map for a given lead (+ its primary contact).
  function variablesFor(lead, contact) {
    if (!lead) return {};
    return {
      name: lead.name || "",
      website: lead.website || "",
      niche: lead.niche || "",
      services: (lead.services || []).join(", "),
      location: lead.location || "",
      notes: lead.notes || "",
      contactName: contact ? contact.name : "the right person there",
      contactRole: contact ? contact.role : "",
    };
  }

  // Replace {{tokens}} in a template body with lead variables.
  function fill(body, vars) {
    return body.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      const v = vars[key];
      return v === undefined || v === "" ? "[" + key + "]" : v;
    });
  }

  window.PROMPTS = { TEMPLATES, variablesFor, fill, ME };
})();
