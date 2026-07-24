# Google Ads Ad-Surface Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use test-driven-development in every task (failing test first). Invoke codex-review mode=code at the checkpoints named in Tasks 7 and 8.

**Goal:** Make everything that renders in a Google ad editable via propose→apply→revert: display paths + pinning on `ad_text`, plus three new asset-backed kinds — `sitelinks`, `callouts`, `structured_snippets` (account + campaign level, declarative replace).

**Architecture:** Extend the existing mutate pipeline in `full_db` (`validate → prior-state read → build ops → dry-run → insert proposal; apply → atomic mutate → inverse`). The three asset kinds share one new module `lib/google-ads/mutate/assets.ts` and are CREATE-kind tools (inverse finalized at APPLY from mutate results + the propose-time link snapshot). The whole swap (create assets via temp ids + create links + remove prior links) is ONE atomic mutate request (`partial_failure: false` — already enforced by `runMutate`). Then relay the tools in `full_distrib`, then document in `fullvision-plugin`.

**Tech Stack:** TypeScript, Hono route (full_db ingest), `google-ads-api` v23 (Opteo — `asset`, `customer_asset`, `campaign_asset` all confirmed mutable resources), Postgres (proposal store), zod (full_distrib MCP schemas), vitest.

**Spec:** `fullvision-plugin/docs/specs/2026-07-23-google-ads-ad-surface-writes-design.md`

**Repo orchestration (3 repos, sequential):** This is the same train as full_db#378 → full_distrib#316 → plugin#11.
- Tasks 1–7: **full_db**. Create workspace: `~/.superset/bin/superset ws create --local --project 3db8c8b7-9b46-47e6-8f4a-89a438765769 --name ad-surface-writes --branch ad-surface-writes --base-branch main`, cd into the worktree (path is `~/.superset/worktrees/3db8c8b7-9b46-47e6-8f4a-89a438765769/jbjzq/ad-surface-writes/` — PROJECT id, not workspace id).
- Tasks 8: **full_distrib**. Resolve its project id via `~/.superset/bin/superset projects list --json` (match `.path` ending in `full_distrib`), create workspace `ad-surface-writes` the same way.
- Task 9: **fullvision-plugin** (this repo). Same: resolve project id, workspace `ad-surface-writes`.
- Deploys are manual and happen only after the user's merge go-ahead: `full_db/scripts/deploy-after-merge.sh` (run from each repo root; works for full_distrib too). Stash the main checkout's WIP YOURSELF before running it. Migration 292 via `psql "$DATABASE_URL"` (from full_db/.env) — never `supabase db push`. The plugin contract test stays red until the gateway deploy lands — that is the merge gate for plugin, not a bug.
- full_db gitignores `docs/` specs/plans — do not try to commit any doc there.

**Dependency Graph:**
- Wave 1: Task 1 (types), Task 6 (migration file) (parallel)
- Wave 2: Task 2 (assets module), Task 3 (ad_text paths+pins), Task 4 (caps) (parallel after Task 1)
- Wave 3: Task 5 (route wiring)
- Wave 4: Task 7 (full_db verify + review + PR)
- Wave 5: Task 8 (full_distrib relay)
- Wave 6: Task 9 (plugin docs)

**Established constants (verify against the lib's protos in Task 2/3 — the lib is authoritative, these come from Google's docs):**
- Pins: headlines `HEADLINE_1|HEADLINE_2|HEADLINE_3`, descriptions `DESCRIPTION_1|DESCRIPTION_2` (proto enum `ServedAssetFieldType`).
- Char limits: sitelink `link_text` ≤25, `description1/2` ≤35; callout text ≤25; snippet values ≤25, 3–10 values; `path1`/`path2` ≤15.
- Snippet headers (fixed list): Amenities, Brands, Courses, Degree programs, Destinations, Featured hotels, Insurance coverage, Models, Neighborhoods, Service catalog, Shows, Styles, Types.

---

### Task 1: Types + resource-name helpers

**Blocked by:** none

**Files:**
- Modify: `lib/google-ads/mutate/types.ts` (in full_db)

- [ ] **Step 1: Extend the tool vocabulary**

`lib/google-ads/mutate/types.ts:9-36` — add `"sitelinks" | "callouts" | "structured_snippets"` to `MutateTool`, to `MUTATE_TOOLS`, **and to `CREATE_TOOLS`** (their inverse is finalized at apply — Google mints the created asset/link resource names; the doc comment on `CREATE_TOOLS` should gain one line: "asset kinds are hybrid: prior links snapshotted at propose, inverse assembled at apply").

- [ ] **Step 2: Add input types and constants**

Below `TrackingParamsInput` (`types.ts:88-97`), add:

