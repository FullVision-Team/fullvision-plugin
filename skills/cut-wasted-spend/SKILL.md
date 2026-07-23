---
name: cut-wasted-spend
description: Find search terms and placements that spend real money and produce zero paying customers, then propose negative keywords. Judges on Stripe revenue, not form fills.
cadence: weekly
requires: [fullvision]
writes: [fullvision]
---

# cut-wasted-spend

The job a marketer already runs every Monday. The difference here: **zero payers**, not zero
conversions. A term with 40 form fills and no Stripe charge is the most expensive kind of
waste, and it is invisible to the ad platform's own reporting.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding. For the platform whose
spend you are judging, also read `shared/platforms/google.md`, `shared/platforms/meta.md` or
`shared/platforms/linkedin.md` — the attribution windows are not comparable and the write
capabilities differ.

## Steps

1. **Precondition:** run `data-health`. On 🚩, abort. On ⚠️, raise every minimum-n
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
6. **Propose the negatives, then STOP.** Stage them with
   `fullvision:google_propose_negative_keywords` (or, in read-only mode, emit the change-list).
   Do not apply in this turn. Ever. Two turns, always (`shared/safety-rails.md` §1).
7. **On confirmation:** apply the staged proposal by id through the `apply_proposal` human gate;
   the gateway records the change and stores an undo (`revert_mutation` reverses it).

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
- Never propose a campaign pause here. That is `kill-losing-campaigns` (v2).

## Write path — first-party, via the FullVision gateway

Negative keywords are proposed with `fullvision:google_propose_negative_keywords` and applied
only through the `apply_proposal` human gate — it reads live account state, stages a computed
undo, and mutates only by proposal id after an explicit yes (`revert_mutation` reverses it).
Reads stay on FullVision views. Never apply in the turn you analyse (`shared/safety-rails.md` §1).

**Read-only degradation.** If the workspace's Google Ads connection is spend-sync only (no
mutate scope), the propose tools are unavailable and the skill runs in read-only mode per
`shared/safety-rails.md` §9: emit the change-list as an artifact with copy-pasteable negative
keyword lists grouped by ad group, plus the exact Ads UI path to apply them. Report this as a
normal outcome, not a failure.

## Output

`shared/report-format.md`. Each proposed negative keyword line carries: term, spend, clicks,
payers, attributed revenue, ad group, and the corroborating signal.

## Refuse when

- `data-health` returns 🚩.
- The measurable window is shorter than 90 days — say how long it is and re-run later.
- Fewer than **5** terms clear the thresholds. At that point this is manual work, not a sweep,
  and the report should say so rather than propose a token list.
