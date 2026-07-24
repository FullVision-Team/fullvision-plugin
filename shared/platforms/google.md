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
budget/status, ad text, negative keywords, tracking params, conversion goals, sitelinks,
callouts, structured snippets) and `fullvision:google_check_ad_status`, applied only through
the `apply_proposal` human gate and reversible with `revert_mutation`. No vendor server, no
developer token, no Python toolchain.

Ad-text edits cover everything that renders in the ad: headlines and descriptions accept plain
strings (rotate freely) or `{ text, pin }` to pin a slot (`HEADLINE_1..3` / `DESCRIPTION_1..2`
— pinning is opt-in and reduces Google's combinatorial testing, so pin only with a reason), and
`path1`/`path2` set the display path shown after the domain (≤15 chars each, `path2` requires
`path1`). Revert restores prior copy including pins and paths.

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

**In scope now:** conversion-goal management (this section) and ad-surface assets (next
section). **Still out of v1:** bidding strategies, targeting, and create/delete of campaigns —
irreversible or learning-resetting.

## Ad-surface assets (sitelinks, callouts, structured snippets)

Sitelinks, callouts and structured snippets are **Assets** in Google's model — standalone
objects linked to a level via `customer_asset` (account) or `campaign_asset` (campaign).
Assets are immutable: an "edit" is create-new-asset + swap-link, which is exactly what the
gateway does — in ONE atomic mutate, so the ad never serves a half-swapped set.

Three tools, all **declarative replace**: the call states the desired FULL set at one level,
and the gateway swaps out whatever is linked there now. Nothing applies until
`apply_proposal`; revert restores the prior link set (the replaced assets are relinked — new
assets stay in the account unlinked, which stops them serving; Google has no asset delete).

- `fullvision:google_propose_sitelinks` — ≤10 items of `{ link_text ≤25, final_url,
  description1/2 ≤35 }`.
- `fullvision:google_propose_callouts` — ≤10 plain strings, each ≤25 chars.
- `fullvision:google_propose_structured_snippets` — ≤5 sets of `{ header, values }`; headers
  come from Google's fixed 13-item list (Amenities … Types), 3–10 values each, ≤25 chars.

All three take `level: account|campaign` (`campaign` requires `campaign_id`; campaign-level
links override account-level in serving). One full-set proposal per (tool, target) may be
pending at a time — a second is rejected at propose until the first applies or expires.

**Read the current set first** — declarative replace means anything you omit is removed. GAQL
via `fullvision:google_ads_search`: `customer_asset` for account level (campaign_asset returns
nothing for account links), `campaign_asset` for campaign level, joined to `asset` for the
display fields.

## Customer Match

Floor is **100 matched** members (lowered from 1,000 in 2026). At the structural B2B match
rate of ~20%, that needs a raw list of ~500. Consent requires `ad_user_data` and
`ad_personalization` both GRANTED per EEA user, with no B2B or work-email carve-out. See
`build-audience`.
