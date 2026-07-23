---
name: fix-striking-distance
description: Find pages ranking just off page one where a title and meta rewrite moves real revenue, size the gain, and hand the specific edit to fix-page. Ranks by revenue at stake, not by position.
cadence: monthly
requires: [fullvision]
writes: []
---

# fix-striking-distance

Positions 5–20 are where the cheapest SEO revenue lives: the page already ranks, Google
already trusts it, and the gap is usually the snippet rather than the content. This skill
finds those pages and sizes the prize. It does **not** edit anything — `fix-page` owns the
write path, and duplicating that machinery here would mean two skills that can change a
website.

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. **Precondition:** call `fullvision:check_data_health`. On red, abort.
2. **Pull the striking-distance set.** `fullvision:query_view` on
   `view:gsc-striking-candidates`. This view exists precisely for this job and nothing
   currently uses it.
3. **Attach revenue, not traffic.** Join each candidate page to `view:page-customers` and
   `view:gsc-by-page`. A page at position 11 with buying intent beats a page at position 6
   without it, every time.
4. **Size the gain honestly.** Use the account's own observed CTR-by-position curve from
   `view:gsc-performance` — never a published industry CTR table, which is drawn from a
   different SERP layout than the one this query actually renders.

   ```
   projected_clicks  = impressions × (ctr_at_target_position − ctr_at_current_position)
   projected_revenue = projected_clicks × page_observed_conversion_rate × median_customer_ltv
   ```

   Use the page's **own** conversion rate where it has ≥ 30 sessions; fall back to the account
   median and say you did. Apply shrinkage per `shared/sparse-data.md` §3, k = 10.
5. **Diagnose the specific gap per page.** Low CTR at a good position is a snippet problem
   (title, meta description, intent mismatch). Good CTR with no conversions is a landing-page
   problem, which is `find-leaky-pages`' job — route it there instead of proposing a title
   rewrite that cannot fix it.
6. **Write the proposed title and meta description** for each page, with the current one
   alongside for comparison, then **hand off to `fix-page`** with the URL and the exact
   proposed strings. That skill applies it as a GitHub PR or a Webflow write under the
   two-turn rule.

## Thresholds — fixed

- Current position between **5 and 20**
- Page impressions ≥ **300** over the trailing 90 days
- Projected revenue gain ≥ **€500** over the following 90 days
- Shortlist capped at **10 pages**
- Confidence stated at **80%**

## Ranking honesty

A projected gain is a forecast, not a measurement, and it assumes the rewrite achieves the
target position — which is not in your control. Label every projection as a projection in the
report. Never sum them into a single headline number; ten uncertain forecasts added together
do not become one certain one.

## Output

`shared/report-format.md`. One line per page: URL, query, current position, impressions,
current CTR vs account CTR at that position, projected revenue gain, and the proposed
title/meta.

## Refuse when

- `fullvision:check_data_health` returns red.
- No `gsc_connection` exists for the workspace.
- Fewer than 3 pages clear the thresholds — say the account is too small for this sweep.
- The page's problem is conversion rather than CTR — route to `find-leaky-pages` instead of
  proposing a snippet rewrite that cannot move revenue.
