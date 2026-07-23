# Google Ads — platform reference

Reference material, not a skill and not an agent. Every skill that touches Google reads this.
Platform difference is an *input* to a skill, not a separate specialist.

## Attribution window

**90-day click age.** A charge counts if it lands within 90 days of the click. This is actual
realised revenue, not a prediction — which makes Google the most trustworthy of the three
platforms and the one whose numbers are directly comparable to Stripe.

Judge Google on a trailing 90-day window. A shorter window systematically understates it.

## Read + write capability — first-party, via the FullVision gateway

Reads go through `fullvision:google_ads_search` — a GAQL passthrough capped at LIMIT 1000 by
default (10000 max) and tenancy-scoped to the workspace's connected accounts — plus
`fullvision:google_list_ad_accounts`. Writes go through `fullvision:google_propose_*` (campaign
budget/status, ad text, negative keywords, tracking params) and `fullvision:google_check_ad_status`,
applied only through the `apply_proposal` human gate and reversible with `revert_mutation`. No
vendor server, no developer token, no Python toolchain.

## Connection

Google Ads connects through the FullVision app OAuth at
https://app.fullvision.io/setup/data-sync/google-ads — the same connection that syncs spend.
Nothing to install and no developer token to request.

## Querying discipline

- GAQL is not SQL. No `JOIN`, no `GROUP BY`, no subqueries. One resource per query, and
  segments fan the result out rather than aggregating it.
- `segments.date` in the `WHERE` clause is mandatory in practice — an unbounded query over a
  large account will time out.
- Metrics come back in **micros** (1,000,000 = one unit of account currency). Divide before
  reporting or every number is a million times too large.
- The API's own `conversions` field is Google's attribution, not FullVision's. They will not
  match and FullVision wins (`shared/reading-fullvision-data.md`). Use Google's numbers for
  spend and clicks; use FullVision's for revenue and payers.

## Conversion feedback loop

FullVision exports payment conversions with a flat pLTV value. Google's smart bidding
optimises toward whatever it receives, so a broken export silently undoes every
recommendation. `verify-revenue-feedback-loop` checks this.

Below roughly **20–30 closed deals/month** Google's bidding cannot learn from payment events
alone — recommend a mid-funnel goal with an assigned proxy value instead.

## Customer Match

Floor is **100 matched** members (lowered from 1,000 in 2026). At the structural B2B match
rate of ~20%, that needs a raw list of ~500. Consent requires `ad_user_data` and
`ad_personalization` both GRANTED per EEA user, with no B2B or work-email carve-out. See
`build-audience`.
