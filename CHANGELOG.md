# Changelog

All notable changes to the FullVision plugin.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Google Ads conversion-goal management** (three gateway tools shipped from `full_distrib`, not
  this repo): `fullvision:google_propose_conversion_goal_settings` (account-level
  CustomerConversionGoal biddable defaults, per category×origin, ≤5, update-only),
  `fullvision:google_propose_campaign_conversion_goals` (one campaign — `goal_config_level`
  CUSTOMER|CAMPAIGN, attach/clear a custom goal, per-pair biddable flags, ≤10), and
  `fullvision:google_propose_custom_conversion_goal` (create a custom goal from 1–10 conversion
  actions; revert = REMOVED). All propose-only, applied via `apply_proposal`, reversible with
  `revert_mutation`. `shared/platforms/google.md` gains a "Conversion goals" section encoding the
  four-object model (CustomerConversionGoal / CampaignConversionGoal /
  ConversionGoalCampaignConfig / CustomConversionGoal), the MCC conversion-customer resolution,
  the no-ad-group-level fact, the GAQL read resources, and the lead-form→qualified-lead
  re-routing chain. **Requires the gateway deploy landing first — do not release (or merge) until
  those PRs are live; the live contract test fails on the three new tool names until then.**
- **`google-ads-review` extended to conversion goals.** The mid-funnel-goal recommendation
  (below ~20 closed deals/month) can now **stage** the change — custom goal + campaign attach —
  in the same change-list, behind the same `apply_proposal` gate, instead of only describing it.
  The review also now flags conversion-goal misconfigurations (e.g. a campaign optimising for a
  category with zero Stripe-linked conversions). Conversion goals are no longer out of v1;
  bidding strategies, targeting, creative and create/delete remain out.
- **`google-ads-review` — one weekly Google Ads session, one command.** Merges the substance
  of the old `cut-wasted-spend` and `verify-revenue-feedback-loop` skills: precondition on
  `fullvision:check_data_health`, verify closed Stripe revenue is reaching Google as conversion
  signal (upload failures, terminal-expired events, mid-funnel-goal recommendation below ~20
  closed deals/month), then find zero-payer search terms/placements and budget/status outliers,
  emit one consolidated change-list staged via `fullvision:google_propose_*`, and apply by id
  on confirmation. One job = one skill.
- **Two gateway tools that replace two skills** (shipped from `full_distrib`, not this repo):
  `fullvision:check_data_health` → `{ verdict: "green"|"amber"|"red", checks: [...] }`, and
  `fullvision:get_capabilities` → `{ connections, tools, hidden }`. Every skill now calls
  `check_data_health` as its precondition instead of running a `data-health` skill.
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
- **Four skills, replaced by tools or merged** — skill count 13 → 10. `data-health` and
  `capabilities` become gateway tools (`fullvision:check_data_health`,
  `fullvision:get_capabilities`): they were deterministic — a graded verdict and a capability
  inventory — so they are facts a tool owns, not judgment a skill delivers. `cut-wasted-spend`
  and `verify-revenue-feedback-loop` merge into the single `google-ads-review` session skill.
  The merge **deliberately narrows the feedback-loop check to Google** — the old skill also
  checked Meta and LinkedIn uploads, but those platforms are reads-only on the MCP surface for
  now, so there is nothing to act on there; Meta's pLTV risk stays documented in
  `shared/platforms/meta.md`.
- **The bundled `google-ads` MCP server** (self-hosted `googleads/google-ads-mcp`) — the last
  vendor ad server in the plugin. Reads now go through `fullvision:google_ads_search`; the
  pipx/Python toolchain, gcloud ADC and `GOOGLE_ADS_DEVELOPER_TOKEN` are gone. Ad-platform
  vendor servers: one → zero. **This requires the gateway deploy landing first (full_db +
  full_distrib PRs) — do not release until those are live.**

### Changed
- **Dropped the `fv-` prefix from every skill and agent name** (`fv-cut-wasted-spend` →
  `cut-wasted-spend`, `fv-analyst` → `analyst`, …). Skills already surface namespaced as
  `fullvision:<name>`, so the prefix said "fullvision" twice. Cross-references, tests and docs
  updated; the `scripts/fv-*.mjs` filenames and the `fv-fix/<slug>` site-repo branch prefix are
  unchanged (they are not skill names).
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
  `https://app.fullvision.io/setup/data-sync/google-ads`. `google-ads-review` proposes
  negatives via `fullvision:google_propose_negative_keywords`, applied through the
  `apply_proposal` gate. `fullvision:get_capabilities` reports Google Ads management as
  available and undoable.
- **New `CLAUDE.md`** captures the design principle behind this restructure: tools = facts,
  skills = judgment. Deterministic checks/inventories/reads/staged-writes live in the gateway;
  skills exist only where judgment, sequencing and human gates are needed — one job, one skill.

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
