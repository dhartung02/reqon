/**
 * entitlements — the single source of truth for Reqon's freemium tier model, shared by the
 * server (Node), the React Native app, the Chrome extension, and the web board. ZERO runtime
 * dependencies, pure functions; mirrors core/crm-core.js conventions and is re-exported through
 * `@reqon/core` so no surface can silently drift on what's free vs. paid.
 *
 * Packages are à-la-carte add-ons, not a strict ladder:
 *   free   — always on. The core CRM: pipeline, add/edit, status, local scoring, tracking
 *            fields, local analytics, Excel export, role timeline, action items.
 *   cloud  — the Cloud enhancement package: hosted multi-device sync, push/digest/email/SMS/
 *            Slack delivery, Gmail ingest, server-side scout, cloud backups, QR pairing.
 *   ai     — the AI enhancement package: AI drafts, AI auto-score, map-fields autofill,
 *            interview-guide generation + company research, follow-up recommendations,
 *            profile-summary draft. Sold as a SUPERSET of Cloud ("Reqon AI = everything in
 *            Cloud, plus AI"), so holding `ai` also grants every `cloud` feature.
 *
 * Grants (who unlocks what):
 *   owner  — the account owner (single-user self-host, or a user with role 'owner'/'admin' in
 *            multi-user). Gets EVERYTHING, always.
 *   pro    — Local Pro unlock ("point it at your own server"). A self-hoster owns the box, so
 *            Pro grants every package. Functionally equal to owner for capabilities.
 *   cloud  — the user holds the Cloud package on hosted Reqon.
 *   ai     — the user holds the AI package on hosted Reqon.
 *   free   — baseline; everyone.
 */

// Package identifiers, in display order.
const PACKAGES = ['free', 'cloud', 'ai'];

const PACKAGE_LABELS = {
  free: 'Free',
  cloud: 'Cloud',
  ai: 'AI',
  pro: 'Local Pro',
  owner: 'Owner',
};

// Feature catalog: each capability → the package that unlocks it.
// Keep keys stable; surfaces and the server reference them by string. Adding a key here is the
// ONE place a feature gets tagged with its tier — clients fail-open on keys they don't know.
const FEATURES = {
  // ── Core (free) ────────────────────────────────────────────────────────────
  pipeline_view: 'free',
  role_add: 'free',
  role_edit: 'free',
  status_change: 'free',
  scoring: 'free', // local fit/prob/tier compute via crm-core
  tracking_fields: 'free',
  search_sort: 'free',
  analytics: 'free', // KPIs/funnel/health are just math over local rows
  pipeline_health: 'free',
  timeline: 'free',
  action_items: 'free',
  notifications_feed: 'free', // the in-app bell (reads the local feed)
  excel_export: 'free',

  // ── Cloud package ──────────────────────────────────────────────────────────
  cloud_sync: 'cloud', // hosted multi-device sync
  pairing: 'cloud', // QR / pairing-code device setup
  digest_delivery: 'cloud', // slack / email / sms / push fan-out
  gmail_ingest: 'cloud',
  scout: 'cloud', // server-side scout runs
  backups: 'cloud',

  // ── AI package ─────────────────────────────────────────────────────────────
  ai_draft: 'ai', // cover / screening / thank-you drafts
  ai_score: 'ai', // fit/prob auto-score via function calling
  ai_mapfields: 'ai', // application autofill field mapping
  guide_generate: 'ai', // interview prep guide generation
  guide_research: 'ai', // opt-in web_search company research pass
  followup_reco: 'ai', // stage-aware follow-up recommendation
  profile_summary: 'ai', // AI-draft professional summary
};

const FEATURE_LABELS = {
  cloud_sync: 'Multi-device sync',
  pairing: 'Device pairing',
  digest_delivery: 'Digest & push delivery',
  gmail_ingest: 'Gmail ingest',
  scout: 'Auto-scout',
  backups: 'Cloud backups',
  ai_draft: 'AI drafts',
  ai_score: 'AI auto-score',
  ai_mapfields: 'AI autofill',
  guide_generate: 'Interview guide',
  guide_research: 'Company research',
  followup_reco: 'Follow-up suggestions',
  profile_summary: 'AI profile summary',
};

