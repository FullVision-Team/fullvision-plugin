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

## Auth burden — the highest in the bundle

Requires the customer's own LinkedIn developer app **plus LinkedIn app review**, which takes
**weeks**. Never recommend LinkedIn as a first connection. In practice it is the last server a
workspace connects, and often not at all.

## Supply-chain note

The LinkedIn server is the only **community** server in the bundle
(`danielpopamd/linkedin-ads-mcp`, 25★), pinned to a reviewed 40-char SHA. It holds a token
that can spend money. Bumping that pin is a security review, not a chore — read the diff, not
the changelog. See `docs/mcp-servers.md`.

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
stays dark until `audiences_enabled` is set on the connection. See `fv-build-audience`.
