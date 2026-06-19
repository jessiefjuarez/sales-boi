/* ============================================================
   seed.js — realistic example data so the UI feels complete.
   Loaded into localStorage on first run (and via "Load sample data").
   ============================================================ */
(function () {
  "use strict";

  // Helper to make dates relative to "today" so seed always feels fresh.
  const today = new Date();
  function daysFromNow(n) {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  const LEADS = [
    {
      id: "lead_northloop",
      name: "North Loop Studio",
      website: "https://northloopstudio.com",
      niche: "Performance / paid social agency",
      location: "Austin, TX",
      size: "Small (6–15)",
      services: ["Paid social ads", "UGC production", "Creative strategy"],
      tags: ["e-commerce", "performance agency", "short-form"],
      notes:
        "Run a lot of TikTok + Meta ad creative for DTC supplement and apparel brands. Output looks high-volume — likely a real overflow editing need around launches.",
      source: "Instagram",
      dateAdded: daysFromNow(-12),
      status: "Ready to contact",
      priority: true,
      followUpDate: daysFromNow(0),
      signals: {
        ecommerceFocus: true,
        doesShortForm: true,
        doesBrandVideo: false,
        rightSize: true,
        remoteFriendly: true,
        activeOutput: true,
      },
    },
    {
      id: "lead_brightwave",
      name: "Brightwave Collective",
      website: "https://brightwave.co",
      niche: "Brand & content studio",
      location: "Remote (US)",
      size: "Small (6–15)",
      services: ["Brand films", "Social content", "Email creative"],
      tags: ["e-commerce", "social agency", "brand video"],
      notes:
        "Polished brand-forward work for online lifestyle brands. Slower cadence but higher-end. Good fit for longer promo edits.",
      source: "Referral",
      dateAdded: daysFromNow(-9),
      status: "Contacted",
      priority: false,
      followUpDate: daysFromNow(2),
      signals: {
        ecommerceFocus: true,
        doesShortForm: false,
        doesBrandVideo: true,
        rightSize: true,
        remoteFriendly: true,
        activeOutput: false,
      },
    },
    {
      id: "lead_pixelhound",
      name: "Pixelhound Media",
      website: "https://pixelhound.io",
      niche: "Social-first creative agency",
      location: "Brooklyn, NY",
      size: "Mid (16–40)",
      services: ["Short-form ads", "Influencer content", "Motion graphics"],
      tags: ["e-commerce", "performance agency", "short-form"],
      notes:
        "Replied to first email — curious about rates and turnaround. Edits a ton of short-form. Strong potential overflow partner.",
      source: "Cold email",
      dateAdded: daysFromNow(-18),
      status: "Replied",
      priority: true,
      followUpDate: daysFromNow(1),
      signals: {
        ecommerceFocus: true,
        doesShortForm: true,
        doesBrandVideo: false,
        rightSize: true,
        remoteFriendly: true,
        activeOutput: true,
      },
    },
    {
      id: "lead_meridian",
      name: "Meridian Growth",
      website: "https://meridiangrowth.com",
      niche: "Growth / DTC marketing agency",
      location: "Denver, CO",
      size: "Mid (16–40)",
      services: ["Paid media", "Creative production", "Landing pages"],
      tags: ["e-commerce", "performance agency"],
      notes:
        "Booked a 20-min intro call. They scale ad creative for several Shopify brands and feel stretched on editing.",
      source: "LinkedIn",
      dateAdded: daysFromNow(-22),
      status: "Call booked",
      priority: true,
      followUpDate: daysFromNow(3),
      signals: {
        ecommerceFocus: true,
        doesShortForm: true,
        doesBrandVideo: true,
        rightSize: true,
        remoteFriendly: true,
        activeOutput: true,
      },
    },
    {
      id: "lead_lumen",
      name: "Lumen & Co",
      website: "https://lumenandco.studio",
      niche: "Boutique content studio",
      location: "Remote (US)",
      size: "Solo / micro (1–5)",
      services: ["Social content", "Founder content", "Podcast clips"],
      tags: ["social agency", "short-form"],
      notes:
        "Tiny team, may not have budget yet — keep warm. Could be a fast yes for occasional overflow.",
      source: "Twitter/X",
      dateAdded: daysFromNow(-30),
      status: "Dormant",
      priority: false,
      followUpDate: daysFromNow(14),
      signals: {
        ecommerceFocus: false,
        doesShortForm: true,
        doesBrandVideo: false,
        rightSize: false,
        remoteFriendly: true,
        activeOutput: true,
      },
    },
    {
      id: "lead_harbor",
      name: "Harbor & Pine",
      website: "https://harborandpine.com",
      niche: "Full-service e-commerce agency",
      location: "Chicago, IL",
      size: "Mid (16–40)",
      services: ["Paid ads", "Email", "Video production", "Web"],
      tags: ["e-commerce", "performance agency", "brand video"],
      notes:
        "Sent a proposal for a paid test edit + monthly overflow. Waiting to hear back from their creative lead.",
      source: "Referral",
      dateAdded: daysFromNow(-26),
      status: "Proposal sent",
      priority: true,
      followUpDate: daysFromNow(-1),
      signals: {
        ecommerceFocus: true,
        doesShortForm: true,
        doesBrandVideo: true,
        rightSize: true,
        remoteFriendly: true,
        activeOutput: true,
      },
    },
    {
      id: "lead_cobalt",
      name: "Cobalt Social",
      website: "https://cobaltsocial.com",
      niche: "Social media agency",
      location: "Miami, FL",
      size: "Small (6–15)",
      services: ["Organic social", "Short-form ads", "Community"],
      tags: ["e-commerce", "social agency", "short-form"],
      notes:
        "Won! Started with a test edit, now sending ~6 short-form edits/month for their DTC clients.",
      source: "Cold email",
      dateAdded: daysFromNow(-48),
      status: "Won",
      priority: false,
      followUpDate: "",
      signals: {
        ecommerceFocus: true,
        doesShortForm: true,
        doesBrandVideo: false,
        rightSize: true,
        remoteFriendly: true,
        activeOutput: true,
      },
    },
    {
      id: "lead_atlas",
      name: "Atlas Creative",
      website: "https://atlascreative.tv",
      niche: "Video production house",
      location: "Los Angeles, CA",
      size: "Large (40+)",
      services: ["Commercials", "Brand films", "Post production"],
      tags: ["brand video"],
      notes:
        "Big shop with in-house post team — passed for now. Revisit if they spin up a DTC division.",
      source: "Cold email",
      dateAdded: daysFromNow(-40),
      status: "Lost",
      priority: false,
      followUpDate: "",
      signals: {
        ecommerceFocus: false,
        doesShortForm: false,
        doesBrandVideo: true,
        rightSize: false,
        remoteFriendly: false,
        activeOutput: true,
      },
    },
  ];

  const CONTACTS = [
    { id: "c1", leadId: "lead_northloop", name: "Maya Chen", role: "Creative Director", email: "maya@northloopstudio.com", linkedin: "https://linkedin.com/in/mayachen", instagram: "@maya.edits" },
    { id: "c2", leadId: "lead_brightwave", name: "Devon Park", role: "Founder", email: "devon@brightwave.co", linkedin: "https://linkedin.com/in/devonpark", instagram: "" },
    { id: "c3", leadId: "lead_pixelhound", name: "Sam Ortiz", role: "Head of Production", email: "sam@pixelhound.io", linkedin: "https://linkedin.com/in/samortiz", instagram: "@pixelhound" },
    { id: "c4", leadId: "lead_meridian", name: "Jordan Reyes", role: "VP Creative", email: "jordan@meridiangrowth.com", linkedin: "https://linkedin.com/in/jordanreyes", instagram: "" },
    { id: "c5", leadId: "lead_harbor", name: "Priya Nair", role: "Creative Lead", email: "priya@harborandpine.com", linkedin: "https://linkedin.com/in/priyanair", instagram: "" },
    { id: "c6", leadId: "lead_cobalt", name: "Alex Romano", role: "Managing Partner", email: "alex@cobaltsocial.com", linkedin: "https://linkedin.com/in/alexromano", instagram: "@cobaltsocial" },
  ];

  const ACTIVITIES = [
    { id: "a1", leadId: "lead_pixelhound", type: "email", channel: "Email", direction: "out", date: daysFromNow(-15), summary: "Sent personalized cold email referencing their Nike-style sneaker spot." },
    { id: "a2", leadId: "lead_pixelhound", type: "reply", channel: "Email", direction: "in", date: daysFromNow(-13), summary: "Sam replied — asked about rates and average turnaround per edit." },
    { id: "a3", leadId: "lead_brightwave", type: "email", channel: "Email", direction: "out", date: daysFromNow(-7), summary: "Cold email sent, complimented their recent brand film for a skincare line." },
    { id: "a4", leadId: "lead_meridian", type: "dm", channel: "LinkedIn", direction: "out", date: daysFromNow(-19), summary: "LinkedIn DM to Jordan about overflow editing for their ad creative." },
    { id: "a5", leadId: "lead_meridian", type: "call", channel: "Call", direction: "in", date: daysFromNow(-4), summary: "Booked a 20-min intro call for next week. They run creative for ~8 Shopify brands." },
    { id: "a6", leadId: "lead_harbor", type: "proposal", channel: "Email", direction: "out", date: daysFromNow(-6), summary: "Sent proposal: $300 paid test edit + monthly overflow retainer options." },
    { id: "a7", leadId: "lead_cobalt", type: "note", channel: "Note", direction: "out", date: daysFromNow(-44), summary: "Won the account after a strong test edit. Recurring ~6 edits/month." },
  ];

  const OPPORTUNITIES = [
    { id: "o1", leadId: "lead_meridian", name: "Monthly overflow editing", value: 1800, probability: 50, stage: "Qualified", notes: "~6 short-form edits/month at ~$300 each.", expectedClose: daysFromNow(20) },
    { id: "o2", leadId: "lead_harbor", name: "Test edit + retainer", value: 2400, probability: 40, stage: "Proposal sent", notes: "Paid test, then 8 edits/month retainer.", expectedClose: daysFromNow(10) },
    { id: "o3", leadId: "lead_cobalt", name: "Recurring short-form retainer", value: 1800, probability: 100, stage: "Won", notes: "Active — 6 edits/month.", expectedClose: daysFromNow(-30) },
    { id: "o4", leadId: "lead_pixelhound", name: "Overflow trial", value: 600, probability: 30, stage: "Replied", notes: "2 test edits to start.", expectedClose: daysFromNow(25) },
  ];

  const TASKS = [
    { id: "t1", leadId: "lead_northloop", title: "Send first cold email", dueDate: daysFromNow(0), done: false },
    { id: "t2", leadId: "lead_pixelhound", title: "Reply with rates + turnaround", dueDate: daysFromNow(1), done: false },
    { id: "t3", leadId: "lead_harbor", title: "Follow up on proposal", dueDate: daysFromNow(-1), done: false },
    { id: "t4", leadId: "lead_meridian", title: "Prep questions for intro call", dueDate: daysFromNow(3), done: false },
    { id: "t5", leadId: "lead_brightwave", title: "Follow-up #1 (no reply yet)", dueDate: daysFromNow(2), done: false },
  ];

  window.SEED = {
    leads: LEADS,
    contacts: CONTACTS,
    activities: ACTIVITIES,
    opportunities: OPPORTUNITIES,
    tasks: TASKS,
  };
})();
