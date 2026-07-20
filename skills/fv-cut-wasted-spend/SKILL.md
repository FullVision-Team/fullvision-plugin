---
name: fv-cut-wasted-spend
description: Find search terms and placements that spend real money and produce zero paying customers, then propose negative keywords. Judges on Stripe revenue, not form fills.
cadence: weekly
requires: [fullvision, google-ads]
writes: [google-ads]
---

# fv-cut-wasted-spend

The job a marketer already runs every Monday. The difference here: **zero payers**, not zero
conversions. A term with 40 form fills and no Stripe charge is the most expensive kind of
waste, and it is invisible to the ad platform's own reporting.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding. For the platform whose
spend you are judging, also read `shared/platforms/google.md`, `shared/platforms/meta.md` or
`shared/platforms/linkedin.md` — the attribution windows are not comparable and the write
capabilities differ.

## Steps

1. **Precondition:** run `fv-data-health`. On 🚩, abort. On ⚠️, raise every minimum-n
   threshold below by 50% and say so in the report.
2. **Establish the measurable window.** `fullvision:query_view` on
   `view:ads-measurement-start`. Everything before that date is unmeasurable, not wasteful.
   All spend figures below are within the measurable window only.
3. **Pull term-level performance.** `fullvision:query_view` on `view:keyword-performance` for
   the trailing 90 days, and `view:ads-leaderboard` for account context (use the `clipped_*`
   columns). Aggregate in SQL, never client-side.
4. **Apply the thresholds** below to produce a candidate list.
5. **Corroborate.** Per `shared/sparse-data.md` §4, zero payers alone is not enough at low
   volume. Require a second signal per candidate: no assisted conversions in any attribution
   model (`view:ltv-by-campaign`), or engaged-session rate far below the account baseline
   (`view:ad-landing-pages`). Drop candidates that fail corroboration into "Not proposed".
6. **Emit the change-list, then STOP.** Do not write in this turn. Ever. Two turns, always
   (`shared/safety-rails.md` §1).
7. **On confirmation:** write the change log entry first, then add the negative keywords.

## Thresholds — fixed, never runtime-adjusted

- Term spend ≥ **€150** over the trailing 90 days (within the measurable window)
- Term clicks ≥ **60** — below this, zero payers is expected even for a good term
- Payers attributed = **0**
- Window = trailing **90 days**, matching Google's click-age window
- Confidence stated at **85%**

## Blast radius

- Max **25 negative keywords** per run (overrides the default 10-entity cap — a negative
  keyword is the most reversible action available).
- Max **15%** of trailing-30d spend affected.
- Never propose a campaign pause here. That is `fv-kill-losing-campaigns` (v2).

## Write path — Google Ads is read-only

The official Google Ads MCP server exposes GAQL reads only. **Every run of this skill is
read-only mode** per `shared/safety-rails.md` §9: emit the change-list as an artifact with
copy-pasteable negative keyword lists grouped by ad group, plus the exact Ads UI path to apply
them. Report this as the normal outcome. Do not present it as a failure, and do not suggest
installing an unvetted community write server.

## Output

`shared/report-format.md`. Each proposed negative keyword line carries: term, spend, clicks,
payers, attributed revenue, ad group, and the corroborating signal.

## Refuse when

- `fv-data-health` returns 🚩.
- The measurable window is shorter than 90 days — say how long it is and re-run later.
- Fewer than **5** terms clear the thresholds. At that point this is manual work, not a sweep,
  and the report should say so rather than propose a token list.
