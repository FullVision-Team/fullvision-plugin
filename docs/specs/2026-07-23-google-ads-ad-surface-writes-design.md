# Google Ads ad-surface writes: paths, pinning, sitelinks, callouts, structured snippets

**Date:** 2026-07-23
**Repos:** full_db → full_distrib → fullvision-plugin (same 3-repo train as PRs #378/#316/#11)
**Goal:** make every detail that renders in a Google ad editable through the gateway's propose→apply→revert pattern. Reads need nothing — `google_ads_search` (GAQL) already covers inspection of any ad detail.

## Scope

In: display paths + headline/description pinning (extend existing `ad_text` kind); sitelinks, callouts, structured snippets (three new asset-backed kinds, account + campaign level).
Out: images/logos, keywords, CPC bids, campaign settings (geo/schedule/bidding/audiences), ad-group-level asset links (YAGNI — Evaboot uses account-level; campaign-level covers per-LP targeting).

## Tool surface

### `google_propose_ad_text` (extended, same kind)

- `headlines` / `descriptions` entries: `string | { text, pin }`. Plain strings keep working; pinning opt-in. Pins: `HEADLINE_1..3`, `DESCRIPTION_1..2`. Reject unknown pins.
- New per-item `path1`, `path2` (≤15 chars each; `path2` requires `path1`).

### Three new propose tools

Shared shape: `{ customer_id, level: "account"|"campaign", campaign_id?, <items>, run_id? }`. `level=campaign` ⇒ `campaign_id` required.

| Tool | Items | Caps |
|---|---|---|
| `google_propose_sitelinks` | `{ link_text ≤25, final_url (uri), description1? ≤35, description2? ≤35 }` | ≤10 |
| `google_propose_callouts` | `{ text ≤25 }` | ≤10 |
| `google_propose_structured_snippets` | `{ header (Google's fixed enum), values: 3–10 × ≤25 }` | ≤5 headers |

### Semantics: declarative replace

A proposal states the desired **full set** at that level, not add/remove verbs. Workflow: read current set via GAQL → propose corrected set. Google's asset model makes edits new-asset-plus-link-swap anyway (assets are immutable-ish), so replace is the honest primitive and makes revert trivial.

### Apply / revert

- Apply: snapshot prior links + their asset payloads → create new assets → swap links. The swap (all unlinks + all links for one proposal) MUST execute as a single atomic mutate request with partial failure disabled — never two requests, or a failure between them leaves the surface half-cleared.
- Revert: re-link prior assets (never deleted, only unlinked); unlink + REMOVE assets this run created.
- Framework inherited unchanged: 60-min proposal expiry, `run_id` grouping, one run per (account, tool) per 24h, `apply_proposal` takes ids only.

## full_db internals

- New shared module `lib/google-ads/mutate/assets.ts`: build asset payloads (sitelink/callout/snippet), read current links at a level (`customer_asset` / `campaign_asset` GAQL — account-level sitelinks live on `customer_asset` only), build link/unlink ops, build inverse. The three kinds are thin wrappers over it.
- Three new mutate kinds `sitelinks`, `callouts`, `structured_snippets` wired through the existing pipeline (validation → builders → prior-state read → inverse → caps → route branch in `apps/ingest/src/routes/google-ads-mutate.ts`), mirroring `campaign_conversion_goals` end-to-end.
- `ad_text` extension: normalize `string | {text, pin}` to `AdTextAsset` with `pinned_field`; add `path1`/`path2` to the update mask. The prior-state read MUST be extended to select `path1`, `path2` and each headline/description `pinned_field` — if the snapshot GAQL omits them, revert silently loses pins/paths.
- Migration widening the `tool` CHECK to the three new kinds (recompute number from `ls supabase/migrations/` at execution; apply via psql with `DATABASE_URL`, never `supabase db push`).
- Enum handling: payload category/field-type enums use proto NAMES; the lib returns numbers — normalize at read time (see `categoryName`/`originName` pattern in `execute.ts`).

## Validation (trust boundary — no laziness here)

Char limits per field; `path2` ⇒ `path1`; `level=campaign` ⇒ `campaign_id`; snippet header must match Google's fixed header list; snippet values 3–10; pins from the closed enum; `customer_id` digits-only (existing pattern). At most one pending proposal per `(customer_id, tool, level, campaign_id|account)` — declarative replace makes a second one order-dependent on apply/revert, so reject it at propose time. All validated at propose time so apply can't half-fail on bad input.

## Error handling

Per-proposal atomic apply (existing pattern). New failure mode — asset created but link swap failed: the run's recorded inverse includes REMOVE for every created asset, so `revert_run` cleans up strays. A failed apply leaves prior links untouched.

## full_distrib

Register the three tools + extend the `ad_text` schema in `src/mcp/google-ads-tools.ts`; tests; `docs-mintlify/mcp-server/tools.mdx`.

## Plugin

`shared/platforms/google.md` — document the new surface + declarative-replace semantics. `skills/google-ads-review/SKILL.md` — move sitelinks/callouts/snippets from "out of v1" to in-scope. `CHANGELOG.md`. No new skill: writes are tools (tools = facts, skills = judgment).

## Testing

Unit tests per kind in `full_db/tests/unit/google-ads-mutate-*.test.ts` (validation, builder output, inverse correctness — same style as existing kinds). Plugin contract test stays red until the gateway deploy lands (that is the merge gate, not a bug). First real use: repoint Evaboot's 6 account-level sitelinks (all currently `/export-sales-navigator-leads-to-excel#<fragment>`) at the new LPs.

## File Inventory

- `full_db/apps/ingest/src/routes/google-ads-mutate.ts` — add route branches for the three kinds; extend `ad_text` branch.
- `full_db/lib/google-ads/mutate/types.ts`, `builders.ts`, `execute.ts`, `inverse.ts`, `caps.ts` — extend per kind.
- `full_db/lib/google-ads/mutate/assets.ts` — net-new shared asset module.
- `full_db/supabase/migrations/29X_*.sql` — net-new, tool CHECK widening.
- `full_db/tests/unit/google-ads-mutate-*.test.ts` — new test files per kind.
- `full_distrib/src/mcp/google-ads-tools.ts` — three tool registrations + ad_text schema extension. Docs: `docs-mintlify/mcp-server/tools.mdx`.
- `fullvision-plugin/shared/platforms/google.md`, `skills/google-ads-review/SKILL.md`, `CHANGELOG.md`.

Line ranges resolved at planning (writing-plans greps the mutate pipeline per kind). Planning must also verify the full_db google-ads lib exposes asset / `customer_asset` / `campaign_asset` mutate operations, and lift exact proto field names, pin enum values, snippet header enum and char limits from the lib's proto version — the numbers in this spec are from Google's docs, the lib is authoritative.

## Execution notes (from handoff, binding)

- Workspace: `~/.superset/bin/superset ws create --local --project 3db8c8b7-9b46-47e6-8f4a-89a438765769 --name ad-surface-writes --branch ad-surface-writes --base-branch main` (full_db first; worktree paths use the PROJECT id).
- Deploys manual: `full_db/scripts/deploy-after-merge.sh` (also for full_distrib from its root); stash main-checkout WIP yourself before running it.
- full_db gitignores specs/plans — plan docs for that repo stay local-only.
