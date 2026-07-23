# fullvision-plugin

A Claude Code plugin for revenue-attributed marketing operations on top of the FullVision gateway.

## Tools = facts, skills = judgment

Deterministic checks, inventories, reads and staged writes live in the gateway as MCP tools
(shipped from `full_distrib`) — health verdicts (`fullvision:check_data_health`), capability
inventory (`fullvision:get_capabilities`), data reads (`query_view`, `google_ads_search`),
and staged mutations (`google_propose_*` → `apply_proposal`). Skills exist only where
judgment, sequencing and human confirmation gates are needed.

**One job = one skill.** Do not split a single session into multiple skills, and do not write
a skill for anything a tool answers. The weekly Google Ads session is one job, so it is one
skill (`google-ads-review`). Before adding a skill, ask: is any part of this a fact a tool
should own? If so, that part belongs in the gateway, not in markdown.

## Naming

Skill names carry no `fv-` prefix — they surface namespaced as `fullvision:<name>`, so a
prefix would say "fullvision" twice.
