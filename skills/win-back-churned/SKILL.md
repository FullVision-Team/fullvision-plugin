---
name: win-back-churned
description: Identify churned customers worth winning back, segmented by why they left and what they were worth, and stage a Brevo list plus a campaign brief. Emails real people, so every gate here is hard.
cadence: monthly
requires: [fullvision, brevo]
writes: [brevo]
---

# win-back-churned

The cheapest revenue in the business is a customer who already paid you once. It is also the
easiest to destroy permanently: a badly targeted win-back mail to someone who left angry buys
an unsubscribe and a spam complaint, and spam complaints are priced per domain, not per
campaign.

This skill sends nothing. It stages a list and writes a brief. A human presses send.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## Steps

1. **Precondition:** run `data-health`. On 🚩, abort — you would be mailing people based on
   a broken identity graph, which is how the wrong human gets someone else's email.
2. **Define churn correctly.** Call `fullvision:get_guidance` with domain `churn` **first**.
   Churn is not `subscription.status = 'canceled'`; delinquent churn, voluntary churn and
   contraction are different populations with different win-back odds, and a failed payment is
   not a decision to leave. Treat delinquent churn as a **billing** problem and route it out of
   this campaign — mailing "we miss you" to someone whose card expired is insulting.
3. **Pull the population.** Revenue views are hidden from the MCP surface, so churn shape and
   per-customer churn events come from `fullvision:run_sql_query` (the `churn` guidance from
   step 2 names the tables and the churn-classification rules). Use `fullvision:query_view` on
   `view:customer-ltv` for what each was worth. Aggregate in SQL.
4. **Segment by why they left and what they were worth**, not by recency alone:

   | Segment | Signal | Win-back odds |
   |---|---|---|
   | Involuntary | delinquent churn, no cancel intent | high — this is a billing fix, not a campaign |
   | Value-realised | used the product, then left | medium — a changelog beats a discount |
   | Never-activated | churned before meaningful usage | low — onboarding failed; a mail will not fix it |
   | Contracted-then-left | downgraded, then cancelled | medium — price or scope objection |

5. **Check consent and suppression before proposing anything.** Per `shared/safety-rails.md`
   and the consent discipline in `build-audience`: a lapsed customer is **not** an
   automatic legitimate-interest recipient. Require a live marketing-consent flag, and
   exclude anyone already unsubscribed, bounced, or complaint-flagged in Brevo. If the consent
   field does not exist in the data, that is a refusal, not a caveat.
6. **Emit the change-list and STOP.** Two turns, always (`shared/safety-rails.md` §1). The
   change-list is: segment definitions, per-segment counts, the recoverable revenue estimate
   with its n, the proposed Brevo list name, and a campaign brief per segment (angle, the
   specific reason to return, and what NOT to say).
7. **On confirmation:** write the change log entry first, then create the Brevo list and add
   contacts. **Creating a list is the entire write.** Do not create, schedule or send a
   campaign from here under any circumstance — a human reviews the copy and presses send in
   Brevo.

## Thresholds — fixed, never runtime-adjusted

- Churned ≥ **60 days** ago — anything fresher is still the CS team's conversation, not marketing's
- Churned ≤ **540 days** ago — beyond that, consent is stale and the product they used is gone
- Prior lifetime value ≥ **€200** — below it the win-back is not worth the deliverability risk
- Minimum segment size **25 contacts** — below that this is a human writing 25 personal emails,
  which converts better anyway. Say so instead of staging a list.
- Confidence stated at **80%**

## Blast radius

- Max **1 list staged per run**, max **2,000 contacts**.
- Max **1 run per account per 30 days.** Re-mailing the same lapsed population monthly is how
  a sending domain dies.
- **Never** stage a contact who appears in a win-back list from the previous 180 days. Check
  the change log at `.fullvision/changes/` before proposing.
- Send, schedule and campaign creation are **out of scope in every mode** — not a blast-radius
  cap, a hard boundary.

## Read-only mode

If `brevo` is not connected, run the entire analysis and emit the change-list as an artifact:
segment definitions, counts, the recoverable-revenue estimate, and a CSV-shaped contact list
with the campaign brief. This is a normal outcome per `shared/safety-rails.md` §9, not a
failure.

## Output

`shared/report-format.md`. Verdict is recoverable revenue with its n, per segment — never a
single blended number, because the four segments have genuinely different odds.

## Refuse when

- `data-health` returns 🚩.
- The marketing-consent field is absent from the data.
- No segment clears the 25-contact minimum.
- The account churned fewer than **40 customers** in total over the window — at that volume
  the segmentation is noise and a human should read the list by hand.
- Anyone asks this skill to send, schedule, or write final campaign copy. It stages and
  briefs; it does not send.
