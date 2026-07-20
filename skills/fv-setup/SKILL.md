---
name: fv-setup
description: Map which FullVision capabilities are usable right now given the connected MCP servers, and name the single next-best server to connect. Run once after install and whenever a connection changes.
cadence: on-install
requires: [fullvision]
writes: []
---

# fv-setup

Onboarding. Answer one question: **what can this user actually do today, and what is the one
thing they should connect next?**

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. **Probe FullVision.** Call `fullvision:list_views`. If it fails on auth, stop and point the
   user at `/fullvision:fv-login` — one click in the browser. Nothing else in the plugin works
   without this; it is the only non-optional server.
2. **Probe each other server** by making its cheapest read call. Record connected / not
   connected / errored. Do not treat "not connected" as a failure; most users start with one.
3. **Run the data-health precondition** — call `fullvision:query_view` on
   `view:health-identity-recon`, `view:health-checkout-coverage`, `view:health-event-coverage`.
   Summarise in one line each. Full detail is `fv-data-health`'s job.
4. **Build the capability matrix** below from the skill catalog, marking each skill
   available / read-only / unavailable per the degradation rule.
5. **Name exactly one next step.** Not a list. Rank by revenue unlocked per hour of setup
   effort, using the auth-burden column in `docs/mcp-servers.md`: Meta and Webflow are 1-click
   OAuth; Brevo is an API key; Google Ads needs a developer token (days); LinkedIn needs a dev
   app plus app review (weeks). Do not recommend LinkedIn to someone who has connected nothing.

## Degradation rule

- Missing a **read** dependency ⇒ the skill is **unavailable**. Say so, name the server.
- Missing a **write** dependency ⇒ the skill is **read-only**: it runs the full analysis and
  emits a change-list the user applies by hand. This is a normal mode, not an error.

## Output

Follow `shared/report-format.md`, with the verdict replaced by the matrix:

```markdown
# fv-setup — <workspace> — <date>

**Usable today:** <n> of 11 skills (<m> read-only)
**Data health:** <✅ | ⚠️ + what it biases>

| Skill | Status | Blocked on |
|---|---|---|
| fv-data-health | ✅ available | — |
| fv-cut-wasted-spend | ⚠️ read-only | google-ads is read-only by design |
| … | | |

## Connect next: <server>
<why this one, what it unlocks, how long it takes>
```

## Things to state plainly, every run

- **Google Ads is read-only.** The official Google server exposes GAQL reads only. Every
  Google change is emitted as a reviewed change-list the user applies in the Ads UI. This is
  permanent for v1, not a setup problem the user can fix.
- **`fv-build-audience` is read-only in v1** — audience activation is not on the FullVision
  MCP surface yet. It sizes, floor-checks and consent-gates the segment, then hands off to the
  FullVision app.
- **Six MCP servers is a lot of tool schema.** Recommend enabling deferred tool loading
  (`ENABLE_TOOL_SEARCH`) — tool-selection accuracy degrades measurably under heavy MCP load.

## Refuse when

- FullVision itself is unreachable or unauthorised. Nothing downstream is meaningful; do not
  produce a partial matrix.
