---
name: fv-find-keyword-gaps
description: Find search queries that already impress but do not convert to paying customers, and queries the site ranks for by accident. Ranks SEO opportunity by revenue, not by search volume.
cadence: monthly
requires: [fullvision]
writes: []
---

# fv-find-keyword-gaps

Keyword tools rank opportunity by search volume, which is a proxy for traffic, which is a
proxy for money. FullVision does not need the proxies — it can see which queries produced
Stripe revenue and which produced nothing. Rank on that.

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. **Precondition:** run `fv-data-health`. On 🚩, abort — query→revenue linkage runs through
   the same identity graph.
2. **Pull the demand surface.** `fullvision:query_view` on `view:gsc-content-gap-candidates`
   for queries the site surfaces for without dedicated content, and
   `view:gsc-query-trend` for direction of travel. A query that is decaying is a different
   job from one that is emerging; say which.
3. **Pull what actually converts.** `fullvision:query_view` on `view:keyword-performance` to
   get payers per query. This is the column no keyword tool has.
4. **Classify each candidate into exactly one bucket:**

   | Bucket | Shape | Action |
   |---|---|---|
   | **Proven** | impressions + payers > 0 | more content on this theme; highest confidence |
   | **Leaking** | impressions high, clicks low | a title/meta job → `fv-fix-striking-distance` |
   | **Hollow** | clicks high, payers 0 over the window | wrong-intent traffic; do **not** invest more |
   | **Unproven** | impressions low, no payers | genuinely unknown; rank last, never first |

   The Hollow bucket is the one that matters and the one every keyword tool gets wrong. High
   clicks with zero payers is not an opportunity, it is a bill.
5. **Rank by revenue-weighted opportunity**, applying shrinkage per `shared/sparse-data.md` §3
   with prior weight k = 10 against the account's median query conversion rate. A query with
   one payer is not a 100%-converting query.
6. **Hand off.** Leaking queries go to `fv-fix-striking-distance`. Proven themes are a content
   brief, which is a human job — describe it, do not write the page.

## Thresholds — fixed

- Query impressions ≥ **200** over the trailing 90 days
- Window = trailing **90 days**, with the prior 90 as the trend comparison
- Shortlist capped at **15 queries**
- Confidence stated at **80%**

## Gotchas

`gsc_search_analytics` multiplexes `search_type` — web, image and video share one table. Any
query you write must filter it, or image impressions inflate every count. Ask
`fullvision:get_guidance` with domain `gsc` before writing SQL against it.

GSC data lags ~2–3 days and is sampled for low-volume queries. Never judge the last 3 days.

## Output

`shared/report-format.md`. One line per query: query, impressions, clicks, position, payers,
attributed revenue, bucket, and the recommended next step.

## Refuse when

- `fv-data-health` returns 🚩.
- No `gsc_connection` exists for the workspace — this skill has no input without Search
  Console; say so and point at connecting it.
- Fewer than 10 queries clear the impression threshold. The site is too young for a sweep;
  the honest recommendation is to publish, not to optimise.
