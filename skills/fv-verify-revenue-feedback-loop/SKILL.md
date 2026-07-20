---
name: fv-verify-revenue-feedback-loop
description: Verify that closed Stripe revenue is actually reaching Google, Meta and LinkedIn as conversion signal — upload failures, expired events, pLTV sanity — and recommend a mid-funnel goal when deal volume is too low for payment-only optimisation.
cadence: weekly
requires: [fullvision]
writes: []
---

# fv-verify-revenue-feedback-loop

This is the moat skill. Ad platforms optimise toward whatever signal they receive. If real
revenue is not reaching them, every other recommendation in this plugin is being undone by
the platform's own bidding, weekly, silently.

Read `shared/reading-fullvision-data.md` and `shared/sparse-data.md` before calling anything.

## Steps

1. **Precondition:** run `fv-data-health`. On 🚩, abort — upload figures are unreadable when
   identity coverage is broken.
2. **Per platform, is signal flowing?** `fullvision:run_sql_query` against the conversion
   upload ledgers, aggregated in SQL (`$USER_ID` required in every WHERE). Get, per platform,
   for the last 30 days: uploads attempted, succeeded, failed, and terminal-expired.
3. **Meta's 7-day wall specifically.** Meta rejects an event whose `event_time` is older than
   7 days, and one stale event fails the whole batch. Count ledger rows in terminal `expired`
   state. Any sustained non-zero count is a broken loop, not noise.
4. **pLTV sanity (Meta).** Meta receives *first-charge × margin × `pltv_multiplier`*, not
   realised LTV. Compare the implied multiplier against realised LTV/first-charge from
   `view:customer-ltv`. If the multiplier over- or under-states realised LTV by more than 40%,
   flag it — Meta is bidding on a wrong number.
5. **Window honesty.** Google judges on 90-day click age, Meta on a 7-day upload wall with
   pLTV, LinkedIn on 365 days. Report each platform's loop separately. Never merge them.
6. **Is payment-only optimisation viable at all?** Count closed deals per month from
   `view:customer-ltv`. Below **20–30 closed deals/month**, platforms cannot learn from
   payment events alone — there is not enough signal density. Recommend a mid-funnel
   conversion goal with an assigned proxy value (practitioner defaults: MQL ≈ €500,
   SQL ≈ €2,500; derive the actual numbers from the workspace's own MQL→close rate × average
   deal value rather than using those figures literally).

## Thresholds

- Upload success rate below **95%** over 30 days ⇒ flag as broken.
- Any Meta `expired` rows in the last 7 days ⇒ flag; the batch-failure mode means a single
  stale event silently drops good ones.
- pLTV multiplier off realised LTV/first-charge by > **40%** ⇒ flag.
- Closed deals/month < **20** ⇒ recommend a mid-funnel goal.

## Output

`shared/report-format.md`. The verdict is per-platform loop health, one line each.

This skill proposes **no platform writes** — its output is a diagnosis plus, where relevant, a
conversion-goal recommendation the user applies in the platform UI and in FullVision's export
settings.

## Refuse when

- `fv-data-health` returns 🚩.
- Fewer than 30 days of upload ledger history exist — the loop has not run long enough to
  judge.
