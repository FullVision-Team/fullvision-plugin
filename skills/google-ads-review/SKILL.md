---
name: google-ads-review
description: The weekly Google Ads session in one command — verify Stripe revenue is reaching Google as conversion signal, then find the search terms and placements that spend real money and produce zero payers, and stage the negative keywords and budget fixes. Judges on Stripe revenue, not platform conversions.
cadence: weekly
requires: [fullvision]
writes: [fullvision]
---

# google-ads-review

The job a marketer already runs every Monday, done in one pass. Two things go wrong in a
Google Ads account and both are invisible to the platform's own reporting: **the revenue
signal stops reaching Google**, so smart bidding optimises toward the wrong thing, and **terms
keep spending on zero paying customers**. This skill checks the first, then acts on the second.

The difference throughout: **zero payers**, not zero conversions. A term with 40 form fills and
no Stripe charge is the most expensive kind of waste. And a feedback loop that shows healthy
platform conversions while Stripe revenue never lands is the most expensive kind of drift.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md`, `shared/sparse-data.md`
and `shared/platforms/google.md` before calling anything. All are binding — they hold the
attribution window (90-day click age), the propose→confirm→apply protocol, the sparse-data
minimum-n discipline, and Google's GAQL querying rules. Do not restate them here; follow them.

Google-scoped only. Meta and LinkedIn are reads-only on the MCP surface for now, so their
upload loops are not checked or mutated here.

## Steps

1. **Precondition.** Call `fullvision:check_data_health`. On `red`, abort — return the failing
   checks and "fix tracking first"; upload figures and payer counts are unreadable when
   identity coverage is broken. On `amber`, continue but state the biased checks in the report
   and raise every minimum-n threshold below by 50%.

2. **Feedback-loop check — is closed Stripe revenue reaching Google?** Ad platforms optimise
   toward whatever signal they receive; a broken export silently undoes every recommendation
   below, weekly.
   - `fullvision:run_sql_query` against the conversion upload ledger (`$USER_ID` required in
     every WHERE, aggregate in SQL): for the last 30 days, uploads attempted / succeeded /
     failed / terminal-expired for Google. Upload success rate below **95%** ⇒ flag as broken.
   - Any sustained terminal-`expired` rows ⇒ flag; an expired event is signal Google never got.
   - **Is payment-only optimisation viable at all?** Count closed deals/month from
     `view:customer-ltv`. Below **20 closed deals/month**, Google cannot learn from payment
     events alone. Recommend a mid-funnel conversion goal with an assigned proxy value —
     derive it from the workspace's own MQL→close rate × average deal value (practitioner
     defaults MQL ≈ €500, SQL ≈ €2,500, not to be used literally). This recommendation can now
     be **staged into the same change-list**, not just described: propose the custom goal over
     the mid-funnel conversion action with `fullvision:google_propose_custom_conversion_goal`,
     then attach it to the affected campaign(s) with
     `fullvision:google_propose_campaign_conversion_goals` — the re-routing chain in
     `shared/platforms/google.md` (Conversion goals). Still one apply gate, two turns.
   - **Conversion-goal sanity.** GAQL the four goal resources per
     `shared/platforms/google.md` and flag misconfigurations: a campaign optimising for a
     category with **zero Stripe-linked conversions**, or account defaults biddable on a
     category no campaign actually pays on. Correct at the right level —
     `fullvision:google_propose_campaign_conversion_goals` for one campaign,
     `fullvision:google_propose_conversion_goal_settings` for the account defaults — staged in
     the same change-list.

3. **Establish the measurable window.** `fullvision:query_view` on `view:ads-measurement-start`.
   Everything before that date is unmeasurable, not wasteful. All spend figures below are
   within the measurable window only.

4. **Review wasted spend.** `fullvision:query_view` on `view:keyword-performance` for the
   trailing 90 days, and `view:ads-leaderboard` for account context (use the `clipped_*`
   columns). Aggregate in SQL, never client-side. Apply the thresholds below to produce a
   negative-keyword candidate list. For placements or anything the views do not cover, use
   `fullvision:google_ads_search` (GAQL — one resource per query, `segments.date` in WHERE,
   metrics in micros).

5. **Corroborate.** Per `shared/sparse-data.md` §4, zero payers alone is not enough at low
   volume. Require a second signal per candidate: no assisted conversions in any attribution
   model (`view:ltv-by-campaign`), or engaged-session rate far below the account baseline
   (`view:ad-landing-pages`). Candidates that fail corroboration go to "Not proposed".

6. **Budget / status outliers.** From `view:ads-leaderboard`, surface campaigns whose
   clipped-window ROAS and payer count justify a budget-down or pause proposal — never a
   pause on ROAS alone (sparse-data §4), never anything irreversible (safety-rails §8).

7. **Emit ONE consolidated change-list, then STOP.** Stage each change through the matching
   propose tool — `fullvision:google_propose_negative_keywords`,
   `fullvision:google_propose_campaign_budget`, `fullvision:google_propose_campaign_status`,
   the conversion-goal tools from step 2 (`fullvision:google_propose_custom_conversion_goal`,
   `fullvision:google_propose_campaign_conversion_goals`,
   `fullvision:google_propose_conversion_goal_settings`), and — only when the landing-page set
   actually changed — the ad-surface asset tools (`fullvision:google_propose_sitelinks`,
   `fullvision:google_propose_callouts`, `fullvision:google_propose_structured_snippets`;
   declarative FULL-set replace, so read the current set via GAQL first and restate everything
   that should stay) — each returning a proposal id. Do not
   apply in this turn. Ever. Two turns, always (`shared/safety-rails.md` §1). The upload-failure
   and terminal-expired findings from step 2 remain diagnosis, not a platform write — report
   them as recommendations the user applies in the Google UI / export settings; only the
   conversion-goal changes are staged.

8. **On explicit confirmation:** apply each confirmed id via `fullvision:apply_proposal` — it
   reads live account state, stores a computed undo, and mutates only by id. Remind the user
   that `fullvision:revert_mutation` reverses a single change and `fullvision:revert_run`
   reverses the whole batch.

## Thresholds — fixed, never runtime-adjusted

Negative-keyword candidates:
- Term spend ≥ **€150** over the trailing 90 days (within the measurable window)
- Term clicks ≥ **60** — below this, zero payers is expected even for a good term
- Payers attributed = **0**
- Window = trailing **90 days**, matching Google's click-age window
- Confidence stated at **85%**

Feedback loop:
- Upload success rate < **95%** over 30 days ⇒ broken
- Any terminal-`expired` rows ⇒ flag
- Closed deals/month < **20** ⇒ recommend a mid-funnel goal

## Blast radius

- Max **25 negative keywords** per run (overrides the default 10-entity cap — a negative
  keyword is the most reversible action available).
- Max **3 budget/status changes** per run.
- Max **15%** of trailing-30d spend affected.
- One run per account per day (`shared/safety-rails.md` §6).

## Read-only degradation

If the workspace's Google Ads connection is spend-sync only (no mutate scope), the propose
tools are unavailable and the skill runs read-only per `shared/safety-rails.md` §9: run the
**entire** analysis and emit the change-list as an artifact — copy-pasteable negative keywords
grouped by ad group, plus the exact Ads UI path per change. This is a normal outcome, not a
failure.

## Output

`shared/report-format.md`. Header carries the `check_data_health` verdict and the per-loop
feedback health (one line). Each proposed negative keyword line carries: term, spend, clicks,
payers, attributed revenue, ad group, and the corroborating signal.

## Refuse when

- `fullvision:check_data_health` returns `red`.
- The measurable window is shorter than 90 days — say how long it is and re-run later.
- Fewer than 30 days of upload-ledger history exist — the loop has not run long enough to judge.
- Fewer than **5** terms clear the thresholds — at that point this is manual work, not a
  sweep, and the report should say so rather than propose a token list.
