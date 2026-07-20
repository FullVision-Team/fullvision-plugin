# Changelog

All notable changes to the FullVision plugin.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
