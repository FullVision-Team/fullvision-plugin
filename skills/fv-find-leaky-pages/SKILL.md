---
name: fv-find-leaky-pages
description: Rank landing pages by revenue lost, not bounce rate, and produce a shortlist with evidence for each. Feeds fv-fix-page.
cadence: weekly
requires: [fullvision]
writes: []
---

# fv-find-leaky-pages

Bounce rate ranks pages by how annoying they are. This ranks them by **how much money they
cost**, which is a different and much shorter list.

Read `shared/reading-fullvision-data.md` and `shared/sparse-data.md` before calling anything.

## Steps

1. **Precondition:** run `fv-data-health`. On 🚩, abort.
2. **Pull traffic and revenue per page.** `fullvision:query_view` on `view:page-performance`
   and `view:page-customers` for the trailing 90 days.
3. **Compute lost revenue per page:**

   ```
   expected_customers = sessions × account_median_conversion_rate
   lost_revenue       = (expected_customers − actual_customers) × median_customer_ltv
   ```

   Use the **median** conversion rate and LTV, not the mean — one enterprise deal will
   otherwise make every page look broken. Apply shrinkage per `shared/sparse-data.md` §3 with
   prior weight k = 10 against the account conversion rate.
4. **Attach friction evidence** for the top candidates only (these are expensive calls):
   `view:engagement-by-page`, `view:scroll-depth-by-page`, `view:rageclicks-by-page`,
   `view:dead-clicks-by-page`, `view:form-performance`, `view:conversion-funnel`.
5. **Separate paid from organic.** A paid landing page that leaks is urgent (money is flowing
   into it right now); an organic page that leaks is a content job. Use `view:ad-landing-pages`
   to split them, and rank paid first.
6. **Hand off.** Name `fv-fix-page` and the specific URL for the top 3. Do not attempt fixes
   here.

## Thresholds — fixed

- Page sessions ≥ **500** over the trailing 90 days
- Lost revenue ≥ **€1,000** over the window
- Shortlist capped at **10 pages** — a longer list does not get acted on
- Confidence stated at **80%**

## Testing recommendations

Per `shared/sparse-data.md` §5: below **10,000 visitors/month** on a page, do **not** propose
an A/B test. Recommend 5 user tests (≈80% of usability issues) or 10–15 session recordings
(70–85%) instead, and say why. Above it, state the required sample size and duration before
proposing a variant.

## Output

`shared/report-format.md`. One line per page: URL, sessions, actual vs expected customers,
lost revenue, the dominant friction signal, and paid/organic.

## Refuse when

- `fv-data-health` returns 🚩.
- Fewer than 3 pages clear the thresholds — report the account is too small for this sweep and
  point at `fv-diagnose-page` (v2) for single-URL work.
