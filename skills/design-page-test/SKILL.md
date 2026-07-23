---
name: design-page-test
description: Decide whether a page can support an A/B test at all, and if it can, produce a powered test spec with sample size, duration and a pre-committed stop rule. Most B2B pages cannot, and saying so is the main job.
cadence: on-demand
requires: [fullvision]
writes: []
---

# design-page-test

Most of the time this skill's answer is **no**, and that is the value it adds. An underpowered
A/B test does not return "no result" — it returns a *random winner* with a plausible-looking
lift, which then gets shipped and believed. At B2B traffic volumes that is the normal outcome,
not the edge case.

Read `shared/reading-fullvision-data.md` and `shared/sparse-data.md` before calling anything.

## Steps

1. **Precondition:** call `fullvision:check_data_health`. On red, abort — you cannot power a test on a metric
   you cannot measure.
2. **Measure the page honestly.** `fullvision:query_view` on `view:page-performance` for
   sessions and `view:page-customers` for the conversion baseline. Use the page's own trailing
   90-day numbers. Do not use the account average as a stand-in for a specific page.
3. **Run the power calculation before anything else.** For a two-arm test at 80% power:

   ```
   n_per_arm ≈ 16 × p × (1 − p) / (p × mde)²
   duration_days = (2 × n_per_arm) / daily_sessions
   ```

   where `p` is the observed baseline conversion rate and `mde` the relative minimum
   detectable effect. Compute it for **mde = 0.10, 0.20 and 0.50** and show all three, because
   the honest finding is usually "you can detect a 50% lift, and nothing smaller."
4. **Apply the verdict gate:**

   | Condition | Verdict |
   |---|---|
   | duration ≤ 6 weeks at mde ≤ 0.20 | **test it** — produce the spec |
   | duration ≤ 6 weeks only at mde ≥ 0.50 | **do not test** — only a redesign-scale change is detectable; propose that instead |
   | duration > 6 weeks at every mde | **do not test** — go qualitative |

   Six weeks is the ceiling because beyond it seasonality, traffic-mix shift and cookie decay
   contaminate the comparison faster than the sample accumulates.
5. **When the answer is no, give the alternative that actually works** — per
   `shared/sparse-data.md` §5: 5 user tests surface ~80% of usability issues; 10–15 session
   recordings surface 70–85%. Pair it with the friction evidence from `find-leaky-pages`
   (`view:scroll-depth-by-page`, `view:rageclicks-by-page`, `view:form-performance`) so the
   qualitative work starts from a hypothesis rather than from scratch.
6. **When the answer is yes, write the full spec and pre-commit the stop rule**: hypothesis,
   the single primary metric, sample size per arm, planned duration and end date, and the
   decision rule written **before** the test starts. Then hand the variant build to
   `fix-page`.

## Thresholds — fixed

- Page sessions ≥ **10,000/month** is the practical floor below which step 4 will almost always
  return "do not test" — state the actual computed numbers regardless, never the rule of thumb alone
- Power **80%**, significance **90%** (per `shared/sparse-data.md` §2 — a 95% bar rejects
  everything at these volumes)
- Maximum acceptable duration **6 weeks**
- Minimum **200 conversions per arm** for a revenue-metric test, whatever the session count says

## Rules that are not negotiable

- **One primary metric, chosen before the test runs.** Three metrics at 90% means roughly a
  1-in-4 chance of a false winner on at least one.
- **No peeking.** Checking daily and stopping at significance inflates the false-positive rate
  several-fold. The stop rule is the date, not the p-value.
- **Optimise for revenue, not clicks.** A CTA change that lifts clicks and drops payers is a
  loss. The primary metric must be a paying conversion wherever the volume permits it.
- **Never recommend a test as a way to avoid a decision.** If the evidence already points one
  way and the change is reversible, shipping it and watching the metric is faster and cheaper
  than a six-week test.

## Output

`shared/report-format.md`. The verdict line is test / do-not-test with the computed duration
at each mde, never a hedge.

## Refuse when

- `fullvision:check_data_health` returns red.
- The page has fewer than **500 sessions** in the trailing 90 days — there is not enough data
  to compute a baseline, let alone a test.
- The proposed variant changes pricing, legal copy, or anything in
  `fix-page`'s out-of-scope list.
- The requester wants a test on a metric FullVision cannot observe end to end. Say which part
  of the chain is missing.