```ts
export type AssetLevel = "account" | "campaign";

export interface SitelinkItem {
  link_text: string;
  final_url: string;
  description1?: string;
  description2?: string;
}

export interface SnippetItem {
  header: string; // one of SNIPPET_HEADERS
  values: string[]; // 3–10, each ≤25 chars
}

/** Declarative replace: each input states the DESIRED FULL SET of that asset
 *  kind at the given level. Apply swaps the whole set in one atomic mutate. */
export interface AssetLinkInput {
  level: AssetLevel;
  campaign_id?: string; // required when level === "campaign"
}

export interface SitelinksInput extends AssetLinkInput { sitelinks: SitelinkItem[] }
export interface CalloutsInput extends AssetLinkInput { callouts: string[] }
export interface StructuredSnippetsInput extends AssetLinkInput { snippets: SnippetItem[] }

export const HEADLINE_PINS = ["HEADLINE_1", "HEADLINE_2", "HEADLINE_3"] as const;
export const DESCRIPTION_PINS = ["DESCRIPTION_1", "DESCRIPTION_2"] as const;

export const SNIPPET_HEADERS = [
  "Amenities", "Brands", "Courses", "Degree programs", "Destinations",
  "Featured hotels", "Insurance coverage", "Models", "Neighborhoods",
  "Service catalog", "Shows", "Styles", "Types",
] as const;
```

- [ ] **Step 3: Extend AdTextInput**

`types.ts:80-86` — change `AdTextInput` to:

```ts
/** Headline/description entries: plain string (unpinned, back-compat) or
 *  { text, pin } to pin to a slot. path1/path2 are the display path. */
export type AdTextEntry = string | { text: string; pin?: string };

export interface AdTextInput {
  ad_group_id: string;
  ad_id: string;
  headlines?: AdTextEntry[];
  descriptions?: AdTextEntry[];
  final_urls?: string[];
  path1?: string;
  path2?: string;
}
```

- [ ] **Step 4: Add rn helpers**

In the `rn` object (`types.ts:136-160`), add (link ids are composite, `~`-joined, mirroring `adGroupAd`):

```ts
asset: (cid: string, id: string) => `customers/${cid}/assets/${id}`,
customerAsset: (cid: string, assetId: string, fieldType: string) =>
  `customers/${cid}/customerAssets/${assetId}~${fieldType}`,
campaignAsset: (cid: string, campaignId: string, assetId: string, fieldType: string) =>
  `customers/${cid}/campaignAssets/${campaignId}~${assetId}~${fieldType}`,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` (from full_db root). Expected: PASS (type-only change; builders not yet updated — if `buildAdTextOps` fails on `AdTextEntry`, that fix belongs to Task 3; for this commit it must still compile, so only widen types in ways `.map((text) => ({ text }))` still accepts — if it doesn't, do the minimal Task-3-compatible normalization stub here and note it).

- [ ] **Step 6: Commit**

```bash
git add lib/google-ads/mutate/types.ts
git commit -m "feat(google-ads): types for asset kinds, ad_text pins and paths"
```

---

### Task 2: Shared asset module (`assets.ts`)

**Blocked by:** Task 1

**Files:**
- Create: `lib/google-ads/mutate/assets.ts` (in full_db)
- Reuse: `lib/google-ads/mutate/types.ts` (Task 1 types), `lib/google-ads/mutate/execute.ts` (house style for readers; `readAssetLinks` lands here)
- Test: `tests/unit/google-ads-mutate-assets.test.ts`

Use test-driven-development: write the test file first with the cases below, watch it fail, then implement.

- [ ] **Step 1: Write the test file**

`tests/unit/google-ads-mutate-assets.test.ts` — follow the style of `tests/unit/google-ads-mutate-builders.test.ts` (pure functions, no network). Cases:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAssetPayload, buildAssetSwapOps, buildAssetInverse, assetTargetKey, FIELD_TYPE,
} from "@/lib/google-ads/mutate/assets";

describe("buildAssetPayload", () => {
  it("builds a sitelink asset payload", () => {
    expect(buildAssetPayload("sitelinks", {
      link_text: "Pricing", final_url: "https://evaboot.com/pricing", description1: "Plans",
    })).toEqual({
      sitelink_asset: { link_text: "Pricing", description1: "Plans" },
      final_urls: ["https://evaboot.com/pricing"],
    });
  });
  it("builds a callout asset payload", () => {
    expect(buildAssetPayload("callouts", "No credit card")).toEqual({
      callout_asset: { callout_text: "No credit card" },
    });
  });
  it("builds a structured snippet asset payload", () => {
    expect(buildAssetPayload("structured_snippets", {
      header: "Service catalog", values: ["Export", "Enrich", "Verify"],
    })).toEqual({
      structured_snippet_asset: { header: "Service catalog", values: ["Export", "Enrich", "Verify"] },
    });
  });
});

describe("buildAssetSwapOps", () => {
  it("creates temp-id assets, links them, removes prior links — in that order, one batch", () => {
    const ops = buildAssetSwapOps("111", "sitelinks", "account", undefined,
      [{ link_text: "A", final_url: "https://x.com/a" }, { link_text: "B", final_url: "https://x.com/b" }],
      ["customers/111/customerAssets/900~SITELINK"]);
    // 2 asset creates + 2 link creates + 1 link remove
    expect(ops).toHaveLength(5);
    expect(ops[0]).toEqual({
      entity: "asset", operation: "create",
      resource: expect.objectContaining({ resource_name: "customers/111/assets/-1" }),
    });
    expect(ops[2]).toEqual({
      entity: "customer_asset", operation: "create",
      resource: { asset: "customers/111/assets/-1", field_type: "SITELINK" },
    });
    expect(ops[4]).toEqual({
      entity: "customer_asset", operation: "remove",
      resource: { resource_name: "customers/111/customerAssets/900~SITELINK" },
    });
  });
  it("links at campaign level with the campaign resource name", () => {
    const ops = buildAssetSwapOps("111", "callouts", "campaign", "222", ["Fast"], []);
    expect(ops[1]).toEqual({
      entity: "campaign_asset", operation: "create",
      resource: {
        campaign: "customers/111/campaigns/222",
        asset: "customers/111/assets/-1", field_type: "CALLOUT",
      },
    });
  });
});

