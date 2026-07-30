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

1. **Health context, then the ads-scoped gate.** Call `fullvision:check_data_health` and carry
   its verdict in the report header **as context, never as a stop** — all three checks are
   workspace-global and none is ads-scoped, so a global verdict cannot gate a run that never
   reads that data (`shared/safety-rails.md` §10). Gate instead on the coverage this run's own
   evidence rests on: gclid observability, `obs_gclid_clicks / g_clicks` taken from the
   `landing_pages` array of the `fullvision:ad-report` response. `obs_gclid_clicks` is **not a
   declared metric** of `view:ad-landing-pages` — read it from the payload, not the view, and
   never query the view for it.
   - Floor: **70%**. Fixed, changeable only by editing this file, never at runtime.
   - At or above the floor ⇒ run the full path.
   - Below the floor, **or the field absent from the payload** ⇒ withhold every performance
     negative-keyword proposal and say so with the figure (or with the fact that it is missing).
     Unknown coverage is not good coverage. Unobserved gclids only lose payers, never invent
     them, so thin coverage turns "zero payers" into a false negative — the wrong basis for a
     destructive write. Diagnostics and reporting run in full either way.

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

   Apply the thresholds below, over the judging window from step 3, to produce a
   negative-keyword candidate list.

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
- gclid coverage floor **70%** (`obs_gclid_clicks / g_clicks`, from the `fullvision:ad-report`
  payload) — below it, or with the field absent, performance negative keywords are withheld

## Blast radius

- Max **25 negative keywords** per run (overrides the default 10-entity cap — a negative
  keyword is the most reversible action available).
- Max **3 budget/status changes** per run.
- Max **15%** of trailing-30d spend affected.
- One run per account per day (`shared/safety-rails.md` §6).

## Read-only degradation

The run calls `fullvision:get_capabilities` first and branches on the `google_ads` connection's
`ready` flag. Never assume the Google tools exist and never discover their absence by calling
one and reading the error.

- **`ready: true`** — the full path runs, and every numbered change-list line is a staged
  proposal id.
- **`ready: false`** — this is a **read-only run**: everything reachable from FullVision's own
  views still runs, and the change-list is emitted as a copy-pasteable artifact — negative
  keywords grouped by ad group, the exact Ads UI path per change, and no applyable ids.

`fullvision:google_ads_search` sits on that same surface, so on a read-only run every
GAQL-sourced diagnostic — search terms, conversion-goal sanity, final-URL / AI-Max drift — is
**skipped, not faked**: the report names each skipped diagnostic rather than silently shortening
the list.

Per `shared/safety-rails.md` §9 this is a normal outcome, not a failure.

## Output

`shared/report-format.md`. Header carries the `check_data_health` verdict and the per-loop
feedback health (one line), plus two lines beyond that shape:

- the **ads-scoped gclid coverage** figure from step 1 (or the fact that it was absent);
- the **maturity date this run judged to**, marked `derived-p80` or `fallback`.

Both are header material because a reader must see what window produced the numbers without
reading the body — a change-list whose window is invisible cannot be audited later.

Each proposed negative keyword line carries: term, spend, clicks, payers, attributed revenue,
ad group, and the corroborating signal.

## Refuse when

- `fullvision:check_data_health` returns `red`.
- The measurable window is shorter than 90 days — say how long it is and re-run later.
- Fewer than 30 days of upload-ledger history exist — the loop has not run long enough to judge.
- Fewer than **5** terms clear the thresholds — at that point this is manual work, not a
  sweep, and the report should say so rather than propose a token list.
