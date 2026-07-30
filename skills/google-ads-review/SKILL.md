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
attribution split (FullVision's unbounded person-stitched first touch is what we judge on;
Google's 90-day click age is only a limit on what can be uploaded back), the
propose→confirm→apply protocol, the sparse-data minimum-n discipline, and Google's GAQL
querying rules. Do not restate them here; follow them.

Google-scoped only. Meta and LinkedIn are reads-only on the MCP surface for now, so their
upload loops are not checked or mutated here.

## Steps

**Phase first — computed, never chosen.** Count the search terms clearing the step-4 **volume**
thresholds over the judging window — spend ≥ **€150** *and* clicks ≥ **60**. The payer criterion
(`Payers attributed = 0`) is **excluded from this count, always**: the phase measures how much
judgeable traffic the account has, never how much of it is wasteful. A large healthy account whose
terms all produce payers has zero wasteful terms and is still **mature**. Read the branch straight
off that count. It is a volume fact, not a judgement call: no run may argue itself into the other
branch, and neither branch is a failure.

```
launch phase  ⇔  qualifying terms < 5
mature phase  ⇔  otherwise
```

Steps 1-4 are identical in both branches — the count cannot exist before step 4 produces it.
**Steps 5-7 run in full only in mature phase.** In launch phase, steps 5 and 6 are replaced by
`## Launch phase` below and step 7 emits only what that section allows — strictly less than the
mature path, never nothing. Step 8 is unchanged: confirmation still gates every apply.

1. **Health context, then the ads-scoped gate.** Call `fullvision:check_data_health` and carry
   its verdict in the report header **as context, never a stop** — all three checks are
   workspace-global and none is ads-scoped, so a global verdict cannot gate a run that never
   reads that data (`shared/safety-rails.md` §10). Gate instead on the coverage this run's own
   evidence rests on: gclid observability, `obs_gclid_clicks / g_clicks` taken from the
   `landing_pages` array of the `fullvision:ad-report` response. `obs_gclid_clicks` is **not a
   declared metric** of `view:ad-landing-pages` — read it from the payload, not the view, and
   never query the view for it.
   - **Aggregate, then divide.** `landing_pages` is one row per `lp_path`. Sum
     `obs_gclid_clicks` and sum `g_clicks` across **all** rows and divide the sums; never average
     per-row ratios. A mean of ratios lets a low-traffic page outvote the page carrying the spend.
   - The figure is Google's **trailing-90-day snapshot** with no date axis, so it does not track
     the judging window of step 3. It gates coverage, never the window.
   - Floor: **70%**. Fixed, changeable only by editing this file, never at runtime.
   - At or above the floor ⇒ run the full path.
   - Below the floor, **or the field absent from the payload** ⇒ withhold **every destructive
     proposal whose evidence is a payer count** — performance negative keywords, campaign budget
     changes and campaign-status changes, all three — and say so with the figure (or with the
     fact that it is missing). Unknown coverage is not good coverage. Unobserved gclids only lose
     payers, never invent them, so thin coverage turns "zero payers" into a false negative and a
     real ROAS into a fake one — the wrong basis for any destructive write. Withholding only the
     negatives would block the most reversible rung of `shared/safety-rails.md` §8 while letting
     budget-down and pause through, which is the reversibility order backwards. Diagnostics,
     conversion-goal recommendations and reporting run in full either way.

2. **Feedback-loop check — is closed Stripe revenue reaching Google?** Ad platforms optimise
   toward whatever signal they receive; a broken export silently undoes every recommendation
   below, weekly.
   - `fullvision:run_sql_query` against the conversion upload ledger (`$USER_ID` required in
     every WHERE, aggregate in SQL): for the last 30 days, uploads attempted / succeeded /
     failed / terminal-expired for Google. Upload success rate below **95%** ⇒ flag as broken.
   - Any sustained terminal-`expired` rows ⇒ flag; an expired event is signal Google never got.
   - **Fewer than 30 days of ledger history is not a refusal** — it is a per-diagnostic outcome.
     Report the feedback loop as **insufficient history** with the days actually available, skip
     the 95% verdict, and continue the run. A relaunched account has under 30 days of ledger by
     definition, and that is precisely the account `## Launch phase` exists to serve; refusing the
     whole run there would silence the skill exactly when the plumbing is least proven.
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

3. **Establish the judging window — measurement start to maturity line.** The left edge is
   `fullvision:query_view` on `view:ads-measurement-start`. Everything before that date is
   unmeasurable, not wasteful. All spend figures below are within the measurable window only.
   FullVision attribution is unbounded (`shared/platforms/google.md`), so there is no trailing
   lookback — the window runs from the measurement start forward.
   - **The right edge is a maturity line**, because a click needs time to become a charge before
     "0 payers" is admissible evidence. Derive it with `fullvision:run_sql_query`: across
     ad-sourced payers, measure the lag in days between the payer's **first ad-attributed click**
     and their **first Stripe charge**, and take the **p80** of that distribution. Maturity line
     = today minus that p80. Spend after the maturity line has not had time to produce a charge,
     so its zero-payer terms are held back, listed under "Too young to judge" — never proposed.
   - **Declare the query, do not re-invent it** (`shared/safety-rails.md` §3). Population:
     payers whose first touch is an ad click. Quantity: days from first ad-attributed click to
     first Stripe charge, one row per payer. Aggregate: the p80 of that quantity, computed in
     SQL — never fetch the rows and take a percentile client-side. The SQL must carry the literal
     `$USER_ID` placeholder in a `WHERE` clause. Resolve the actual table and column names at run
     time via `list_tables` → `get_table_schema` (`shared/reading-fullvision-data.md` §3); this
     file names no schema, because a stale table name here would be worse than none.
   - **Fallback:** while fewer than **8** ad-sourced payers exist to fit a percentile, use
     **60 days** and state in the report that the maturity line is a fallback and why.
   - **An empty window is a real outcome, not an error to work around.** If the maturity line
     falls on or before the measurement start — a young account whose p80 lag exceeds its own
     measured lifetime — there is no judgeable window at all. Report it with both dates, force
     **launch phase**, and propose no performance negatives. Never invert or widen the window to
     recover one.
   - **Google-side consequence, reported as a finding.** A payer whose first ad click is older
     than Google's 90-day click age is fully attributed in FullVision but can never be uploaded
     to Google. Count those payers and report the count: it means Google's bidding is
     structurally blind to the longest-cycle buyers. It is a finding, not a window to judge by.

   ```
   debt: skill-side p80 lag query, ceiling = plugin ships to a second workspace,
   upgrade trigger = promote to a gateway view so the fact lives in a tool not markdown
   ```

4. **Review wasted spend.** Negatives are built from **search terms** — what people actually
   typed — never from keywords.
   - **Search terms come from GAQL `search_term_view` via `fullvision:google_ads_search`, and
     nowhere else.** No FullVision view carries them. The `keyword-performance` view is the
     **organic-search (Google Search Console)** counterpart and must never be used for paid
     negatives — mining organic queries and proposing them as paid negatives is the mistake this
     line exists to prevent.
   - **Paid keyword grain for context:** `view:ads-leaderboard` at `?level=keyword`, using the
     `clipped_*` columns. Account context comes from the same view at its campaign grain.
   - Placements and anything else the views do not cover: `fullvision:google_ads_search` on its
     own resource.
   - GAQL rules hold throughout — one resource per query, `segments.date` in `WHERE`, metrics in
     micros. Aggregate in SQL, never client-side.
   - **The window is a request parameter, not a frame of mind.** Every view read and every GAQL
     `segments.date` predicate carries `from` = the measurement start and `to` = the maturity
     line, both from step 3. The `clipped_*` columns clip the **left** edge only — the right edge
     must be requested explicitly, or `ads-leaderboard` quietly answers for `last_30_days` and
     nothing holds back spend that is too young to judge.

   Apply the thresholds below, over the judging window from step 3, to produce a
   negative-keyword candidate list.

5. **Corroborate.** Per `shared/sparse-data.md` §4, zero payers alone is not enough at low
   volume. Require a second signal per candidate: no assisted conversions in any attribution
   model (`view:ltv-by-campaign`), or engaged-session rate far below the account baseline
   (`view:ad-landing-pages`). Candidates that fail corroboration go to "Not proposed".

6. **Budget / status outliers.** From `view:ads-leaderboard`, surface campaigns whose
   clipped-window ROAS and payer count justify a budget-down or pause proposal — never a
   pause on ROAS alone (sparse-data §4), never anything irreversible (safety-rails §8).
   This whole step is **withheld under step 1's coverage gate**: ROAS and payer counts are
   computed from the same gclids the gate measures, so below the floor they are biased low and
   no budget or status change may be staged on them.

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

## Launch phase

Fewer than **5** qualifying terms means the mature path's statistics cannot carry a destructive
write — which is a reason to do less, not a reason to go silent. A relaunched or young account is
exactly when the plumbing breaks and nobody is watching, so this branch keeps every diagnostic and
drops every judgement that needs volume.

The five items below are **L1-L5** — a separate list from the numbered steps, so a reference to
"step N" always means the main sequence and never one of these.

**L1. Health.** Carry the ads-scoped coverage figure from step 1 in the header as context. It never
aborts a launch-phase run — nothing proposed here rests on a payer count.

**L2. Plumbing diagnostics, all read-only.** These are the failures that cost the most, show up
earliest, and are invisible to the platform's own reporting:
- **gclid landing** — `obs_gclid_clicks` vs `g_clicks` from the `fullvision:ad-report` payload.
  A gap means clicks arrive without their id, and no later analysis recovers them.
- **Upload ledger** — Stripe upload success rate and terminal-`expired` rows, per step 2.
- **Conversion-goal sanity** — the four goal resources per `shared/platforms/google.md`, via GAQL.
- **Quality Score and `worst_landing_page_experience`** per landing page, read from the
  `landing_pages` array of the `fullvision:ad-report` response — the same payload L1's coverage
  figure comes from, alongside `min_quality_score` / `avg_quality_score`. These are **FullVision
  columns, not GAQL fields**: Google's GAQL has no `worst_landing_page_experience`, so never write
  a query for one.
- **Final-URL / AI Max drift** — where the ads actually send traffic versus where they should,
  via GAQL.

**L3. Irrelevance negatives only**, from GAQL `search_term_view`. Judged on **meaning rather than
volume**: a term for an unrelated product is wrong on click 1, not on click 60. Declare this in
the report as a **non-statistical** criterion — it is independent of n, and must never be shown
as, or confused with, the €150 / 60-click performance thresholds. **Performance negatives do not
fire in launch phase**, and the report says so in those words rather than leaving their absence to
be inferred. List every term verbatim with its spend and clicks so a human can overrule any single
line without re-running the analysis. Cap: **25** per run.

**L4. Journey diagnosis.** Run a `fullvision:journeys` cohort on `first_touch_channel:
"Paid Search"` over the judging window, answering the question a payer count cannot answer at this
volume: where do ad clickers stop? Minimum **20** ad-sourced people — below that, report the count
and stop. Output is a **drop-off shape, never a per-person story — journey rows are PII**
(`shared/safety-rails.md`).

**L5. Budget, bidding and campaign status are hard-zero.** Not reduced, not caveated, not
"proposed for review": zero budget changes, zero bidding changes (out of v1 everywhere, and doubly
so here), zero pauses, zero enables. Below 5 qualifying terms there is no evidence that could
justify moving spend, and pausing a launching campaign destroys the learning period that would
have produced the evidence.

Step 7's rule is otherwise unchanged — one consolidated change-list, propose only, then STOP.

## Thresholds — fixed, never runtime-adjusted

Negative-keyword candidates:
- Term spend ≥ **€150** over the judging window
- Term clicks ≥ **60** — below this, zero payers is expected even for a good term
- Payers attributed = **0**
- Window = `view:ads-measurement-start` → the maturity line (p80 click-to-charge lag, or the
  **60-day** fallback below **8** ad-sourced payers). Never a trailing window borrowed from
  Google's upload rules.
- Confidence stated at **85%**

Feedback loop:
- Upload success rate < **95%** over 30 days ⇒ broken
- Any terminal-`expired` rows ⇒ flag
- Closed deals/month < **20** ⇒ recommend a mid-funnel goal

Ads-scoped coverage:
- gclid coverage floor **70%** (summed `obs_gclid_clicks` / summed `g_clicks` across the
  `fullvision:ad-report` `landing_pages` rows, never a mean of per-row ratios) — below it, or with
  the field absent, **every destructive proposal whose evidence is a payer count is withheld**:
  performance negative keywords, campaign budget changes and campaign-status changes alike

Launch phase:
- Qualifying term = spend ≥ **€150** *and* clicks ≥ **60** over the judging window. The payer
  criterion is **excluded** from this count — the phase measures judgeable volume, never waste
- Phase boundary: fewer than **5** qualifying terms ⇒ launch phase, otherwise mature phase
- Max **25** irrelevance negatives per run
- Journey diagnosis minimum **20** ad-sourced people — below it, report the count and stop

## Blast radius

- Max **25 negative keywords** per run (overrides the default 10-entity cap — a negative
  keyword is the most reversible action available).
- Max **3 budget/status changes** per run.
- Max **15%** of trailing-30d spend affected.
- **Launch phase:** max **25** irrelevance negatives, **zero** budget, bidding and
  campaign-status changes.
- One run per account per day (`shared/safety-rails.md` §6), both phases.

## Read-only degradation

The run calls `fullvision:get_capabilities` first and branches on the `google_ads` connection's
`ready` flag. Never assume the Google tools exist and never discover their absence by calling
one and reading the error.

- **`ready: true`** — the full path runs, and every numbered change-list line is a staged
  proposal id.
- **`ready: false`** — this is a **read-only run**: everything reachable from FullVision's own
  views still runs, and its output is emitted as a copy-pasteable **change-list** artifact with
  the exact Ads UI path per line and no applyable ids. What that artifact can actually carry is
  the conversion-goal recommendations of step 2 and the FullVision-sourced diagnostics — gclid
  coverage, upload-ledger health, Quality Score and `worst_landing_page_experience` per landing
  page (all four from the `fullvision:ad-report` payload and the upload ledger), and the journey
  drop-off shape. **No negative keywords are produced at all**, because
  their only source — GAQL `search_term_view` — is unavailable on this surface. Say that
  outright; do not present a change-list that promises negatives it cannot compute.

`fullvision:google_ads_search` sits on that same surface, so on a read-only run every
GAQL-sourced diagnostic — search terms, conversion-goal sanity, final-URL / AI-Max drift — is
**skipped, not faked**: the report names each skipped diagnostic rather than silently shortening
the list.

Search terms are one of those skips, so a read-only run cannot count qualifying terms and
therefore cannot derive a phase. When the count cannot be derived, **fail safe to launch phase** —
never "undetermined" with full mature output. A copy-pasteable artifact is a **deferred write**:
a human executes it by hand instead of `fullvision:apply_proposal` executing it by id, which is a
slower fuse, not a shorter one. It therefore inherits every gate the staged path has, the
launch-phase hard-zero on budget, bidding and campaign status included. Report that the phase was
forced and why.

Per `shared/safety-rails.md` §9 this is a normal outcome, not a failure.

## Output

`shared/report-format.md`. Header carries the `check_data_health` verdict and the per-loop
feedback health (one line), plus three lines beyond that shape:

- the **ads-scoped gclid coverage** figure from step 1 (or the fact that it was absent);
- the **maturity date this run judged to**, marked `derived-p80` or `fallback`;
- the **phase**, `launch` or `mature`, with the qualifying-term count it was derived from — or
  marked `forced` when no count could be derived and the run failed safe to launch.

All three are header material because a reader must see what window and which branch produced the
numbers without reading the body — a change-list whose window and phase are invisible cannot be
audited later.

Each proposed negative keyword line carries: term, spend, clicks, payers, attributed revenue,
ad group, and the corroborating signal.

## Refuse when

- The ads-scoped coverage figure of step 1 **cannot be computed at all** — the
  `fullvision:ad-report` call fails, or returns no `landing_pages` to read it from — **and** a
  destructive proposal would otherwise be staged. Report the gap and stop; proposing a negative
  keyword against evidence whose coverage is unknowable is proposing blind. Diagnostics and
  reporting still run.

A thin account is not a refusal — it is `## Launch phase`.