describe("buildAssetInverse", () => {
  it("recreates prior links, removes created links and assets, skips removed-link result echoes", () => {
    const priorState = {
      "customers/111/customerAssets/900~SITELINK": {
        asset: "customers/111/assets/900", field_type: "SITELINK",
        sitelink: { link_text: "Old", final_urls: ["https://x.com/old"] },
      },
    };
    // mutate results echo EVERY op's resource name, including the remove:
    const resultNames = [
      "customers/111/assets/555",
      "customers/111/customerAssets/555~SITELINK",
      "customers/111/customerAssets/900~SITELINK",
    ];
    const inv = buildAssetInverse("111", resultNames, priorState);
    expect(inv).toEqual([
      { entity: "customer_asset", operation: "create",
        resource: { asset: "customers/111/assets/900", field_type: "SITELINK" } },
      { entity: "customer_asset", operation: "remove",
        resource: { resource_name: "customers/111/customerAssets/555~SITELINK" } },
      { entity: "asset", operation: "remove",
        resource: { resource_name: "customers/111/assets/555" } },
    ]);
  });
  it("recreates campaign-level prior links with the campaign field", () => {
    const priorState = {
      "customers/111/campaignAssets/222~900~CALLOUT": {
        campaign: "customers/111/campaigns/222",
        asset: "customers/111/assets/900", field_type: "CALLOUT",
      },
    };
    const inv = buildAssetInverse("111", [], priorState);
    expect(inv[0]).toEqual({
      entity: "campaign_asset", operation: "create",
      resource: {
        campaign: "customers/111/campaigns/222",
        asset: "customers/111/assets/900", field_type: "CALLOUT",
      },
    });
  });
});

