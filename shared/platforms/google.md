# Google Ads — platform reference

Reference material, not a skill and not an agent. Every skill that touches Google reads this.
Platform difference is an *input* to a skill, not a separate specialist.

## Attribution window

**90-day click age.** A charge counts if it lands within 90 days of the click. This is actual
realised revenue, not a prediction — which makes Google the most trustworthy of the three
platforms and the one whose numbers are directly comparable to Stripe.

Judge Google on a trailing 90-day window. A shorter window systematically understates it.

## Read + write capability — first-party, via the FullVision gateway

Reads go through `fullvision:google_ads_search` — a GAQL passthrough capped at LIMIT 1000 by
default (10000 max) and tenancy-scoped to the workspace's connected accounts — plus
`fullvision:google_list_ad_accounts`. Writes go through `fullvision:google_propose_*` (campaign
budget/status, ad text, negative keywords, tracking params) and `fullvision:google_check_ad_status`,
applied only through the `apply_proposal` human gate and reversible with `revert_mutation`. No
vendor server, no developer token, no Python toolchain.

## Connection

Google Ads connects through the FullVision app OAuth at
https://app.fullvision.io/setup/data-sync/google-ads — the same connection that syncs spend.
Nothing to install and no developer token to request.

## Querying discipline

- GAQL is not SQL. No `JOIN`, no `GROUP BY`, no subqueries. One resource per query, and
  segments fan the result out rather than aggregating it.
- `segments.date` in the `WHERE` clause is mandatory in practice — an unbounded query over a
  large account will time out.
- Metrics come back in **micros** (1,000,000 = one unit of account currency). Divide before
  reporting or every number is a million times too large.
- The API's own `conversions` field is Google's attribution, not FullVision's. They will not
  match and FullVision wins (`shared/reading-fullvision-data.md`). Use Google's numbers for
  spend and clicks; use FullVision's for revenue and payers.

## Conversion feedback loop

FullVision exports payment conversions with a flat pLTV value. Google's smart bidding
optimises toward whatever it receives, so a broken export silently undoes every
recommendation. `google-ads-review` checks this as its first act, before proposing anything.

Below roughly **20–30 closed deals/month** Google's bidding cannot learn from payment events
alone — recommend a mid-funnel goal with an assigned proxy value instead. Staging that goal is
the "Conversion goals" section below.

## Conversion goals

Google's conversion-goal model has **four objects**; the gateway proposes changes to all four,
each applied through `apply_proposal` and reversible with `revert_mutation`. All propose-only.

- **CustomerConversionGoal** — account-level defaults: per conversion category×origin, whether
  it is biddable. Auto-created by Google; the API only *updates* it. Tool:
  `fullvision:google_propose_conversion_goal_settings` (≤5 category×origin items, update-only).
- **CampaignConversionGoal** — one campaign's goals, one row per category×origin. Auto-created;
  update-only.
- **ConversionGoalCampaignConfig** — whether a campaign follows the account defaults
  (`goal_config_level` CUSTOMER) or its own goals (CAMPAIGN), and which CustomConversionGoal it
  attaches. Auto-created; update-only. Tool for these last two:
  `fullvision:google_propose_campaign_conversion_goals` (one campaign — set `goal_config_level`,
  attach/clear `custom_conversion_goal_id`, per-pair biddable flags, ≤10 pairs).
- **CustomConversionGoal** — a named goal pointing at 1–10 specific conversion actions. The
  **only** object created explicitly. Tool: `fullvision:google_propose_custom_conversion_goal`
  (create from `conversion_action_ids`; revert sets status REMOVED).

Facts:
- A conversion action inside a custom goal is optimised **even when its `primary_for_goal` is
  false** — inclusion in the goal is what counts.
- **MCC / cross-account:** the gateway resolves the conversion customer automatically. Always
  pass the client `customer_id`, never the manager's.
- **No ad-group-level goals exist** — not in the API, not in the UI. Goals live at account and
  campaign level only.

Reads — all four are GAQL-queryable via `fullvision:google_ads_search`: resources
`customer_conversion_goal`, `campaign_conversion_goal`, `conversion_goal_campaign_config`,
`custom_conversion_goal`, plus `conversion_action` to resolve action ids.

Re-routing the optimisation target (canonical chain — e.g. from a raw lead-form fill to a
server-side-imported "qualified lead"):
1. GAQL `conversion_action` → find the imported action's id.
2. `fullvision:google_propose_custom_conversion_goal` from that id → `apply_proposal`.
3. `fullvision:google_propose_campaign_conversion_goals`: `goal_config_level` CAMPAIGN, attach
   the custom goal, and set `biddable:false` on the old category×origin pairs if only the custom
   goal should drive optimisation → `apply_proposal`.

Back out: propose `goal_config_level` CUSTOMER to resync the campaign with the account goals.

**In scope now:** conversion-goal management (this section). **Still out of v1:** bidding
strategies, targeting, creative, and create/delete of campaigns — irreversible or
learning-resetting.

## Customer Match

Floor is **100 matched** members (lowered from 1,000 in 2026). At the structural B2B match
rate of ~20%, that needs a raw list of ~500. Consent requires `ad_user_data` and
`ad_personalization` both GRANTED per EEA user, with no B2B or work-email carve-out. See
`build-audience`.
