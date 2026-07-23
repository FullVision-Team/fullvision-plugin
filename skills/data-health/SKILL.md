---
name: data-health
description: Check identity reconciliation, checkout coverage and event coverage before trusting any FullVision number. Runs standalone and as a precondition inside every other skill.
cadence: precondition
requires: [fullvision]
writes: []
---

# data-health

Bad coverage means every downstream number is a lie. This skill's job is to say so, loudly,
**before** a recommendation gets made on top of it — not to recommend anything itself.

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. `fullvision:query_view` on `view:health-identity-recon` — what share of paying customers
   are linked to a tracked visitor. This caps attribution coverage: unlinked payers have no
   source, so every channel's revenue is understated.
2. `fullvision:query_view` on `view:health-checkout-coverage` — what share of checkouts carry
   a visitor cookie. Low coverage biases *paid* attribution specifically, because paid traffic
   converts faster and is more cookie-dependent.
3. `fullvision:query_view` on `view:health-event-coverage` — are product events arriving. A
   gap here means funnel and engagement views are incomplete for that window.
4. `fullvision:query_view` on `view:ads-measurement-start` — the first Stripe webhook charge.
   Spend before it is unmeasurable. Report the date; every ads skill needs it.
5. Grade and state the bias direction, not just the number.

## Thresholds

| Check | ✅ ok | ⚠️ degraded | 🚩 broken |
|---|---|---|---|
| Identity recon (payers linked) | ≥ 85% | 60–85% | < 60% |
| Checkout coverage (cookie present) | ≥ 80% | 55–80% | < 55% |
| Event coverage (days with events / days in window) | ≥ 95% | 80–95% | < 80% |

These are fixed. Do not adjust them at runtime to make a run pass.

## What each grade means downstream

- **✅** — proceed, report the figure alongside recommendations.
- **⚠️** — proceed, but every ROAS is **biased low** by roughly the coverage gap. State the
  gap in the report and raise the minimum n by 50% for any write decision.
- **🚩** — **stop**. Do not recommend spend changes. The correct output is "fix tracking
  first", naming which check failed and what it breaks. A pause recommendation built on 40%
  identity coverage will pause profitable campaigns.

## As a precondition

Every other skill calls this first and inlines the one-line result in its report header. A
skill that reaches 🚩 aborts its own analysis and returns this skill's output instead.

## Output

`shared/report-format.md`. Verdict is the worst of the three grades.

## Refuse when

- Any health view is unavailable — an unknown coverage figure is not the same as a good one.
