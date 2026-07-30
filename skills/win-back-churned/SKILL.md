---
name: win-back-churned
description: Identify churned customers worth winning back, segmented by why they left and what they were worth, and emit the segments plus a campaign brief as an artifact you activate in whatever ESP you use. Emails real people, so every gate here is hard.
cadence: monthly
requires: [fullvision]
writes: []
---

# win-back-churned

The cheapest revenue in the business is a customer who already paid you once. It is also the
easiest to destroy permanently: a badly targeted win-back mail to someone who left angry buys
an unsubscribe and a spam complaint, and spam complaints are priced per domain, not per
campaign.

This skill sends nothing, and it writes nothing anywhere. It produces segments and a brief. A
human loads them into their own ESP and presses send.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## Steps

1. **Precondition — the identity gate, and it is hard.** Call `fullvision:check_data_health`.
   Report the global verdict as context (`shared/safety-rails.md` §10), then **stop** if
   `health-identity-recon` or `health-checkout-coverage` is degraded: you would be mailing
   people on a broken identity graph, which is how the wrong human gets someone else's email.
   §10's false-negative carve-out does not reach this skill — a bad identity join here does not
   understate a ranking, it **misdirects mail** to a named person, and an unsubscribe and a spam
   complaint are not recoverable next run. `health-event-coverage` does not gate this skill; no
   segment below rests on pageviews.
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
   automatic legitimate-interest recipient. Require a live marketing-consent flag. Suppression
   does not become optional just because this skill no longer talks to an ESP: the user **must**
   apply their own ESP's suppression list — unsubscribes, bounces and complaint-flags — to
   these segments before sending, and the artifact **must state that instruction explicitly**.
   If the consent field does not exist in the data, that is a refusal, not a caveat.
6. **Emit the change-list and STOP.** Two turns, always (`shared/safety-rails.md` §1). The
   change-list is: segment definitions, per-segment counts, the recoverable revenue estimate
   with its n, a proposed segment/list name, and a campaign brief per segment (angle, the
   specific reason to return, and what NOT to say).
7. **On confirmation: hand over the final artifact, then stop.** There is no API write left to
   perform. Write the change log entry, then deliver the artifact — the segments and their
   contacts, the per-segment brief, and the step-5 suppression instruction. **The artifact is
   the entire output; nothing is written anywhere.** Do not create, schedule or send a campaign
   from here under any circumstance — a human reviews the copy and presses send in their own
   ESP.

## Thresholds — fixed, never runtime-adjusted

- Churned ≥ **60 days** ago — anything fresher is still the CS team's conversation, not marketing's
- Churned ≤ **540 days** ago — beyond that, consent is stale and the product they used is gone
- Prior lifetime value ≥ **€200** — below it the win-back is not worth the deliverability risk
- Minimum segment size **25 contacts** — below that this is a human writing 25 personal emails,
  which converts better anyway. Say so instead of staging a list.
- Confidence stated at **80%**

## Blast radius

- Max **1 segment list per run**, max **2,000 contacts**.
- Max **1 run per account per 30 days.** Re-mailing the same lapsed population monthly is how
  a sending domain dies.
- **Never** stage a contact who appears in a win-back list from the previous 180 days. Check
  the change log at `.fullvision/changes/` before proposing.
- Send, schedule and campaign creation are **out of scope in every mode** — not a blast-radius
  cap, a hard boundary.

## Read-only by construction

This skill has no send destination and performs no API write, so every run is read-only. It
runs the entire analysis and emits the change-list as an artifact: segment definitions, counts,
the recoverable-revenue estimate, a CSV-shaped contact list, the campaign brief, and the
suppression instruction from step 5. This is the normal outcome per `shared/safety-rails.md`
§9, not a degraded one — activation happens by hand in whatever ESP the user runs.

## Output

`shared/report-format.md`. Verdict is recoverable revenue with its n, per segment — never a
single blended number, because the four segments have genuinely different odds.

## Refuse when

- `health-identity-recon` or `health-checkout-coverage` is degraded (step 1) — the harm is a
  misdirected email to a real person, not an understated ranking, so this stop is hard where a
  read-only skill's is not.
- The marketing-consent field is absent from the data.
- No segment clears the 25-contact minimum.
- The account churned fewer than **40 customers** in total over the window — at that volume
  the segmentation is noise and a human should read the list by hand.
- Anyone asks this skill to send, schedule, or write final campaign copy. It stages and
  briefs; it does not send.
