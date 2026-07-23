# Handoff: RSA-read unblock + Google Ads asset write tools (sitelinks)

## Goal
Unblock the LP-building session's RSA-headline reads (no dev — tool exists), then extend the gateway's Google Ads write surface with sitelink/asset propose tools, following the established propose→apply→revert pattern.

## Current State
- Branch: `main` (fullvision-plugin), HEAD `d3c42ba`, clean, nothing unpushed.
- Gateway (data.fullvision.io) deployed with the full current surface: `google_ads_search` (GAQL passthrough), `google_list_ad_accounts`, 6 propose kinds (budget, status, ad_text, negative_keywords, tracking_params, conversion goals ×3), lifecycle tools, `check_data_health`, `get_capabilities`.
- All 7 Evaboot campaigns PAUSED (user re-paused pending new LPs). Account 456-010-5719.

## Done
- VERIFIED live: RSA headlines ARE readable — `fullvision:google_ads_search` with:
  `SELECT campaign.name, ad_group.name, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.status != REMOVED AND ad_group_ad.status != REMOVED AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD`
  The LP session that reported "no ad-copy read tool" has a tool list cached from before 2026-07-23's gateway deploy — restarting that session fixes it. (Use `!= REMOVED`, not `= ENABLED`, while campaigns are paused.)
- Whole Google Ads read+write cutover (2026-07-23): full_db PRs #374/#378/#380, full_distrib #313/#314/#316/#317, plugin #8/#10/#11 — all merged+deployed. The mutate pattern to copy lives in `full_db/apps/ingest/src/routes/google-ads-mutate.ts` + `full_db/lib/google-ads/mutate/{types,builders,execute,inverse,caps}.ts`, relayed by `full_distrib/src/mcp/google-ads-tools.ts`.

## Left to Do
1. Tell the LP session (or its next incarnation) to restart and use the GAQL above — update is already noted in `evaboot-website-v2/docs/handoffs/handoff-remaining-ads-landing-pages.md` Gotchas.
2. Design `google_propose_sitelinks` (new mutate kind `sitelinks` in full_db): input `{ customer_id, level: "account"|"campaign", campaign_id?, sitelinks: [{ link_text, final_url, description1?, description2? }] }` (cap ~10). Google model: create `Asset` (sitelink_asset) + link via `customer_asset`/`campaign_asset`; UPDATE of an existing sitelink = new asset + swap link (assets are immutable-ish); undo = restore prior links (snapshot current sitelink assets + links), revert of a create = remove the link + asset REMOVED.
3. Implement in full_db (propose/apply/revert + validation + caps + migration widening the `tool` CHECK — recompute next migration number with `ls supabase/migrations/`), then full_distrib tool, then plugin doc (shared/platforms/google.md + google-ads-review "out of v1" line) — the same 3-repo train as #378/#316/#11.
4. Consider callouts + structured snippets in the same pass (same asset machinery, cheap marginal cost) — ask the user first.

## Files Touched
(nothing in flight — all prior work merged; this handoff is the only new file)

## Files to Modify
- `~/Desktop/cursor/fullvision/full_db`: `apps/ingest/src/routes/google-ads-mutate.ts`, `lib/google-ads/mutate/*.ts`, new `supabase/migrations/29X_*.sql`, tests in `tests/unit/google-ads-mutate-*.test.ts`
- `~/Desktop/cursor/fullvision/full_distrib`: `src/mcp/google-ads-tools.ts`, tests, `docs-mintlify/mcp-server/tools.mdx`
- `~/Desktop/cursor/fullvision/fullvision-plugin`: `shared/platforms/google.md`, `skills/google-ads-review/SKILL.md`, `CHANGELOG.md`

## Key Decisions
- Tools = facts, skills = judgment (plugin CLAUDE.md) — sitelink writes are tools, no new skill.
- Every write is propose→apply→revert with prior-state snapshot; `apply_proposal` takes ids only.
- Cooldown is one RUN per (account, tool) per 24h; proposals join a run via optional `run_id` (all propose tools have it — include it on the new tool).
- Payload category/origin-style enums use proto NAMES; the lib returns numbers — normalize at read time (see `categoryName`/`originName` in `full_db/lib/google-ads/mutate/execute.ts`).

## Gotchas
- Superset worktree paths are `~/.superset/worktrees/<PROJECT-id>/jbjzq/<branch>/` — project id, NOT the workspace id `ws create` returns.
- Deploys are manual: `full_db/scripts/deploy-after-merge.sh` (works for full_distrib too, run from its repo root); stash the main checkout's WIP YOURSELF before running it (the script pops the stash BEFORE `railway up`, which would bundle WIP). Migrations: psql with `DATABASE_URL` from full_db/.env, never `supabase db push`.
- full_db gitignores docs/specs+plans; full_distrib carries local docs-only commits on main — rebase them (`git rebase origin/main`), never reset.
- Account-level sitelinks live on `customer_asset` (campaign_asset returns nothing for them) — audit/mutate both levels.
- Plugin contract test (CI) fails on tool names until the gateway deploy lands — that's the merge gate, not a bug.
- Evaboot's 6 existing account-level sitelinks all point at `/export-sales-navigator-leads-to-excel#<fragment>` — after new LPs ship, updating them to point at the new pages directly is the first real use of the sitelink tool.

## Next Immediate Step
Ask the user to confirm sitelink-tool scope (sitelinks only vs + callouts/snippets), then run the 3-repo build: start in full_db — `~/.superset/bin/superset ws create --local --project 3db8c8b7-9b46-47e6-8f4a-89a438765769 --name sitelink-propose --branch sitelink-propose --base-branch main`, and mirror the `campaign_conversion_goals` kind end-to-end (validation → builders → prior-state read → inverse → caps → route branch → migration → tests).
