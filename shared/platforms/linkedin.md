# LinkedIn Ads — platform reference

Reference material, not a skill and not an agent. Every skill that touches LinkedIn reads this.

## Attribution window — the honest one

**365 days, and the value is real.** LinkedIn's wall is upload lag only, not a modelling
horizon, so the revenue reported against a LinkedIn campaign is genuine 12-month realised LTV.

This makes LinkedIn the *most* trustworthy of the three windows and, awkwardly, the one that
looks worst on a short window. A 30-day LinkedIn ROAS on a B2B account with a 90-day sales
cycle is close to meaningless. Judge LinkedIn over **at least 180 days**, and say so.

Never rank LinkedIn against Meta on the same table without stating this. Meta's number is a
7-day prediction; LinkedIn's is a year of collected cash. They are different quantities.

## Auth burden — none beyond the FullVision app

No separate LinkedIn developer app, no app review, no standalone access token. Both spend sync
and campaign writes ride the single `rw_ads` OAuth grant the customer completes in the FullVision
app — the same MDP-approved connection, read and write. The old community server's own-dev-app
plus weeks-of-app-review burden is gone with it.

## Write capability — first-party, via FullVision

> **Hidden for now.** The `linkedin_propose_*` tools below exist server-side but are not exposed
> on the MCP surface yet — Google is the only mutable platform today. Treat LinkedIn as
> reads-only (via `fullvision:query_view`) and never promise a LinkedIn write in a session.

LinkedIn campaign changes go through FullVision's own MCP surface, not a community server (the
old one is now removed). The OAuth grant FullVision already holds (`rw_ads`, MDP-approved) is
read **and** write.

| Tool | Does |
|---|---|
| `fullvision:linkedin_propose_campaign_status` | pause / enable a campaign |
| `fullvision:linkedin_propose_campaign_group_budget` | change a **campaign group's** daily budget |

Then `fullvision:linkedin_apply_proposal`, `fullvision:linkedin_revert_mutation`,
`fullvision:linkedin_revert_run` and `fullvision:linkedin_list_pending_proposals`.

**Budget is set at the campaign _group_ level, never the campaign** — LinkedIn deprecated
campaign-level budgets in 2020. A budget change naming a campaign is refused with that message.

**Out of scope for v1:** bidding, targeting, creative, create/delete. Same caps as every platform:
max 5 status changes / 3 budget changes per run, ±20% per budget change, 15% of trailing-30d
account spend, one run per account per 24h, 60-minute proposal TTL.

Do not suggest installing a community write server.

## Cost profile

LinkedIn CPCs run several times Google's for the same intent. A campaign that looks
catastrophic on cost-per-click can be the account's best on cost-per-*payer*. Never judge
LinkedIn on click-level metrics; go straight to payers and revenue, which is the whole point
of having FullVision in the loop.

Because CPCs are high, LinkedIn campaigns hit the minimum-spend thresholds in write skills
quickly but accumulate the minimum *conversion* counts slowly. That asymmetry is exactly what
`shared/sparse-data.md` exists for — a LinkedIn campaign will clear the spend gate long before
it clears the n gate. Do not let the spend figure alone trigger a recommendation.

## Matched Audiences

Floor is **300 matched** and LinkedIn's own recommendation is 50,000 — so a raw list of
**1,500+** at the B2B match rate, the highest bar of the three platforms. Audience delivery
stays dark until `audiences_enabled` is set on the connection. See `build-audience`.
