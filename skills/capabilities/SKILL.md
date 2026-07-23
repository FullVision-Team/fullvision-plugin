---
name: capabilities
description: Map which FullVision capabilities are usable right now given the connected MCP servers, and name the single next-best server to connect. Run whenever a connection changes, or to see what the plugin can do today.
cadence: on-demand
requires: [fullvision]
writes: []
---

# capabilities

Answer one question: **what can this user actually do today, and what is the one
thing they should connect next?**

This assumes FullVision is already connected. Getting there is someone else's job: `login`
connects this machine, and `onboard` covers the whole path from no account to first data.

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. **Probe FullVision.** Call `fullvision:list_views`. If it fails on auth, stop and route
   them by what they are missing: an existing user who just needs this machine connected wants
   `/fullvision:login` — one click in the browser; someone with no account, tracker or
   revenue data yet wants `/fullvision:onboard`, which covers the whole path. Either way,
   do not ask them to go find a key.
2. **Probe each other server** by making its cheapest read call. Record connected / not
   connected / errored. Do not treat "not connected" as a failure; most users start with one.
3. **Run the data-health precondition** — call `fullvision:query_view` on
   `view:health-identity-recon`, `view:health-checkout-coverage`, `view:health-event-coverage`.
   Summarise in one line each. Full detail is `data-health`'s job.
4. **Build the capability matrix** below from the skill catalog, marking each skill
   available / read-only / unavailable per the degradation rule.
5. **Name exactly one next step.** Not a list. Rank by revenue unlocked per hour of setup
   effort, using the auth-burden column in `docs/mcp-servers.md`: Webflow is 1-click OAuth;
   Brevo is an API key. Google, Meta and LinkedIn ad management is first-party — it rides the
   FullVision app connection the customer likely already completed for spend sync, not a
   separate server, so there is nothing extra to connect.

## Degradation rule

- Missing a **read** dependency ⇒ the skill is **unavailable**. Say so, name the server.
- Missing a **write** dependency ⇒ the skill is **read-only**: it runs the full analysis and
  emits a change-list the user applies by hand. This is a normal mode, not an error.

## Output

Follow `shared/report-format.md`, with the verdict replaced by the matrix:

```markdown
# capabilities — <workspace> — <date>

**Usable today:** <n> of 10 analysis skills (<m> read-only)
**Data health:** <✅ | ⚠️ + what it biases>

| Skill | Status | Blocked on |
|---|---|---|
| data-health | ✅ available | — |
| cut-wasted-spend | ✅ available | negatives proposed via `fullvision:google_propose_negative_keywords` (undoable, proposed→apply) |
| Google Ads | ✅ manage | GAQL reads via `fullvision:google_ads_search`; pause/enable + budget via `fullvision:google_propose_*` (undoable, proposed→apply) |
| Meta Ads | ⏸ reads only | write tools are hidden from the MCP surface for now (Google-only mutate); reads via `fullvision:query_view` ads views |
| LinkedIn Ads | ⏸ reads only | write tools are hidden from the MCP surface for now (Google-only mutate); reads via `fullvision:query_view` ads views |
| … | | |

## Connect next: <server>
<why this one, what it unlocks, how long it takes>
```

## Things to state plainly, every run

- **`build-audience` is read-only in v1** — audience activation is not on the FullVision
  MCP surface yet. It sizes, floor-checks and consent-gates the segment, then hands off to the
  FullVision app.
- **Google Ads management is first-party and undoable.** Reads go through
  `fullvision:google_ads_search` (GAQL passthrough) / `fullvision:query_view`; pause/enable and
  budget changes go through `fullvision:google_propose_*` — reads live state, stores an undo,
  applied only by proposal id after an explicit yes. No vendor write server, no separate token.
  Meta and LinkedIn write tools exist server-side but are hidden from the MCP surface for now —
  Google is the only mutable platform; say so rather than promising Meta/LinkedIn writes.
  Out of v1: bidding, targeting, creative, create/delete.
- **Three MCP servers is a lot of tool schema.** Recommend enabling deferred tool loading
  (`ENABLE_TOOL_SEARCH`) — tool-selection accuracy degrades measurably under heavy MCP load.

## Refuse when

- FullVision itself is unreachable or unauthorised. Nothing downstream is meaningful; do not
  produce a partial matrix.