// Parse a license string into raw package booleans. Accepts comma/space/plus-separated tokens,
// e.g. "cloud,ai" | "cloud+ai" | "pro" | "owner" | "free" | "". Case/whitespace insensitive.
function parseLicense(license) {
  const toks = String(license || '')
    .toLowerCase()
    .split(/[\s,+|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    owner: toks.includes('owner'),
    pro: toks.includes('pro') || toks.includes('localpro') || toks.includes('local-pro'),
    cloud: toks.includes('cloud') || toks.includes('all'),
    ai: toks.includes('ai') || toks.includes('all'),
  };
}

/**
 * Normalize raw signals into an effective plan.
 * @param {object} sig
 *   isOwner            — request resolved to the account owner / an admin.
 *   selfHostSingleUser — running self-hosted in single-user mode (you own the server).
 *   localProUnlock     — explicit Local Pro unlock flag (LOCAL_PRO env / setting).
 *   license            — a license string (REQON_LICENSE setting) for hosted multi-user.
 * @returns {{owner:boolean, pro:boolean, cloud:boolean, ai:boolean, packages:string[], tier:string}}
 */
function resolvePlan(sig) {
  sig = sig || {};
  const lic = parseLicense(sig.license);
  const owner = !!sig.isOwner || lic.owner;
  // A self-hosted single-user instance implicitly gets Local Pro — you run the box, you get it all.
  const pro = owner ? true : !!sig.localProUnlock || lic.pro || !!sig.selfHostSingleUser;
  const ai = owner || pro || lic.ai;
  // AI is sold as a SUPERSET of Cloud ("Reqon AI = Everything in Cloud, plus an AI corner man"):
  // there is no AI-without-Cloud SKU, and AI drafts/guides act on a synced board anyway. So AI
  // implies Cloud. The two paid plans resolve to license "cloud" and "ai" (== Cloud + AI).
  const cloud = owner || pro || lic.cloud || ai;
  const packages = ['free'].concat(cloud ? ['cloud'] : [], ai ? ['ai'] : []);
  const tier = owner
    ? 'owner'
    : pro
      ? 'pro'
      : cloud && ai
        ? 'cloud+ai'
        : cloud
          ? 'cloud'
          : ai
            ? 'ai'
            : 'free';
  return { owner, pro, cloud, ai, packages, tier };
}

// The package a feature needs ('free' | 'cloud' | 'ai'), or null for an unknown key.
function requiredPackage(feature) {
  return Object.prototype.hasOwnProperty.call(FEATURES, feature) ? FEATURES[feature] : null;
}

// Does this plan unlock this feature? Owner/Pro pass everything; unknown keys fail-open so an
// older client never hard-locks a capability the server hasn't taught it about yet.
function hasFeature(plan, feature) {
  const req = requiredPackage(feature);
  if (req == null) return true;
  if (plan && (plan.owner || plan.pro)) return true;
  if (req === 'free') return true;
  if (req === 'cloud') return !!(plan && plan.cloud);
  if (req === 'ai') return !!(plan && plan.ai);
  return false;
}

// Full { featureKey: boolean } map for a plan — handy for clients to cache and gate UI against.
function featureMap(plan) {
  const out = {};
  for (const k of Object.keys(FEATURES)) out[k] = hasFeature(plan, k);
  return out;
}

// A human label for a tier id (resolvePlan().tier) — e.g. 'cloud+ai' → 'Cloud + AI'.
function tierLabel(tier) {
  if (tier === 'cloud+ai') return 'Cloud + AI';
  if (tier === 'pro') return 'Local Pro';
  if (tier === 'owner') return 'Owner';
  return PACKAGE_LABELS[tier] || 'Free';
}

module.exports = {
  PACKAGES,
  PACKAGE_LABELS,
  FEATURES,
  FEATURE_LABELS,
  parseLicense,
  resolvePlan,
  requiredPackage,
  hasFeature,
  featureMap,
  tierLabel,
};
