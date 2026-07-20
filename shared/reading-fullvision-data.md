# Reading FullVision data

The FullVision MCP server is the only source of revenue truth in this plugin. Ad-platform
servers report *their own* attributed conversions; those numbers do not agree with each other
and none of them see Stripe. When a number is contested, FullVision wins.

## Tool discipline

1. `list_views` first — it returns the catalog with each view's filters, granularities and
   group_by support. Do not guess a view name.
2. `query_view` for anything a view covers. Most revenue / web / attribution questions are.
3. `list_tables` → `get_table_schema` → `run_sql_query` only when no view fits. SQL is
   ClickHouse dialect and **must** contain the literal `$USER_ID` placeholder in a WHERE
   clause per table; the gateway binds the value.
4. `get_guidance` before interpreting any revenue or attribution result. Domains:
   `mrr | churn | revenue | currency | attribution | web | gsc | identity`.
5. `list_metrics` for formula definitions.

Always aggregate in SQL. Never fetch raw rows to count, sum, or average them yourself.

## Views by job

| Job | Views |
|---|---|
| Ads performance | `ads-leaderboard`, `ads-performance`, `ltv-by-campaign`, `ads-measurement-start` |
| Keywords | `keyword-performance`, `gsc-queries`, `gsc-by-page`, `gsc-striking-candidates`, `gsc-performance` |
| Landing pages | `ad-landing-pages`, `page-performance`, `page-customers`, `engagement-by-page` |
| Page friction | `scroll-depth-by-page`, `rageclicks-by-page`, `dead-clicks-by-page`, `form-performance`, `conversion-funnel` |
| Customers | `customer-ltv`, `people`, `abandoned-checkouts`, `customer-journey` |
| Data health | `health-identity-recon`, `health-checkout-coverage`, `health-event-coverage` |

## Gotchas that will burn you

**Amounts are in cents and currency-mixed.** Every sum must `GROUP BY currency` or convert
first. A bare `SUM(amount)` across currencies is meaningless.

**MRR growth is a six-component formula**, never `new − churned`. Components: new, expansion,
reactivation, contraction, voluntary churn, delinquent churn (plus an FX adjustment line).
Call `get_guidance` with domain `mrr` before touching it.

**Churn is not `subscription.status = 'canceled'`.** Ask `get_guidance` domain `churn`.

**`ads-measurement-start` is a hard gate on every ads judgement.** It returns the timestamp of
the first Stripe *webhook* charge for the workspace. Spend before that date is **unmeasurable**,
not unprofitable — FullVision simply was not watching. Never let it into a ROAS denominator.
`ads-leaderboard` already exposes the `clipped_*` (measurable window) and `full_*` (lifetime)
column split; use `clipped_*` for any decision and say which you used.

**Attribution windows differ per platform and are not comparable raw.**

| Platform | Window | What it means |
|---|---|---|
| Google | 90-day click age | Actual charges within 90 days of the click |
| Meta | 7-day upload wall | First-charge pLTV × the workspace `pltv_multiplier`, not realised LTV |
| LinkedIn | 365-day | Real 12-month LTV; the wall is upload lag only |

Never rank campaigns across platforms on raw ROAS. Compare within a platform, or state the
window you normalised to and why.

**Multi-touch models have a shorter history than first/last touch** and drop the
Non-attributed bucket by design. A multi-touch total that is lower than the last-touch total
is expected, not a bug.

**Identity coverage caps every number.** If `health-identity-recon` or
`health-checkout-coverage` is degraded, revenue is under-attributed at the source and every
downstream ROAS is biased low. Report the coverage figure alongside the recommendation, or
refuse. See `fv-data-health`.
