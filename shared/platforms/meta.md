# Meta Ads — platform reference

Reference material, not a skill and not an agent. Every skill that touches Meta reads this.

## Attribution window — the one that misleads

**7-day upload wall, and the value is predicted, not realised.** Meta receives
`first_charge × margin × pltv_multiplier` — a *prediction* of lifetime value derived from the
first charge, not the revenue that actually arrived.

Two consequences that must appear in any report quoting Meta ROAS:

1. **Meta's ROAS is not comparable to Google's on its face.** Google reports realised charges
   over 90 days; Meta reports a modelled LTV at the moment of first charge. Ranking them
   together on raw ROAS compares a measurement to a forecast.
2. **The multiplier is a workspace setting and it can be wrong.** If `pltv_multiplier`
   over-states realised LTV/first-charge by more than 40%, Meta is bidding hard on a number
   the business never collects. `fv-verify-revenue-feedback-loop` checks this explicitly.

## The 7-day wall is a batch-level failure mode

Meta rejects any event whose `event_time` is older than 7 days — and **one stale event fails
the entire batch**, taking good events with it. Charges past the wall are ledgered as terminal
`expired`.

A sustained non-zero `expired` count is a broken loop, not noise. Treat it as an incident.

## Write capability — first-party, via FullVision

Meta campaign changes go through FullVision's own MCP surface, not a Meta server. The OAuth
grant FullVision already holds (`ads_management`, Advanced Access) is read **and** write — the
same connection the customer completed in the FullVision app for spend sync.

Two reversible operations, each a `meta_propose_*` tool that reads live state and stores an undo
before a human sees it:

| Tool | Does |
|---|---|
| `fullvision:meta_propose_campaign_status` | pause / enable a campaign (cascades to child ad sets) |
| `fullvision:meta_propose_adset_budget` | change an ad set's daily budget |

Then `fullvision:meta_apply_proposal` (takes a proposal id, never a payload),
`fullvision:meta_revert_mutation`, `fullvision:meta_revert_run` and
`fullvision:meta_list_pending_proposals`.

**Out of scope for v1, and a skill must refuse them outright:** bidding, targeting, creative, and
creating or deleting campaigns/ad sets/ads.

**Ad-set budgets under a Campaign Budget Optimization (CBO) campaign are refused at propose** —
the budget lives on the campaign, not the ad set. This is not a failure; it is the honest answer.

**Pausing a campaign cascades to its child ad sets.** The undo re-enables the campaign; it does
not reconstruct which child ad sets were independently paused beforehand.

Do not suggest installing a community write server. A server with a token that can spend the
customer's money has not been reviewed.

## Match quality

`fbc` is derived server-side as `fb.1.<first_touch_ms>.<fbclid>`; `fbp` passes through from
the `_fbp` Pixel cookie captured by the tracker; `external_id` is `sha256(person.id)`. All
three raise Event Match Quality, and EMQ materially affects delivery. Events use
`action_source: system_generated` — backend conversions carry no user agent or URL.

## Custom Audiences

Floor is **100 matched**, so 300–500 raw at the B2B match rate. Sync is delta-only: entered
contacts are added, exited contacts are removed, in ≤10k batches with `session_id` +
`batch_seq` chaining. Consent rules are identical to Google's — hashing is not a legal basis.
See `fv-build-audience`.
