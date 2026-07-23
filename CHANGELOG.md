# Changelog

All notable changes to the FullVision plugin.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- `fv-onboard` — the install-time entry point, and the first skill that works from a standing
  start: no account, no key, nothing connected. Walks signup → workspace → API key → tracker
  → Stripe → server events → search/ads, verifying each step against live data rather than
  asking "did that work?". Installs the tracker **into the user's repository** as a pull
  request, which is the thing the web onboarding structurally cannot do.
- **First-party Google Ads read surface.** `fullvision:google_ads_search` — a GAQL passthrough
  capped at LIMIT 1000 by default (10000 max), tenancy-scoped to the workspace's connected
  accounts — and `fullvision:google_list_ad_accounts`. The write tools
  (`google_propose_campaign_budget/status/ad_text/negative_keywords/tracking_params`,
  `google_check_ad_status`) already shipped, so Google Ads is now first-party read+write, gated
  by `apply_proposal` + `revert_mutation`.

### Removed
- **The bundled `google-ads` MCP server** (self-hosted `googleads/google-ads-mcp`) — the last
  vendor ad server in the plugin. Reads now go through `fullvision:google_ads_search`; the
  pipx/Python toolchain, gcloud ADC and `GOOGLE_ADS_DEVELOPER_TOKEN` are gone. Ad-platform
  vendor servers: one → zero. **This requires the gateway deploy landing first (full_db +
  full_distrib PRs) — do not release until those are live.**

### Changed
- **Renamed `fv-setup` → `fv-capabilities`**, cadence `on-install` → `on-demand`. It answers
  "what can I do today", which is a question you ask *after* setup.
- **`fv-login` cadence `on-install` → `on-demand`.** Two skills claiming to be the first thing
  you run is one too many. `fv-onboard` owns the install slot and delegates its auth phase to
  `fv-login`; `fv-login` stays directly invocable for the narrower "connect this machine" case
  (second laptop, re-login at 90 days, switching workspace). `/fullvision:fv-login` behaves
  exactly as before — cadence is metadata, not dispatch.
- `fv-onboard` no longer teaches key handling at all. Its auth phase is "run `fv-login`", and
  a test asserts the old `export FULLVISION_API_KEY` path cannot come back.
- `shared/platforms/google.md` documented Google as read-only-via-vendor-server. It is now
  first-party read+write via the FullVision gateway, connected through the app OAuth at
  `https://app.fullvision.io/setup/data-sync/google-ads`. `fv-cut-wasted-spend` proposes
  negatives via `fullvision:google_propose_negative_keywords`, applied through the
  `apply_proposal` gate. `fv-capabilities` reports Google Ads management as available and undoable.

## [0.4.0] — 2026-07-22

### Added
- **First-party Meta + LinkedIn Ads write surface.** `fullvision:meta_propose_campaign_status`,
  `meta_propose_adset_budget`, `linkedin_propose_campaign_status`,
  `linkedin_propose_campaign_group_budget`, each platform's `apply_proposal`,
  `revert_mutation`, `revert_run` and `list_pending_proposals`. Every change reads live state,
  stores a computed undo, is applied only by id (never a model-supplied payload), and is refused
  on live-state drift. Caps + a 24h cooldown are enforced in full_db, not in markdown.

### Removed
- **The `meta-ads` (hosted) and `linkedin-ads` (community) MCP servers.** Reads already go
  through `fullvision:query_view`; writes now go through FullVision's own surface. This drops the
  community LinkedIn server and its `LINKEDIN_ACCESS_TOKEN`. Ad-platform servers: three → one
  (`google-ads` remains until its own cutover lands).

### Changed
- `shared/platforms/meta.md` + `linkedin.md` documented these as write-via-vendor-server. They
  are now first-party. `fv-capabilities` reports Meta/LinkedIn management as an available,
  undoable capability.

### Out of scope, deliberately
- Bidding, targeting, creative; create/delete of campaigns/ad sets/groups/ads — irreversible or
  learning-resetting, out of v1 on all platforms.

## [0.2.0] — 2026-07-20

### Added
- Four skills covering the jobs v1 missed: `fv-find-keyword-gaps`,
  `fv-fix-striking-distance` (SEO), `fv-win-back-churned` (Brevo — the first skill to use that
  server), `fv-design-page-test` (A/B power gate).
- `shared/platforms/{google,meta,linkedin}.md` — per-platform attribution windows, write
  capability, auth burden and audience floors, read by every ads skill.
- Retargeting documented as a segment shape inside `fv-build-audience`, not a separate skill.

### Decided
- **No role/persona subagents.** A subagent buys context isolation and tool restriction, not
  expertise; splitting analysis by ad platform fragments the cross-platform revenue comparison
  that is the product's whole point. Platform knowledge is reference material; jobs are skills.
  `fv-analyst` remains the only subagent. See README, "Why there are no specialist agents".

## [0.1.0] — 2026-07-20

### Added
- Initial v1: six skills (`fv-setup`, `fv-data-health`, `fv-verify-revenue-feedback-loop`,
  `fv-cut-wasted-spend`, `fv-find-leaky-pages`, `fv-fix-page`, `fv-build-audience`).
- MCP bundle: fullvision, meta-ads, google-ads, linkedin-ads, webflow, brevo.
- Shared protocols: safety rails, sparse-data, FullVision data reading, report format.

### Known limitations
- Google Ads is **read-only** — the official server exposes GAQL reads only. Google changes
  are emitted as a reviewed change-list the user applies by hand.
- `fv-build-audience` is read-only — audience activation is not on the FullVision MCP surface yet.
- FullVision MCP uses bearer-token auth; 1-click OAuth ships separately.
