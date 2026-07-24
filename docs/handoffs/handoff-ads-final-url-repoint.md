# Handoff: finish the Evaboot final-URL repoint (2 ads left)

Account 456-010-5719 → `customer_id` `4560105719`. All 7 campaigns **PAUSED** — nothing serving, nothing at risk.

Follows `handoff-google-ads-asset-write-tools.md`. The sitelink tool shipped and has been used in anger; this is the tail of that work.

## Goal

Two ads still point at a slug that 404s. Repoint them, confirm a third, verify the whole surface resolves.

## State

**Site side is done and deployed** (evaboot-website PRs #68–#73). Six LPs live:

```
/lp/export-sales-navigator-to-excel     /lp/sales-navigator-extractor
/lp/sales-navigator-email-finder        /lp/sales-navigator-scraper
/lp/sales-navigator-extension           /lp/download-sales-navigator-leads   <- new
```

The six ad-slug 301s were **deleted**. Every old root slug (`/download-leads-sales-navigator`, `/export-sales-navigator-leads-to-excel`, …) now 404s by design — there is no safety net left, the `/lp/` slugs are load-bearing.

Already applied: **20 ad final URLs** (UNDER_REVIEW — normal for URL edits) and the **6 account-level sitelinks**, now on `/lp/export-sales-navigator-to-excel` with fragments preserved, verified live. Revertable via `revert_mutation`, proposal `5ff1cf52…`.

## Left to do

1. Repoint to `https://evaboot.com/lp/download-sales-navigator-leads`:
   - `659706541844` — `Lead Generation` > `Download`
   - `696254536304` — `Cold - World - English` > `Download`

   Both sit on `https://evaboot.com/download-leads-sales-navigator` (404). Use the same propose→`apply_proposal` path as the 20 already-applied URL edits — read one of those proposals back rather than guessing the payload shape.

2. Confirm `/export-leads-sales-navigator-to-csv` was in the 20-ad sweep. It is a 7th slug on a **paused ad in the paused `Cold - World - English` > `Export` ad group**, so not urgent, but it 404s. Correct target: `/lp/export-sales-navigator-to-excel` (same intent cluster).

3. Re-verify the full surface (below).

## Gotchas

- **Use `fullvision:google_ads_search` for reads.** The *other* MCP server — Google's own `google-ads` (`search_search`, `list_accessible_customers`) — returns `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT` on every call. It authenticates via gcloud ADC, whose token lacks the `adwords` scope, and Google blocks gcloud's OAuth client for that scope. Re-running `gcloud auth` will not fix it. Don't burn turns there.
- **`!= REMOVED`, not `= ENABLED`, on campaign/ad filters** — every campaign is paused, so `campaign.status = 'ENABLED'` returns zero rows and reads as "no campaigns".
- **But `= ENABLED` *is* right for assets.** `customer_asset` / `campaign_asset` return REMOVED rows too; without the filter an already-completed sitelink swap looks like it failed (the old and new sets both appear).
- **Account-level sitelinks live on `customer_asset`** — `campaign_asset` returns nothing for them. Audit both levels.
- **`/lp/download-sales-navigator-leads` IS live.** A previous agent reported it 404 and held the repoint; that was stale Cloudflare negative cache. Verify with a cache-busting query string (`?cb=$RANDOM$RANDOM`) — a bare-URL 404 shortly after a deploy is usually the edge, not the build.
- Editing a final URL resets that ad's policy review. Harmless while paused, but the 20 edited ads must clear review before they serve again.

## Verify before calling it done

- Every ad final URL and sitelink URL returns 200 — `ad_group_ad.ad.final_urls`, plus `customer_asset` **and** `campaign_asset` where `field_type='SITELINK'`.
- For `#fragment` URLs, assert the id exists in the served HTML; a missing anchor fails silently as "scrolled nowhere". `/lp/export-sales-navigator-to-excel` carries `#testimonials`, `#demo`, `#data`, `#pricing`. `#demo` additionally auto-opens the video modal on load.
- **Known-harmless:** 8 campaign-level sitelinks 404, all on **removed** campaigns (`Best Scraping Tool`, `Leads-Search-French`, `Leads-Search-Spanish`). Ignore them. Broken sitelinks on live campaigns should be **0**.

## After unpausing

QS components were all `UNSPECIFIED` at handoff (campaigns had never served against these URLs). Re-check `google_ads_keyword_quality` in ClickHouse at 2 and 4 weeks — it carries `lp_path` plus all three component ratings. Evaboot workspace `1182f02f-636d-4f58-84d0-ddb2b2093f3b`.
