# Google Ads — platform reference

Reference material, not a skill and not an agent. Every skill that touches Google reads this.
Platform difference is an *input* to a skill, not a separate specialist.

## Attribution window

**90-day click age.** A charge counts if it lands within 90 days of the click. This is actual
realised revenue, not a prediction — which makes Google the most trustworthy of the three
platforms and the one whose numbers are directly comparable to Stripe.

Judge Google on a trailing 90-day window. A shorter window systematically understates it.

## Write capability — none

The official `googleads/google-ads-mcp` server exposes **GAQL reads only**. There is no
supported write path in this plugin. Every Google change ships as a reviewed change-list the
user applies in the Ads UI (`shared/safety-rails.md` §9). This is permanent for v1.

Do not suggest installing a community write server to work around it. A server with an OAuth
token that can restructure campaigns is a server that can spend the customer's money, and it
has not been reviewed.

## Auth burden

Developer token approval takes **days** and requires a Google Ads manager account, plus a
working Python toolchain for `pipx`. Never recommend Google as someone's first connection.

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
recommendation. `fv-verify-revenue-feedback-loop` checks this.

Below roughly **20–30 closed deals/month** Google's bidding cannot learn from payment events
alone — recommend a mid-funnel goal with an assigned proxy value instead.

## Customer Match

Floor is **100 matched** members (lowered from 1,000 in 2026). At the structural B2B match
rate of ~20%, that needs a raw list of ~500. Consent requires `ad_user_data` and
`ad_personalization` both GRANTED per EEA user, with no B2B or work-email carve-out. See
`fv-build-audience`.
