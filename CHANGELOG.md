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