describe("assetTargetKey", () => {
  it("keys account and campaign targets distinctly", () => {
    expect(assetTargetKey("account", undefined)).toBe("account");
    expect(assetTargetKey("campaign", "222")).toBe("campaign:222");
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

Run: `npx vitest run tests/unit/google-ads-mutate-assets.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement `lib/google-ads/mutate/assets.ts`**

```ts
// lib/google-ads/mutate/assets.ts
// Shared machinery for the asset-backed kinds (sitelinks / callouts /
// structured_snippets). Google's model: an Asset is a standalone object,
// linked to a level via customer_asset / campaign_asset. Assets are
// immutable-ish, so an "edit" is create-new-asset + swap-link. The whole
// swap runs as ONE atomic mutate (partial_failure=false in runMutate):
// temp negative ids let link creates reference asset creates in-batch.
import type { AssetLevel, MutateOp, PriorState } from "./types";
import { rn } from "./types";

export type AssetKind = "sitelinks" | "callouts" | "structured_snippets";

export const FIELD_TYPE: Record<AssetKind, string> = {
  sitelinks: "SITELINK",
  callouts: "CALLOUT",
  structured_snippets: "STRUCTURED_SNIPPET",
};

type SitelinkItem = { link_text: string; final_url: string; description1?: string; description2?: string };
type SnippetItem = { header: string; values: string[] };
export type AssetItem = SitelinkItem | string | SnippetItem;

export function buildAssetPayload(kind: AssetKind, item: AssetItem): Record<string, unknown> {
  if (kind === "sitelinks") {
    const s = item as SitelinkItem;
    const sitelink_asset: Record<string, unknown> = { link_text: s.link_text };
    if (s.description1) sitelink_asset.description1 = s.description1;
    if (s.description2) sitelink_asset.description2 = s.description2;
    return { sitelink_asset, final_urls: [s.final_url] };
  }
  if (kind === "callouts") {
    return { callout_asset: { callout_text: item as string } };
  }
  const sn = item as SnippetItem;
  return { structured_snippet_asset: { header: sn.header, values: sn.values } };
}

/** The one-batch swap: N asset creates (temp ids -1..-N), N link creates
 *  referencing the temp ids, then removes of every prior link at the level. */
export function buildAssetSwapOps(
  customerId: string, kind: AssetKind, level: AssetLevel, campaignId: string | undefined,
  items: AssetItem[], priorLinkNames: string[],
): MutateOp[] {
  const fieldType = FIELD_TYPE[kind];
  const assetCreates: MutateOp[] = items.map((item, idx) => ({
    entity: "asset",
    operation: "create" as const,
    resource: { resource_name: rn.asset(customerId, String(-(idx + 1))), ...buildAssetPayload(kind, item) },
  }));
  const linkCreates: MutateOp[] = items.map((_, idx) => {
    const asset = rn.asset(customerId, String(-(idx + 1)));
    return level === "campaign"
      ? { entity: "campaign_asset", operation: "create" as const,
          resource: { campaign: rn.campaign(customerId, campaignId!), asset, field_type: fieldType } }
      : { entity: "customer_asset", operation: "create" as const,
          resource: { asset, field_type: fieldType } };
  });
  const linkRemoves: MutateOp[] = priorLinkNames.map((resource_name) => ({
    entity: resource_name.includes("/campaignAssets/") ? "campaign_asset" : "customer_asset",
    operation: "remove" as const,
    resource: { resource_name },
  }));
  return [...assetCreates, ...linkCreates, ...linkRemoves];
}

/** Inverse assembled at APPLY: re-create every prior link from the propose-time
 *  snapshot, remove every link and asset this apply created. Mutate results
 *  echo EVERY op's resource name including the removes — names present in the
 *  prior snapshot are echoes of our own removes, not creations: skip them. */
export function buildAssetInverse(
  _customerId: string, resultNames: string[], priorState: Record<string, PriorState>,
): MutateOp[] {
  const priorNames = new Set(Object.keys(priorState));
  const relinks: MutateOp[] = Object.values(priorState).map((p) => {
    const resource: Record<string, unknown> = {
      asset: (p as any).asset, field_type: (p as any).field_type,
    };
    if ((p as any).campaign) resource.campaign = (p as any).campaign;
    return {
      entity: (p as any).campaign ? "campaign_asset" : "customer_asset",
      operation: "create" as const,
      resource,
    };
  });
  const created = resultNames.filter((n) => !priorNames.has(n));
  const unlinkNew: MutateOp[] = created
    .filter((n) => n.includes("/customerAssets/") || n.includes("/campaignAssets/"))
    .map((resource_name) => ({
      entity: resource_name.includes("/campaignAssets/") ? "campaign_asset" : "customer_asset",
      operation: "remove" as const, resource: { resource_name },
    }));
  const removeAssets: MutateOp[] = created
    .filter((n) => /\/assets\/\d+$/.test(n))
    .map((resource_name) => ({
      entity: "asset", operation: "remove" as const, resource: { resource_name },
    }));
  return [...relinks, ...unlinkNew, ...removeAssets];
}

/** Discriminates one declarative-replace target: at most one pending proposal
 *  per (customer, tool, target) in a run. */
export function assetTargetKey(level: AssetLevel, campaignId: string | undefined): string {
  return level === "campaign" ? `campaign:${campaignId}` : "account";
}
```

- [ ] **Step 4: Add the snapshot reader to `execute.ts`**

`lib/google-ads/mutate/execute.ts` — after `readTrackingParams` (~line 108), add `readAssetLinks`. It snapshots current links + enough asset detail for the change-list AND the inverse. Follow `readAdTexts`' shape (query → keyed `PriorState` map). No not-found guard — an empty set is a legal prior state (first sitelinks ever):

```ts
/** Current asset links at a level, keyed by link resource_name. Value carries
 *  the link fields the inverse needs (asset, field_type, campaign) plus the
 *  asset's display fields for the human change-list. Empty result is legal. */
export async function readAssetLinks(
  customer: Customer, fieldType: string, level: "account" | "campaign",
  campaignId: string | undefined, customerId: string,
): Promise<Record<string, PriorState>> {
  const table = level === "campaign" ? "campaign_asset" : "customer_asset";
  const campaignWhere = level === "campaign"
    ? ` AND campaign.id = ${Number(campaignId)}` : "";
  const rows = await customer.query(
    `SELECT ${table}.resource_name, ${table}.asset, asset.id,
            asset.sitelink_asset.link_text, asset.sitelink_asset.description1,
            asset.sitelink_asset.description2, asset.final_urls,
            asset.callout_asset.callout_text,
            asset.structured_snippet_asset.header, asset.structured_snippet_asset.values
       FROM ${table}
      WHERE ${table}.field_type = '${fieldType}' AND ${table}.status != 'REMOVED'${campaignWhere}`,
  );
  const out: Record<string, PriorState> = {};
  for (const r of rows as any[]) {
    const link = r[table];
    out[link.resource_name] = {
      asset: link.asset,
      field_type: fieldType,
      ...(level === "campaign" ? { campaign: rn.campaign(customerId, campaignId!) } : {}),
      detail: {
        sitelink: r.asset?.sitelink_asset ?? undefined,
        final_urls: r.asset?.final_urls ?? undefined,
        callout: r.asset?.callout_asset?.callout_text ?? undefined,
        snippet: r.asset?.structured_snippet_asset ?? undefined,
      },
    };
  }
  return out;
}
```

NOTE (verify while implementing): field-type enum values may come back as numbers from the lib (same gotcha as `categoryName`/`originName` in this file) — the WHERE clause compares by NAME which GAQL accepts; if `detail` fields carry numeric enums, leave them (display-only). Import `rn` if not already imported.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/google-ads-mutate-assets.test.ts`
Expected: PASS. (`readAssetLinks` is covered by the route tests in Task 5 with a mocked `customer.query`, matching how `readAdTexts` is tested in `tests/unit/google-ads-mutate-execute.test.ts` — add a `readAssetLinks` case there mirroring its `readAdTexts` cases: one account-level, one campaign-level, one empty-result-is-legal.)

- [ ] **Step 6: Commit**

```bash
git add lib/google-ads/mutate/assets.ts lib/google-ads/mutate/execute.ts tests/unit/google-ads-mutate-assets.test.ts tests/unit/google-ads-mutate-execute.test.ts
git commit -m "feat(google-ads): shared asset-swap machinery for sitelinks/callouts/snippets"
```

---

### Task 3: `ad_text` paths + pinning

**Blocked by:** Task 1

**Files:**
- Modify: `lib/google-ads/mutate/builders.ts:84-108` (`buildAdTextOps`)
- Modify: `lib/google-ads/mutate/execute.ts:77-108` (`readAdTexts`)
- Test: `tests/unit/google-ads-mutate-builders.test.ts`, `tests/unit/google-ads-mutate-execute.test.ts` (extend both)

Use test-driven-development: extend the existing test files first.

- [ ] **Step 1: Extend builder tests**

In `tests/unit/google-ads-mutate-builders.test.ts`, add to the `buildAdTextOps` describe block:

```ts
it("normalizes pinned entries and passes paths", () => {
  const [op] = buildAdTextOps("111", [{
    ad_group_id: "22", ad_id: "33",
    headlines: ["Plain", { text: "Pinned", pin: "HEADLINE_1" }],
    path1: "pricing", path2: "teams",
  }]);
  const ad = (op.resource as any).ad;
  expect(ad.responsive_search_ad.headlines).toEqual([
    { text: "Plain" },
    { text: "Pinned", pinned_field: "HEADLINE_1" },
  ]);
  expect(ad.responsive_search_ad.path1).toBe("pricing");
  expect(ad.responsive_search_ad.path2).toBe("teams");
});

it("accepts paths alone as a valid edit", () => {
  expect(() => buildAdTextOps("111", [{ ad_group_id: "22", ad_id: "33", path1: "pricing" }]))
    .not.toThrow();
});
```

- [ ] **Step 2: Watch them fail**

Run: `npx vitest run tests/unit/google-ads-mutate-builders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `buildAdTextOps`**

`builders.ts:84-108` — normalize entries and add paths. The entry mapper becomes:

```ts
const toAsset = (e: AdTextEntry) =>
  typeof e === "string" ? { text: e } : { text: e.text, ...(e.pin ? { pinned_field: e.pin } : {}) };
```

`rsa.headlines = i.headlines.map(toAsset)`, same for descriptions; after those, `if (i.path1) rsa.path1 = i.path1; if (i.path2) rsa.path2 = i.path2;`. Update the at-least-one-field guard message to include paths (`headlines, descriptions, final_urls, path1 or path2`). Keep the UPDATE-never-REMOVE+ADD comment as is.

- [ ] **Step 4: Extend the prior-state read (spec requirement — revert must restore pins/paths)**

`execute.ts:77-108` (`readAdTexts`) — add to the GAQL SELECT: `ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2`. The headlines/descriptions selections already fetch full `AdTextAsset` objects — extend the snapshot mappers to carry the pin: `.map((h: any) => ({ text: h.text, ...(h.pinned_field ? { pinned_field: h.pinned_field } : {}) }))`, and add `path1: a.responsive_search_ad?.path1 ?? "", path2: a.responsive_search_ad?.path2 ?? ""` inside the snapshot's `responsive_search_ad`. NOTE: `pinned_field` may come back as a NUMBER from the lib (proto enum gotcha, see `categoryName` in this file) — normalize to the enum NAME via the lib's `enums.ServedAssetFieldType[value]` reverse mapping before storing, since the inverse replays this object verbatim as a mutate.

In `tests/unit/google-ads-mutate-execute.test.ts`, extend the existing `readAdTexts` case: the mocked row gains `path1`, `path2` and a pinned headline (numeric enum), and the asserted snapshot carries `path1`, `path2`, `pinned_field` as the NAME.

- [ ] **Step 5: Run both test files**

Run: `npx vitest run tests/unit/google-ads-mutate-builders.test.ts tests/unit/google-ads-mutate-execute.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/google-ads/mutate/builders.ts lib/google-ads/mutate/execute.ts tests/unit/google-ads-mutate-builders.test.ts tests/unit/google-ads-mutate-execute.test.ts
git commit -m "feat(google-ads): ad_text display paths and headline/description pinning"
```

---

### Task 4: Caps

**Blocked by:** Task 1

**Files:**
- Modify: `lib/google-ads/mutate/caps.ts:9-19` (CAPS table)
- Test: `tests/unit/google-ads-mutate-caps.test.ts` (extend)

- [ ] **Step 1: Extend the caps test** — add a case asserting `checkEntityCap("sitelinks", 11)` returns a refusal string and `checkEntityCap("structured_snippets", 5)` returns null. Run it, watch it fail (TS error on unknown key is the failure mode).

- [ ] **Step 2: Add cap entries** to `CAPS` (`caps.ts:9-19`):

```ts
sitelinks: { maxEntities: 10 },           // full desired set at one level
callouts: { maxEntities: 10 },
structured_snippets: { maxEntities: 5 },  // snippet SETS (headers), not values
```

- [ ] **Step 3: Run** `npx vitest run tests/unit/google-ads-mutate-caps.test.ts` — PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/google-ads/mutate/caps.ts tests/unit/google-ads-mutate-caps.test.ts
git commit -m "feat(google-ads): blast-radius caps for asset kinds"
```

---

### Task 5: Route wiring (validate → propose → apply)

**Blocked by:** Task 2, Task 3, Task 4

**Files:**
- Modify: `apps/ingest/src/routes/google-ads-mutate.ts` (validation ~126-232, propose dispatch ~290-510, apply ~511-590, `summarize` table ~273)
- Reuse: `lib/google-ads/mutate/assets.ts` (Task 2), `readAssetLinks` (Task 2), `campaignSpend` (`caps.ts`)
- Test: `tests/unit/google-ads-mutate-route.test.ts` (extend)

Use test-driven-development. Follow the existing route-test style (mocked pool + customer).

- [ ] **Step 1: Extend route tests** — add cases:

1. **Validation rejections** (drive `validateProposeBody` directly, as existing tests do): sitelink `link_text` 26 chars → error; `level: "campaign"` without `campaign_id` → error; snippet header not in `SNIPPET_HEADERS` → error; snippet with 2 values → error; snippet with 11 values → error; callout empty string → error; `path2` without `path1` on ad_text → error; unknown pin `"HEADLINE_9"` → error; happy path for each of the three kinds returns `ok: true` with normalized value.
2. **ad_text pin/path validation**: `{ text: "x", pin: "HEADLINE_1" }` accepted in headlines; `pin: "DESCRIPTION_1"` rejected in headlines (wrong axis).
3. **Propose branch (mocked)**: sitelinks account-level propose stores `inverse: null` (CREATE kind), prior state from the mocked `readAssetLinks`, and ops from `buildAssetSwapOps`; a second propose for the same `(tool, target)` in the same run returns 400 with a "declarative replace" message.
4. **Apply branch (mocked)**: for a sitelinks row, apply computes the inverse via `buildAssetInverse` (not `inverseFromMutateResults`) and passes it to `markApplied`.

Write the test bodies by mirroring the closest existing route tests case-for-case (the file already mocks `insertProposal`/`claimProposal`/`runMutate`; reuse those harnesses — do not build a new mock layer).

- [ ] **Step 2: Watch them fail** — `npx vitest run tests/unit/google-ads-mutate-route.test.ts`.

- [ ] **Step 3: Validation branches**

In `validateProposeBody` (`google-ads-mutate.ts:137+`), before the generic `items` check (~line 214, which these kinds don't fit — they carry `sitelinks`/`callouts`/`snippets` arrays, not `items`), add three branches following the `campaign_conversion_goals` branch's shape (~176-210). Shared prelude for all three:

```ts
const level = b.level;
if (level !== "account" && level !== "campaign") {
  return { ok: false, error: `level must be "account" or "campaign", got ${JSON.stringify(b.level)}` };
}
let campaignId: string | undefined;
if (level === "campaign") {
  const e = badId("campaign_id", b.campaign_id);
  if (e) return { ok: false, error: e };
  campaignId = String(b.campaign_id);
}
```

Then per kind (char limits from the header constants; return `{ ok: true, value: { tool: t, customerId, runId, items: <the list>, level, campaignId } }` — reuse the `items` slot to carry the list so `entityCount = items.length` keeps working):
- `sitelinks`: non-empty array; each item: `link_text` non-empty ≤25, `final_url` must parse as https? URL (`new URL(...)` + protocol check), `description1/2` if present ≤35. Reject duplicate `link_text` values (a declarative set has no duplicates).
- `callouts`: non-empty array of non-empty strings ≤25, no duplicates.
- `structured_snippets`: non-empty array; each `{ header, values }`: header `SNIPPET_HEADERS.includes(header)`, values array 3–10 of non-empty strings ≤25; no duplicate headers.

Also extend the existing `ad_text` item validation (~line 233+): entries may be `string` or `{ text, pin }` — text non-empty, headline pins in `HEADLINE_PINS`, description pins in `DESCRIPTION_PINS`; `path1`/`path2` strings ≤15, `path2` only with `path1`.

- [ ] **Step 4: Propose dispatch branch**

In the propose handler's tool dispatch (after the `tracking_params` branch, ~line 400), add one branch covering all three kinds:

```ts
} else if (tool === "sitelinks" || tool === "callouts" || tool === "structured_snippets") {
  const { level, campaignId } = parsed.value;
  const fieldType = FIELD_TYPE[tool];
  // one declarative-replace target per (tool, run): a second full-set proposal
  // for the same target makes apply/revert order-dependent — reject it.
  if (parsed.value.runId) {
    const dup = await pool.query(
      `SELECT payload FROM google_ads_proposal
        WHERE workspace_id = $1 AND customer_id = $2 AND tool = $3 AND run_id = $4
          AND status IN ('proposed','applying','applied')`,
      [workspaceId, customerId, tool, parsed.value.runId],
    );
    const key = assetTargetKey(level!, campaignId);
    for (const r of dup.rows) {
      if (assetTargetKeyFromOps(r.payload.operations) === key) {
        return c.json({ error: "invalid_request",
          message: `a ${tool} proposal for this ${level} already exists in this run — declarative replace allows one full set per target` }, 400);
      }
    }
  }
  priorState = await readAssetLinks(customer, fieldType, level!, campaignId, customerId);
  operations = buildAssetSwapOps(customerId, tool, level!, campaignId, items as any[], Object.keys(priorState));
  affectedSpend = level === "campaign"
    ? await campaignSpend(workspaceId, customerId, [campaignId!])
    : 0; // account-level extensions change no bid/budget — same stance as conversion goals
}
```

`assetTargetKeyFromOps` is a ~6-line helper in `assets.ts` (add it in this task, with one unit test in the assets test file): scan ops for the first `campaign_asset`/`customer_asset` op; campaign ops carry `resource.campaign` or a `/campaignAssets/<cid>~` resource_name → `campaign:<id>`; else `account`.

Note: `priorState` may legitimately be `{}` here (first-ever sitelinks). `inverseFromPriorState` is never called for these kinds (they're in `CREATE_TOOLS`, so propose stores `inverse = null` — the existing ~line 470 line already handles that). The existing `insertProposal` call needs no change.

- [ ] **Step 5: Apply-branch inverse**

`google-ads-mutate.ts:560-565` — the CREATE-inverse block becomes kind-aware:

```ts
let inverse: MutateOp[] | null = null;
if (row.tool === "sitelinks" || row.tool === "callouts" || row.tool === "structured_snippets") {
  inverse = buildAssetInverse(row.payload.customerId, result.resourceNames, row.prior_state ?? {});
} else if (CREATE_TOOLS.includes(row.tool)) {
  inverse = inverseFromMutateResults(row.tool, result.resourceNames.map((resource_name) => ({ resource_name })));
}
```

(Verify the claimed row exposes `prior_state` — `claimProposal` in the store module selects it for the revert path; if it doesn't, add the column to its SELECT.)

- [ ] **Step 6: Summaries**

Add to the `summarize` table (~line 273): `sitelinks: "replace sitelinks"`, `callouts: "replace callouts"`, `structured_snippets: "replace structured snippets"`.

- [ ] **Step 7: Run tests** — `npx vitest run tests/unit/google-ads-mutate-route.test.ts tests/unit/google-ads-mutate-assets.test.ts` — PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ingest/src/routes/google-ads-mutate.ts lib/google-ads/mutate/assets.ts tests/unit/google-ads-mutate-route.test.ts tests/unit/google-ads-mutate-assets.test.ts
git commit -m "feat(google-ads): propose/apply/revert for sitelinks, callouts, structured snippets"
```

---

### Task 6: Migration 292

**Blocked by:** none

**Files:**
- Create: `supabase/migrations/292_google_ads_proposal_asset_kinds.sql` (in full_db — confirm 292 is still next with `ls supabase/migrations/ | tail -1` before creating)

- [ ] **Step 1: Write the migration** (mirrors `291_google_ads_proposal_conversion_goals.sql` exactly):

```sql
-- Migration 292: widen google_ads_proposal.tool for the asset kinds.
-- sitelinks / callouts / structured_snippets: declarative-replace of the
-- asset links at account or campaign level, propose→apply→revert.
--
-- Apply via psql against owner DATABASE_URL (NOT supabase db push) — see CLAUDE.md.
BEGIN;

ALTER TABLE google_ads_proposal DROP CONSTRAINT IF EXISTS google_ads_proposal_tool_check;
ALTER TABLE google_ads_proposal ADD CONSTRAINT google_ads_proposal_tool_check
  CHECK (tool IN ('negative_keywords','campaign_status','campaign_budget',
                  'ad_text','tracking_params','conversion_goal_settings',
                  'campaign_conversion_goals','custom_conversion_goal',
                  'sitelinks','callouts','structured_snippets'));

COMMIT;
```

- [ ] **Step 2: Commit** (file only — the psql apply happens at deploy time, Task 7 notes):

```bash
git add supabase/migrations/292_google_ads_proposal_asset_kinds.sql
git commit -m "feat(google-ads): migration 292 — tool CHECK gains asset kinds"
```

---

### Task 7: full_db verify, review, PR

**Blocked by:** Task 5, Task 6

**Files:** none new (verification + PR)

- [ ] **Step 1: Run the named test files only** (per-task discipline — not the whole suite):

```bash
npx vitest run tests/unit/google-ads-mutate-assets.test.ts tests/unit/google-ads-mutate-builders.test.ts tests/unit/google-ads-mutate-execute.test.ts tests/unit/google-ads-mutate-caps.test.ts tests/unit/google-ads-mutate-route.test.ts tests/unit/google-ads-mutate-store.test.ts tests/unit/google-ads-mutate-inverse.test.ts
npx tsc --noEmit
```
Expected: all PASS.

- [ ] **Step 2: codex-review mode=code** on the branch diff (`git diff main`). Fix critical/high, re-run the named tests.

- [ ] **Step 3: Push + PR** (automatic, no asking — merge waits for user):

```bash
git push -u origin ad-surface-writes
gh pr create --title "feat(google-ads): ad-surface writes — sitelinks, callouts, snippets, ad_text paths+pins" --body "..."
```

PR body: link the spec path (in fullvision-plugin), the one-atomic-swap invariant, and the deploy checklist: **after merge** → `scripts/deploy-after-merge.sh` (stash main-checkout WIP first), then `psql "$DATABASE_URL" -f supabase/migrations/292_google_ads_proposal_asset_kinds.sql`.

- [ ] **Step 4: Live smoke (after user-approved merge + deploy, account 456-010-5719):** propose sitelinks account-level with the CURRENT 6 sitelinks read via GAQL (a no-op-shaped replace), verify the proposal's prior_state matches, let it EXPIRE unapplied (60 min) — proves read+validate end-to-end with zero mutation. Do not apply anything without the user.

---

### Task 8: full_distrib relay

**Blocked by:** Task 7 (route contract frozen)

**Files:**
- Modify: `src/mcp/google-ads-tools.ts` (in full_distrib — tool-name list ~20-27, ad_text schema ~188-211, new registrations after ~241)
- Modify: `docs-mintlify/mcp-server/tools.mdx`
- Test: extend full_distrib's existing google-ads tools test (locate via `grep -rl google_propose_ad_text tests/ src/`)

Workspace: resolve the full_distrib project id via `~/.superset/bin/superset projects list --json`, then `ws create --local --name ad-surface-writes --branch ad-surface-writes --base-branch main`. NOTE: full_distrib carries local docs-only commits on main — if the base needs syncing use `git rebase origin/main`, never reset.

- [ ] **Step 1: Extend the ad_text zod schema** (`google-ads-tools.ts:188-211`): entries become `z.union([z.string().max(30), z.object({ text: z.string().max(30), pin: z.enum(["HEADLINE_1","HEADLINE_2","HEADLINE_3"]) })])` (descriptions: max 90, pins `DESCRIPTION_1|2`), add `path1`/`path2` `z.string().max(15).optional()`. Extend the tool description: pinning is opt-in; `path2` requires `path1`.

- [ ] **Step 2: Register the three tools** after `google_propose_tracking_params` (~line 241), mirroring its registration shape exactly (`server.tool(name, description, schema, async (p) => post("/v1/ads/google/propose", { tool: "<kind>", ...p }))`):
  - `google_propose_sitelinks` — schema: `customer_id` (same regex as siblings), `level: z.enum(["account","campaign"])`, `campaign_id` optional digits, `sitelinks: z.array(z.object({ link_text: z.string().max(25), final_url: z.string().url(), description1: z.string().max(35).optional(), description2: z.string().max(35).optional() })).min(1).max(10)`, `run_id` optional uuid.
  - `google_propose_callouts` — `callouts: z.array(z.string().min(1).max(25)).min(1).max(10)`.
  - `google_propose_structured_snippets` — `snippets: z.array(z.object({ header: z.enum([...the 13 headers...]), values: z.array(z.string().max(25)).min(3).max(10) })).min(1).max(5)`.

  Each description MUST state: **declarative replace** ("states the desired FULL set at that level — existing links at that level are swapped out atomically; nothing applies until apply_proposal; revert restores the prior set"), and add the three names to the tool-name list at lines 20-27.

- [ ] **Step 3: Extend tests** — mirror the existing per-tool test cases (schema accept/reject + post body includes `tool: "<kind>"`). Run only the touched test file. Expected: PASS.

- [ ] **Step 4: Docs** — add the three tools to `docs-mintlify/mcp-server/tools.mdx` next to the existing propose tools, one paragraph each, stating declarative replace + level semantics.

- [ ] **Step 5: codex-review mode=code**, fix critical/high, re-run the touched test file.

- [ ] **Step 6: Commit, push, PR** (same message discipline as Task 7; deploy after user-approved merge via `scripts/deploy-after-merge.sh` from full_distrib root — stash main-checkout WIP first).

---

### Task 9: Plugin docs

**Blocked by:** Task 8 (tool names final)

**Files:**
- Modify: `shared/platforms/google.md` (in fullvision-plugin — write-surface list ~18, "Still out of v1" line 92)
- Modify: `skills/google-ads-review/SKILL.md` (locate the write-tools/out-of-scope mentions via `grep -n "propose\|out of" skills/google-ads-review/SKILL.md`)
- Modify: `CHANGELOG.md`
- Modify: the contract test listing expected gateway tool names (locate via `grep -rln google_propose_ad_text tests/ *.test.* 2>/dev/null` from repo root) — add the three new names.

Workspace: resolve the fullvision-plugin project id, `ws create --local --name ad-surface-writes --branch ad-surface-writes --base-branch main`.

- [ ] **Step 1: `shared/platforms/google.md`** — new section "Ad-surface assets (sitelinks, callouts, structured snippets)" after the conversion-goal section: the three tools, account vs campaign level (`level=campaign` needs `campaign_id`), **declarative replace** semantics (read current set via GAQL first: from `customer_asset` for account level — campaign_asset returns nothing for account links — and `campaign_asset` for campaign level), caps (10/10/5), one-target-per-run rule, revert restores the prior set. Also document ad_text's new `path1`/`path2` + pin entries in the existing write-surface paragraph. Update line 92: remove sitelinks/assets from "Still out of v1" (bidding etc. stay out).

- [ ] **Step 2: `skills/google-ads-review/SKILL.md`** — wherever the skill lists available write actions or defers assets as out-of-scope, add sitelinks/callouts/snippets with a one-line judgment note: propose only when the LP set changed (the first real use: repoint the 6 account-level sitelinks at the new LPs once shipped).

- [ ] **Step 3: `CHANGELOG.md`** — one entry, tool names + declarative-replace semantics + ad_text paths/pins.

- [ ] **Step 4: Contract test** — add the three tool names. Run it: it must FAIL (gateway not yet deployed) with ONLY the three new names missing — that exact failure is the expected pre-deploy state and the merge gate.

- [ ] **Step 5: Commit, push, PR.** State in the PR body: merge after the full_db + full_distrib deploys land (contract test goes green then).

---

## Deploy order (after all three PRs exist — each merge on user go-ahead only)

1. full_db: merge → `scripts/deploy-after-merge.sh` → `psql "$DATABASE_URL" -f supabase/migrations/292_google_ads_proposal_asset_kinds.sql`.
2. full_distrib: merge → `scripts/deploy-after-merge.sh` from its root.
3. fullvision-plugin: contract test green → merge.
4. Task 7 Step 4 live smoke.
