# FullVision Claude Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of the public `fullvision-plugin` Claude Code plugin — six skills, a six-server MCP bundle, three shared protocol docs, and a CI test suite that fails loudly when the FullVision MCP tool surface drifts.

**Architecture:** A standalone public repo that is simultaneously the plugin and its own marketplace. Skills are markdown-only (`skills/fv-<name>/SKILL.md`) with declarative frontmatter (`requires` / `writes` / `cadence`) that drives graceful degradation: a missing read dependency makes a skill unavailable, a missing write dependency makes it read-only and it emits a change-list artifact instead of erroring. All judgment shared across skills lives in `shared/*.md`, referenced by every SKILL.md rather than duplicated. A Node/vitest suite validates frontmatter, asserts every named view and tool still exists on the live FullVision MCP, and proves the degradation and thin-data refusal paths.

**Tech Stack:** Markdown skills, JSON manifests, Node 20 + vitest + `yaml` for the test suite, GitHub Actions for CI, `claude plugin validate --strict`.

---

## Execution environment (read this first)

The target repo **already exists** — it was created during planning. Do **not** create it.

- **Local path:** `/Users/jean-baptistejezequel/Desktop/cursor/fullvision/fullvision-plugin`
- **GitHub:** `FullVision-Team/fullvision-plugin` (public, MIT, `main` pushed)
- **Superset project id:** `cfdb2aaf-eb6e-4c37-9139-780bac0df7bc`
- **Already on `main`:** `README.md` (placeholder), `LICENSE` (MIT), `.gitignore`

`executing-plans` must create its workspace **in this project**, not in `full_db`:

```bash
superset ws create --local --branch fullvision-plugin-v1 --base-branch main \
  --project cfdb2aaf-eb6e-4c37-9139-780bac0df7bc
```

Every path in this plan is relative to the plugin repo root. A copy of the spec and this plan is committed to `docs/` on the plugin repo's `main`, so the workspace has both.

**Two spec deviations resolved during planning — implement these, not the spec's version:**

1. **`fv-build-audience` is read-only in v1.** Audience create/sync tools live in `full_distrib/src/agent/tools/audiences.ts` (the Iris agent surface) and are **not** exposed on the MCP server — its 20 tools are views / SQL / custom-views / funnels only. Per spec §3.4 this is read-only mode, not an error: the skill sizes the segment, runs the floor check and consent gate, and emits a change-list artifact pointing at the FullVision app for activation.
2. **The FullVision MCP surface is 20 tools, not 22.** Verified at `full_distrib/src/mcp/server.ts`. The contract test asserts against the live server, so it self-corrects; do not hardcode 22.

**Verified facts the skills depend on** (from `full_distrib`, do not re-derive):

- MCP endpoint: `https://data.fullvision.io/mcp` (`src/api/server.ts:3131`), bearer auth `Authorization: Bearer sk_…` (`src/mcp/server.ts:529`).
- The 20 tools: `query_view`, `get_table_schema`, `run_sql_query`, `save_custom_view`, `list_custom_views`, `run_custom_view`, `update_custom_view`, `delete_custom_view`, `compile_custom_view`, `save_funnel`, `list_funnels`, `run_funnel`, `update_funnel`, `delete_funnel`, `list_views`, `list_tables`, `list_recipes`, `list_metrics`, `get_guidance`, `ask`.
- Every view named in the spec exists in `REGISTRY` (`full_distrib/src/core/registry.ts`): `ads-leaderboard`, `ads-performance`, `ads-measurement-start`, `ltv-by-campaign`, `keyword-performance`, `ad-landing-pages`, `page-performance`, `page-customers`, `engagement-by-page`, `scroll-depth-by-page`, `rageclicks-by-page`, `dead-clicks-by-page`, `form-performance`, `conversion-funnel`, `gsc-performance`, `gsc-by-page`, `gsc-queries`, `gsc-striking-candidates`, `health-identity-recon`, `health-checkout-coverage`, `health-event-coverage`, `customer-ltv`, `abandoned-checkouts`, `people`.
- Pinned community/self-hosted SHAs resolved 2026-07-20:
  - `googleads/google-ads-mcp` → `f48a6b85e1f43ebd44a72531c9611e2b7265ca28`
  - `danielpopamd/linkedin-ads-mcp` (25★) → `05a27618628408af263ac56a1ca62a8aef404718`

**Dependency Graph:**
- **Wave 1** (parallel, no blockers): T1, T2, T3, T4, T5, T6
- **Wave 2** (parallel, after Wave 1): T7 (needs T1), T8 (needs T2), T9 (needs T2)
- **Wave 3** (parallel, after Wave 2): T10, T11, T12, T13, T14, T15, T16, T17
- **Wave 4** (after Wave 3): T18, T19

---

### Task 1: Plugin + marketplace manifests

**Blocked by:** none

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "fullvision",
  "version": "0.1.0",
  "description": "Revenue-attributed marketing operations for Claude Code. Joins ad spend, web behaviour, SEO and Stripe revenue, then proposes and applies the changes.",
  "author": {
    "name": "FullVision",
    "url": "https://fullvision.io"
  },
  "homepage": "https://github.com/FullVision-Team/fullvision-plugin",
  "repository": "https://github.com/FullVision-Team/fullvision-plugin",
  "license": "MIT",
  "keywords": [
    "marketing",
    "attribution",
    "google-ads",
    "meta-ads",
    "linkedin-ads",
    "seo",
    "stripe",
    "roas",
    "analytics"
  ]
}
```

- [ ] **Step 2: Write `.claude-plugin/marketplace.json`**

The repo is its own marketplace, so the single plugin entry has `"source": "./"`.

```json
{
  "name": "fullvision-plugin",
  "owner": {
    "name": "FullVision",
    "url": "https://fullvision.io"
  },
  "plugins": [
    {
      "name": "fullvision",
      "source": "./",
      "description": "Revenue-attributed marketing operations: cut wasted ad spend, fix leaky landing pages, build consent-gated audiences — all judged on real Stripe revenue."
    }
  ]
}
```

- [ ] **Step 3: Write `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to the FullVision plugin.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-07-20

### Added
- Initial v1: six skills (`fv-setup`, `fv-data-health`, `fv-verify-revenue-feedback-loop`,
  `fv-cut-wasted-spend`, `fv-find-leaky-pages`, `fv-fix-page`, `fv-build-audience`).
- MCP bundle: fullvision, meta-ads, google-ads, linkedin-ads, webflow, brevo.
- Shared protocols: safety rails, sparse-data, FullVision data reading, report format.

### Known limitations
- Google Ads is **read-only** — the official server exposes GAQL reads only. Google changes
  are emitted as a reviewed change-list the user applies by hand.
- `fv-build-audience` is read-only — audience activation is not on the FullVision MCP surface yet.
- FullVision MCP uses bearer-token auth; 1-click OAuth ships separately.
```

- [ ] **Step 4: Validate the manifests**

Run: `claude plugin validate --strict .`
Expected: exit 0, no errors. (Warnings about missing skills are expected at this point and must be gone by T19.)

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin CHANGELOG.md
git commit -m "feat: plugin and marketplace manifests"
```

---

### Task 2: MCP server bundle

**Blocked by:** none

**Files:**
- Create: `.mcp.json`
- Create: `docs/mcp-servers.md`

- [ ] **Step 1: Write `.mcp.json`**

Two things are load-bearing here. Community and self-hosted servers are pinned to a reviewed
commit SHA (they can spend customer money — a floating tag is a supply-chain hole). The
FullVision URL is overridable via `FULLVISION_MCP_URL` so staging can be pointed at, and the
bearer header is env-expanded so no token lands in the repo. When OAuth ships, the `headers`
block is the only thing that gets deleted.

```json
{
  "mcpServers": {
    "fullvision": {
      "type": "http",
      "url": "${FULLVISION_MCP_URL:-https://data.fullvision.io/mcp}",
      "headers": {
        "Authorization": "Bearer ${FULLVISION_API_KEY}"
      }
    },
    "meta-ads": {
      "type": "http",
      "url": "https://mcp.facebook.com/ads"
    },
    "google-ads": {
      "type": "stdio",
      "command": "pipx",
      "args": [
        "run",
        "--spec",
        "git+https://github.com/googleads/google-ads-mcp.git@f48a6b85e1f43ebd44a72531c9611e2b7265ca28",
        "google-ads-mcp"
      ],
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "${GOOGLE_ADS_DEVELOPER_TOKEN}"
      }
    },
    "linkedin-ads": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "github:danielpopamd/linkedin-ads-mcp#05a27618628408af263ac56a1ca62a8aef404718"
      ],
      "env": {
        "LINKEDIN_ACCESS_TOKEN": "${LINKEDIN_ACCESS_TOKEN}"
      }
    },
    "webflow": {
      "type": "http",
      "url": "https://mcp.webflow.com/sse"
    },
    "brevo": {
      "type": "http",
      "url": "https://mcp.brevo.com/mcp",
      "headers": {
        "api-key": "${BREVO_API_KEY}"
      }
    }
  }
}
```

- [ ] **Step 2: Write `docs/mcp-servers.md`** — the pinned-SHA review record

This file is the audit trail §3.6 requires. The pinned-SHA CI check (T9) reads it.

```markdown
# MCP servers — review record

Official, first-party servers may float. Community and self-hosted servers are pinned to a
reviewed commit SHA and **a dependency-update PR is a security review, not a chore** — these
servers hold credentials that can spend customer money.

| Server | Provider | Trust | Pin | Reviewed |
|---|---|---|---|---|
| `fullvision` | FullVision | first-party | n/a (hosted) | — |
| `meta-ads` | Meta | official hosted | n/a (hosted) | — |
| `google-ads` | Google (`googleads/google-ads-mcp`) | official, self-hosted | `f48a6b85e1f43ebd44a72531c9611e2b7265ca28` | 2026-07-20 |
| `linkedin-ads` | community (`danielpopamd/linkedin-ads-mcp`, 25★) | **community** | `05a27618628408af263ac56a1ca62a8aef404718` | 2026-07-20 |
| `webflow` | Webflow | official hosted | n/a (hosted) | — |
| `brevo` | Brevo | first-party | n/a (hosted) | — |

## Capability matrix

| Server | Read | Write | Customer auth burden |
|---|---|---|---|
| fullvision | 20 tools over 73 views | custom views, funnels | bearer key today; 1-click OAuth planned |
| meta-ads | ✅ | ✅ 29 tools | 1-click OAuth |
| google-ads | ✅ GAQL only | ❌ **read-only by design** | developer token (days) + Python toolchain |
| linkedin-ads | ✅ | ✅ | own dev app + LinkedIn app review (weeks) |
| webflow | ✅ | ✅ CMS / pages | 1-click OAuth |
| brevo | ✅ | ✅ lists / segments / campaigns | API key |

## Deliberately excluded

**Amazon SES** is a send-only destination reached via the AWS CLI/SDK, not a bundled MCP. No
production-grade SES MCP exists (awslabs has an open RFC; only a non-production AWS *sample*
ships). SES also allows one contact list per AWS account with no segments and no campaign
object, so segment and campaign skills are structurally impossible there.

## Bumping a pin

1. Read the full diff between the pinned SHA and the candidate. Not the changelog — the diff.
2. Check for new network egress, new credential reads, new write tools, new transitive deps.
3. Update `.mcp.json` **and** the table above in the same PR, with a new review date.
4. Never `@latest`, never a mutable tag — CI fails on either.
```

- [ ] **Step 3: Verify the JSON parses and every pin is a 40-char SHA**

Run:
```bash
node -e "const m=require('./.mcp.json');console.log(Object.keys(m.mcpServers).join(' '))"
```
Expected: `fullvision meta-ads google-ads linkedin-ads webflow brevo`

- [ ] **Step 4: Commit**

```bash
git add .mcp.json docs/mcp-servers.md
git commit -m "feat: MCP server bundle with pinned community SHAs"
```

---

### Task 3: `shared/reading-fullvision-data.md`

**Blocked by:** none

**Files:**
- Create: `shared/reading-fullvision-data.md`

- [ ] **Step 1: Write the file**

Every skill references this instead of restating view names and attribution gotchas. Keep it
factual — this is a reference sheet, not prose.

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add shared/reading-fullvision-data.md
git commit -m "docs: shared FullVision data reading protocol"
```

---

### Task 4: `shared/safety-rails.md`

**Blocked by:** none

**Files:**
- Create: `shared/safety-rails.md`

- [ ] **Step 1: Write the file**

This is binding on every skill that writes. It is quoted, not paraphrased, by each write skill.

````markdown
# Safety rails — the write protocol

Binding on every skill that writes anywhere: ad platforms, the website, email, audiences.
A skill may not relax any rule here. A skill may only make a rule *stricter*.

## 1. Propose → confirm → apply. Always two turns.

A skill never writes in the turn it analyses. It emits a change-list and stops. The user
confirms, and only then does the skill write. There is no "obviously safe" exception.

## 2. Every proposed change carries its evidence inline

Not `pause Campaign X`. This:

> **Pause `Campaign X`** — €1,240 spend / 90d, 2 payers, €310 attributed revenue,
> ROAS 0.25 (clipped window, measurement start 2026-02-11), n = 47 clicks.
> Revert: unpause in Meta Ads Manager, budget was €20/day.

The user must be able to overrule one line without re-running the analysis. If the evidence
does not fit on the line, the change is not ready to propose.

## 3. Thresholds are declared in the skill, never invented per run

Every write skill states its minimum spend, minimum conversions, and minimum window in its
own SKILL.md as fixed numbers. If the run wants a different threshold, that is a skill edit,
not a runtime decision. An LLM that picks its own threshold picks the one that produces a
recommendation.

## 4. Refuse on thin data

See `shared/sparse-data.md`. This is the single most important rule in the plugin. Below the
declared minimum n, the skill says so and stops. It does not rank anyway with a caveat.

## 5. Attribution-window honesty

Read `shared/reading-fullvision-data.md`. Never compare raw ROAS across platforms. Always use
the `clipped_*` columns and state the window judged on. Spend predating
`ads-measurement-start` is unmeasurable, not unprofitable, and may never be used as evidence
of waste.

## 6. Blast-radius caps per run

Declared per skill, defaults if the skill does not override:

- **max 10 entities** touched per run
- **max 15%** of the account's trailing-30d spend affected
- **max 1 run per skill per day** against the same account

Exceeded ⇒ stop, emit the full list, escalate to the human, apply nothing. Do not split a
too-large change-list into two runs to slip under the cap.

## 7. Change log

Every applied change appends to `.fullvision/changes/YYYY-MM-DD.md` in the working directory:

```markdown
## 14:22 — fv-cut-wasted-spend — meta-ads

**Change:** added 12 negative keywords to ad group `AG-4471`
**Why:** 12 search terms, €890 combined spend / 90d, 0 payers, ≥ 60 clicks each
**Evidence:** ads-leaderboard clipped window from 2026-02-11; keyword-performance n per term in list below
**Revert:** remove the 12 terms from the ad group's negative keyword list (full list below)
```

Write the log entry **before** the write call, not after. A crash mid-apply must leave a
record of what was attempted.

## 8. Reversibility bias

Prefer, in order: negative keyword → budget down → pause → nothing. Never the reverse.

**Irreversible actions are out of scope for v1** and a skill must refuse them outright:
delete campaign, delete ad group, delete audience, delete a page, delete a list, hard-delete
any contact. If the only way to achieve the goal is irreversible, say so and stop.

## 9. Read-only mode is not an error

If a skill's `writes` server is not connected, the skill runs the **entire** analysis and
emits the change-list as an artifact with per-change manual instructions. It reports this as
a normal outcome, not a failure. This is the permanent mode for Google Ads (§ the official
server is read-only) and for `fv-build-audience` in v1.
````

- [ ] **Step 2: Commit**

```bash
git add shared/safety-rails.md
git commit -m "docs: shared write-safety protocol"
```

---

### Task 5: `shared/sparse-data.md`

**Blocked by:** none

**Files:**
- Create: `shared/sparse-data.md`

- [ ] **Step 1: Write the file**

````markdown
# Sparse-data protocol

B2B conversion volume is low, sales cycles are long, and multi-touch attribution is
structurally unreliable. Deterministic MTA has been measured crediting web search with 78% of
conversions where 12% of the same buyers self-reported it, and roughly 60% of B2B buying
happens dark-funnel. An LLM handed 3 conversions will rank them confidently. Do not let it.

## 1. Every skill declares a minimum n and refuses below it

Stated as a fixed number in the skill's own frontmatter/body. The refusal is explicit:

> Not enough data to judge `Campaign X`: 3 payers over 90 days (minimum 8). At this volume the
> ROAS estimate's confidence interval spans profitable and unprofitable. No recommendation.

Never "ranked anyway, treat with caution."

## 2. Confidence at 80–90%, not 95%

Matching B2B practice — at these volumes a 95% bar rejects everything and the skill becomes
useless. State the level used in the output, every time.

## 3. Shrinkage over raw counts

Small-sample estimates are pulled toward the account mean, not trusted at face value. For a
campaign with `n` conversions and account mean ROAS `m`:

```
shrunk_roas = (n × observed_roas + k × m) / (n + k)      # k = 10, the prior weight
```

Rank on `shrunk_roas`. Report both. A campaign with 2 conversions and ROAS 8.0 shrinks to
roughly the account mean, which is the honest answer.

## 4. Attributed revenue is evidence, never ground truth

At low volume, a pause recommendation requires a **corroborating signal** alongside low ROAS —
one of: zero pipeline in CRM, near-zero engaged sessions from that source, no assisted
conversions in any attribution model, or a landing-page bounce profile far off the account
baseline. ROAS alone is not sufficient to spend the customer's money differently.

## 5. Never propose an A/B test the traffic can't power

Below roughly **10,000 visitors/month** on the page in question, do not propose a variant
test. The honest recommendation is qualitative: 5 user tests surface ~80% of usability
issues; 10–15 session recordings surface 70–85%. Say that instead of proposing an
underpowered test that will read as noise for six weeks.

If the traffic does support a test, state the required sample size and expected duration
before proposing it.
````

- [ ] **Step 2: Commit**

```bash
git add shared/sparse-data.md
git commit -m "docs: shared sparse-data protocol"
```

---

### Task 6: `shared/report-format.md`

**Blocked by:** none

**Files:**
- Create: `shared/report-format.md`

- [ ] **Step 1: Write the file**

````markdown
# Report format

Every skill produces exactly one artifact. Same shape, so a weekly review can concatenate
them and a human can skim six of them in two minutes.

## Structure

```markdown
# <skill name> — <account / workspace> — <YYYY-MM-DD>

**Verdict:** <one sentence. The answer, not a summary of the process.>
**Window judged:** <dates> (<clipped|full>, measurement start <date>)
**Data health:** <✅ ok | ⚠️ degraded: which check, what it biases>
**Confidence:** <80|85|90>% — <n> observations

## Proposed changes

1. **<action> `<entity>`** — <evidence with numbers and n>
   Revert: <exact instruction>

2. …

## Not proposed (and why)

- `<entity>` — <which threshold it failed, with the number>

## Notes
<anything that changes how the above should be read>
```

## Rules

- **Verdict first.** If a reader stops after one line they should have the answer.
- **Every number carries its n.** A ROAS without a denominator count is not evidence.
- **"Not proposed" is not optional.** Showing what was excluded and why is what makes the
  proposed list trustworthy. A report with an empty proposed list and a full excluded list is
  a good report.
- **No emoji beyond the health marker.** No congratulation. No "great news!".
- **Write to `.fullvision/reports/<skill>/YYYY-MM-DD.md`** in the working directory, and print
  the path.
````

- [ ] **Step 2: Commit**

```bash
git add shared/report-format.md
git commit -m "docs: shared report format"
```

---

### Task 7: Test harness + frontmatter validation

**Blocked by:** T1

**Files:**
- Create: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/lib/skills.ts`
- Create: `tests/frontmatter.test.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "fullvision-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "validate": "claude plugin validate --strict ."
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "yaml": "^2.8.0"
  }
}
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write `tests/lib/skills.ts`** — the shared loader every test uses

```ts
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const SKILLS_DIR = join(ROOT, "skills");

export interface SkillFrontmatter {
  name: string;
  description: string;
  cadence: string;
  requires: string[];
  writes: string[];
  [k: string]: unknown;
}

export interface Skill {
  dir: string;
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

/** Split `---\n<yaml>\n---\n<body>`. Throws if the fence is missing or unterminated. */
export function splitFrontmatter(raw: string): { yaml: string; body: string } {
  if (!raw.startsWith("---\n")) throw new Error("missing opening --- fence");
  const end = raw.indexOf("\n---", 3);
  if (end === -1) throw new Error("unterminated frontmatter fence");
  return {
    yaml: raw.slice(4, end),
    body: raw.slice(raw.indexOf("\n", end + 1) + 1),
  };
}

export function loadSkills(): Skill[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const path = join(SKILLS_DIR, e.name, "SKILL.md");
      const raw = readFileSync(path, "utf8");
      const { yaml, body } = splitFrontmatter(raw);
      return {
        dir: e.name,
        path,
        frontmatter: parse(yaml) as SkillFrontmatter,
        body,
      };
    });
}

export function mcpServerNames(): string[] {
  const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  return Object.keys(cfg.mcpServers);
}
```

- [ ] **Step 4: Write `tests/frontmatter.test.ts`**

```ts
import { loadSkills, mcpServerNames } from "./lib/skills";

const skills = loadSkills();
const servers = mcpServerNames();
const CADENCES = [
  "on-install",
  "precondition",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "on-demand",
];

describe("skill frontmatter", () => {
  it("finds at least one skill", () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s has well-formed frontmatter",
    (dir, skill) => {
      const fm = skill.frontmatter;
      expect(fm.name).toBe(dir);
      expect(dir).toMatch(/^fv-[a-z0-9-]+$/);
      expect(fm.description).toBeTypeOf("string");
      expect(fm.description.length).toBeGreaterThan(20);
      expect(CADENCES).toContain(fm.cadence);
      expect(Array.isArray(fm.requires)).toBe(true);
      expect(Array.isArray(fm.writes)).toBe(true);
    },
  );

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s only names servers declared in .mcp.json",
    (_dir, skill) => {
      for (const s of [...skill.frontmatter.requires, ...skill.frontmatter.writes]) {
        expect(servers).toContain(s);
      }
    },
  );

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s references the shared protocols it is bound by",
    (_dir, skill) => {
      expect(skill.body).toContain("shared/reading-fullvision-data.md");
      if (skill.frontmatter.writes.length > 0) {
        expect(skill.body).toContain("shared/safety-rails.md");
        expect(skill.body).toContain("shared/sparse-data.md");
      }
    },
  );
});
```

- [ ] **Step 5: Install and run**

```bash
npm install
npx vitest run tests/frontmatter.test.ts
```
Expected: the `finds at least one skill` assertion **FAILS** — no skills exist yet. That is
the correct red state; Wave 3 turns it green. Every other test vacuously passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/lib/skills.ts tests/frontmatter.test.ts
git commit -m "test: skill frontmatter validation harness"
```

---

### Task 8: Live MCP contract test

**Blocked by:** T2, T7

**Files:**
- Reuse: `tests/lib/skills.ts`
- Create: `tests/lib/mcp.ts`
- Create: `tests/contract.test.ts`

This is what replaces co-location with `full_distrib`. If a view is renamed or a tool is
dropped, CI must go red here rather than a customer discovering it mid-run.

- [ ] **Step 1: Write `tests/lib/mcp.ts`** — a minimal streamable-HTTP MCP client

No SDK dependency: two POSTs is the whole protocol surface we need.

```ts
const URL_ = process.env.FULLVISION_MCP_URL ?? "https://data.fullvision.io/mcp";
const KEY = process.env.FULLVISION_API_KEY;

export const hasCredentials = Boolean(KEY);

async function rpc(method: string, params: unknown, sessionId?: string) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${KEY}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}`);
  const text = await res.text();
  // Streamable HTTP may answer as SSE; take the last `data:` line either way.
  const payload = text.includes("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).pop()!.slice(5)
    : text;
  const body = JSON.parse(payload);
  if (body.error) throw new Error(`${method} → ${JSON.stringify(body.error)}`);
  return { result: body.result, sessionId: res.headers.get("mcp-session-id") ?? sessionId };
}

/** Returns the live tool names and view names exposed by the FullVision MCP server. */
export async function fetchSurface(): Promise<{ tools: string[]; views: string[] }> {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "fullvision-plugin-contract-test", version: "0.1.0" },
  });
  const sid = init.sessionId ?? undefined;

  const listed = await rpc("tools/list", {}, sid);
  const tools = (listed.result.tools as { name: string }[]).map((t) => t.name);

  const called = await rpc(
    "tools/call",
    { name: "list_views", arguments: {} },
    sid,
  );
  const raw = called.result.content[0].text as string;
  const parsed = JSON.parse(raw);
  const entries: { name: string }[] = Array.isArray(parsed)
    ? parsed
    : (parsed.views ?? parsed.data ?? []);
  return { tools, views: entries.map((v) => v.name) };
}

/** Every `fullvision:<tool>` and `view:<name>` reference in a skill body. */
export function extractReferences(body: string): { tools: string[]; views: string[] } {
  const tools = [...body.matchAll(/`fullvision:([a-z_]+)`/g)].map((m) => m[1]);
  const views = [...body.matchAll(/`view:([a-z0-9-]+)`/g)].map((m) => m[1]);
  return { tools: [...new Set(tools)], views: [...new Set(views)] };
}
```

Skills therefore must write tool references as `` `fullvision:query_view` `` and view
references as `` `view:ads-leaderboard` ``. This is stated in every skill task below.

- [ ] **Step 2: Write `tests/contract.test.ts`**

```ts
import { loadSkills } from "./lib/skills";
import { fetchSurface, extractReferences, hasCredentials } from "./lib/mcp";

const skills = loadSkills();

// Skipped without a key so contributors can run the suite offline; CI always has one.
describe.skipIf(!hasCredentials)("live FullVision MCP contract", () => {
  let surface: { tools: string[]; views: string[] };

  beforeAll(async () => {
    surface = await fetchSurface();
  }, 30_000);

  it("exposes the tools the plugin depends on", () => {
    for (const t of ["list_views", "query_view", "run_sql_query", "get_guidance", "list_metrics"]) {
      expect(surface.tools).toContain(t);
    }
  });

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s references only tools that exist",
    (_dir, skill) => {
      for (const t of extractReferences(skill.body).tools) {
        expect(surface.tools).toContain(t);
      }
    },
  );

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s references only views that exist",
    (_dir, skill) => {
      for (const v of extractReferences(skill.body).views) {
        expect(surface.views).toContain(v);
      }
    },
  );
});
```

- [ ] **Step 3: Run against the live server**

```bash
FULLVISION_API_KEY=<an Evaboot secret key from full_db/.env> npx vitest run tests/contract.test.ts
```
Expected: the `exposes the tools` test PASSES. The per-skill tests are empty at this point
(no skills yet) and pass vacuously.

If the run cannot reach the server, do not weaken the test — report it and move on; T19's CI
job is where it must be green.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/mcp.ts tests/contract.test.ts
git commit -m "test: live MCP tool + view contract test"
```

---

### Task 9: Pinned-SHA supply-chain check

**Blocked by:** T2, T7

**Files:**
- Reuse: `tests/lib/skills.ts`
- Create: `tests/pinned-sha.test.ts`

- [ ] **Step 1: Write `tests/pinned-sha.test.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
const reviewRecord = readFileSync(join(ROOT, "docs/mcp-servers.md"), "utf8");

// Hosted, first-party/official servers have no artifact to pin — they may float.
const HOSTED = new Set(["fullvision", "meta-ads", "webflow", "brevo"]);

describe("supply chain", () => {
  const entries = Object.entries(cfg.mcpServers) as [string, Record<string, unknown>][];

  it.each(entries.filter(([n]) => !HOSTED.has(n)))(
    "%s pins a full 40-char commit SHA",
    (_name, server) => {
      const refs = JSON.stringify(server);
      expect(refs).not.toMatch(/@latest|@main\b|@master\b|#main\b|#master\b/);
      expect(refs).toMatch(/[@#][0-9a-f]{40}\b/);
    },
  );

  it.each(entries.filter(([n]) => !HOSTED.has(n)))(
    "%s pin is recorded in docs/mcp-servers.md",
    (_name, server) => {
      const sha = JSON.stringify(server).match(/[@#]([0-9a-f]{40})\b/)![1];
      expect(reviewRecord).toContain(sha);
    },
  );

  it("every server in the review record exists in .mcp.json", () => {
    for (const name of Object.keys(cfg.mcpServers)) {
      expect(reviewRecord).toContain(`\`${name}\``);
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/pinned-sha.test.ts
```
Expected: PASS (5 assertions — 2 non-hosted servers × 2, plus the record completeness check).

- [ ] **Step 3: Commit**

```bash
git add tests/pinned-sha.test.ts
git commit -m "test: fail CI on unpinned community MCP servers"
```

---

## Wave 3 — the six skills

Every skill in this wave follows the same contract, stated once here so the individual tasks
stay short. **Apply all of it to each skill:**

- File is `skills/<name>/SKILL.md`, nothing else in the directory.
- Frontmatter keys exactly: `name`, `description`, `cadence`, `requires`, `writes`.
- The body **must** contain the literal string `shared/reading-fullvision-data.md`. Write
  skills must also contain `shared/safety-rails.md` and `shared/sparse-data.md` (T7 asserts this).
- Tool references are written `` `fullvision:query_view` ``; view references `` `view:ads-leaderboard` ``.
  T8 validates these against the live server, so a typo is caught in CI.
- Thresholds are **stated as numbers in the skill**, never left to the run.
- The body ends with a "Refuse when" section listing the exact conditions that stop the skill.

---

### Task 10: `fv-setup`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-setup/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: fv-setup
description: Map which FullVision capabilities are usable right now given the connected MCP servers, and name the single next-best server to connect. Run once after install and whenever a connection changes.
cadence: on-install
requires: [fullvision]
writes: []
---

# fv-setup

Onboarding. Answer one question: **what can this user actually do today, and what is the one
thing they should connect next?**

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. **Probe FullVision.** Call `fullvision:list_views`. If it fails on auth, stop and tell the
   user to set `FULLVISION_API_KEY` (v1 uses a bearer key; 1-click OAuth ships later). Nothing
   else in the plugin works without this — it is the only non-optional server.
2. **Probe each other server** by making its cheapest read call. Record connected / not
   connected / errored. Do not treat "not connected" as a failure; most users start with one.
3. **Run the data-health precondition** — call `fullvision:query_view` on
   `view:health-identity-recon`, `view:health-checkout-coverage`, `view:health-event-coverage`.
   Summarise in one line each. Full detail is `fv-data-health`'s job.
4. **Build the capability matrix** below from the skill catalog, marking each skill
   available / read-only / unavailable per the degradation rule.
5. **Name exactly one next step.** Not a list. Rank by revenue unlocked per hour of setup
   effort, using the auth-burden column in `docs/mcp-servers.md`: Meta and Webflow are 1-click
   OAuth; Brevo is an API key; Google Ads needs a developer token (days); LinkedIn needs a dev
   app plus app review (weeks). Do not recommend LinkedIn to someone who has connected nothing.

## Degradation rule

- Missing a **read** dependency ⇒ the skill is **unavailable**. Say so, name the server.
- Missing a **write** dependency ⇒ the skill is **read-only**: it runs the full analysis and
  emits a change-list the user applies by hand. This is a normal mode, not an error.

## Output

Follow `shared/report-format.md`, with the verdict replaced by the matrix:

```markdown
# fv-setup — <workspace> — <date>

**Usable today:** <n> of 7 skills (<m> read-only)
**Data health:** <✅ | ⚠️ + what it biases>

| Skill | Status | Blocked on |
|---|---|---|
| fv-data-health | ✅ available | — |
| fv-cut-wasted-spend | ⚠️ read-only | google-ads is read-only by design |
| … | | |

## Connect next: <server>
<why this one, what it unlocks, how long it takes>
```

## Things to state plainly, every run

- **Google Ads is read-only.** The official Google server exposes GAQL reads only. Every
  Google change is emitted as a reviewed change-list the user applies in the Ads UI. This is
  permanent for v1, not a setup problem the user can fix.
- **`fv-build-audience` is read-only in v1** — audience activation is not on the FullVision
  MCP surface yet. It sizes, floor-checks and consent-gates the segment, then hands off to the
  FullVision app.
- **Six MCP servers is a lot of tool schema.** Recommend enabling deferred tool loading
  (`ENABLE_TOOL_SEARCH`) — tool-selection accuracy degrades measurably under heavy MCP load.

## Refuse when

- FullVision itself is unreachable or unauthorised. Nothing downstream is meaningful; do not
  produce a partial matrix.
````

- [ ] **Step 2: Run the validators**

```bash
npx vitest run tests/frontmatter.test.ts
claude plugin validate --strict .
```
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add skills/fv-setup/SKILL.md
git commit -m "feat: fv-setup skill"
```

---

### Task 11: `fv-data-health`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-data-health/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: fv-data-health
description: Check identity reconciliation, checkout coverage and event coverage before trusting any FullVision number. Runs standalone and as a precondition inside every other skill.
cadence: precondition
requires: [fullvision]
writes: []
---

# fv-data-health

Bad coverage means every downstream number is a lie. This skill's job is to say so, loudly,
**before** a recommendation gets made on top of it — not to recommend anything itself.

Read `shared/reading-fullvision-data.md` before calling anything.

## Steps

1. `fullvision:query_view` on `view:health-identity-recon` — what share of paying customers
   are linked to a tracked visitor. This caps attribution coverage: unlinked payers have no
   source, so every channel's revenue is understated.
2. `fullvision:query_view` on `view:health-checkout-coverage` — what share of checkouts carry
   a visitor cookie. Low coverage biases *paid* attribution specifically, because paid traffic
   converts faster and is more cookie-dependent.
3. `fullvision:query_view` on `view:health-event-coverage` — are product events arriving. A
   gap here means funnel and engagement views are incomplete for that window.
4. `fullvision:query_view` on `view:ads-measurement-start` — the first Stripe webhook charge.
   Spend before it is unmeasurable. Report the date; every ads skill needs it.
5. Grade and state the bias direction, not just the number.

## Thresholds

| Check | ✅ ok | ⚠️ degraded | 🚩 broken |
|---|---|---|---|
| Identity recon (payers linked) | ≥ 85% | 60–85% | < 60% |
| Checkout coverage (cookie present) | ≥ 80% | 55–80% | < 55% |
| Event coverage (days with events / days in window) | ≥ 95% | 80–95% | < 80% |

These are fixed. Do not adjust them at runtime to make a run pass.

## What each grade means downstream

- **✅** — proceed, report the figure alongside recommendations.
- **⚠️** — proceed, but every ROAS is **biased low** by roughly the coverage gap. State the
  gap in the report and raise the minimum n by 50% for any write decision.
- **🚩** — **stop**. Do not recommend spend changes. The correct output is "fix tracking
  first", naming which check failed and what it breaks. A pause recommendation built on 40%
  identity coverage will pause profitable campaigns.

## As a precondition

Every other skill calls this first and inlines the one-line result in its report header. A
skill that reaches 🚩 aborts its own analysis and returns this skill's output instead.

## Output

`shared/report-format.md`. Verdict is the worst of the three grades.

## Refuse when

- Any health view is unavailable — an unknown coverage figure is not the same as a good one.
````

- [ ] **Step 2: Validate and commit**

```bash
npx vitest run tests/frontmatter.test.ts
git add skills/fv-data-health/SKILL.md
git commit -m "feat: fv-data-health precondition skill"
```

---

### Task 12: `fv-verify-revenue-feedback-loop`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-verify-revenue-feedback-loop/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: fv-verify-revenue-feedback-loop
description: Verify that closed Stripe revenue is actually reaching Google, Meta and LinkedIn as conversion signal — upload failures, expired events, pLTV sanity — and recommend a mid-funnel goal when deal volume is too low for payment-only optimisation.
cadence: weekly
requires: [fullvision]
writes: []
---

# fv-verify-revenue-feedback-loop

This is the moat skill. Ad platforms optimise toward whatever signal they receive. If real
revenue is not reaching them, every other recommendation in this plugin is being undone by
the platform's own bidding, weekly, silently.

Read `shared/reading-fullvision-data.md` and `shared/sparse-data.md` before calling anything.

## Steps

1. **Precondition:** run `fv-data-health`. On 🚩, abort — upload figures are unreadable when
   identity coverage is broken.
2. **Per platform, is signal flowing?** `fullvision:run_sql_query` against the conversion
   upload ledgers, aggregated in SQL (`$USER_ID` required in every WHERE). Get, per platform,
   for the last 30 days: uploads attempted, succeeded, failed, and terminal-expired.
3. **Meta's 7-day wall specifically.** Meta rejects an event whose `event_time` is older than
   7 days, and one stale event fails the whole batch. Count ledger rows in terminal `expired`
   state. Any sustained non-zero count is a broken loop, not noise.
4. **pLTV sanity (Meta).** Meta receives *first-charge × margin × `pltv_multiplier`*, not
   realised LTV. Compare the implied multiplier against realised LTV/first-charge from
   `view:customer-ltv`. If the multiplier over- or under-states realised LTV by more than 40%,
   flag it — Meta is bidding on a wrong number.
5. **Window honesty.** Google judges on 90-day click age, Meta on a 7-day upload wall with
   pLTV, LinkedIn on 365 days. Report each platform's loop separately. Never merge them.
6. **Is payment-only optimisation viable at all?** Count closed deals per month from
   `view:customer-ltv`. Below **20–30 closed deals/month**, platforms cannot learn from
   payment events alone — there is not enough signal density. Recommend a mid-funnel
   conversion goal with an assigned proxy value (practitioner defaults: MQL ≈ €500,
   SQL ≈ €2,500; derive the actual numbers from the workspace's own MQL→close rate × average
   deal value rather than using those figures literally).

## Thresholds

- Upload success rate below **95%** over 30 days ⇒ flag as broken.
- Any Meta `expired` rows in the last 7 days ⇒ flag; the batch-failure mode means a single
  stale event silently drops good ones.
- pLTV multiplier off realised LTV/first-charge by > **40%** ⇒ flag.
- Closed deals/month < **20** ⇒ recommend a mid-funnel goal.

## Output

`shared/report-format.md`. The verdict is per-platform loop health, one line each.

This skill proposes **no platform writes** — its output is a diagnosis plus, where relevant, a
conversion-goal recommendation the user applies in the platform UI and in FullVision's export
settings.

## Refuse when

- `fv-data-health` returns 🚩.
- Fewer than 30 days of upload ledger history exist — the loop has not run long enough to
  judge.
````

- [ ] **Step 2: Validate and commit**

```bash
npx vitest run tests/frontmatter.test.ts
git add skills/fv-verify-revenue-feedback-loop/SKILL.md
git commit -m "feat: fv-verify-revenue-feedback-loop skill"
```

---

### Task 13: `fv-cut-wasted-spend`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-cut-wasted-spend/SKILL.md`

This is the reference implementation of the write path. Every future write skill copies its shape.

- [ ] **Step 1: Write the skill**

````markdown
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
`shared/sparse-data.md` before calling anything. All three are binding.

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
6. **Emit the change-list and STOP.** Do not write in this turn. Ever.
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
````

- [ ] **Step 2: Validate and commit**

```bash
npx vitest run tests/frontmatter.test.ts
git add skills/fv-cut-wasted-spend/SKILL.md
git commit -m "feat: fv-cut-wasted-spend skill"
```

---

### Task 14: `fv-find-leaky-pages`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-find-leaky-pages/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: fv-find-leaky-pages
description: Rank landing pages by revenue lost, not bounce rate, and produce a shortlist with evidence for each. Feeds fv-fix-page.
cadence: weekly
requires: [fullvision]
writes: []
---

# fv-find-leaky-pages

Bounce rate ranks pages by how annoying they are. This ranks them by **how much money they
cost**, which is a different and much shorter list.

Read `shared/reading-fullvision-data.md` and `shared/sparse-data.md` before calling anything.

## Steps

1. **Precondition:** run `fv-data-health`. On 🚩, abort.
2. **Pull traffic and revenue per page.** `fullvision:query_view` on `view:page-performance`
   and `view:page-customers` for the trailing 90 days.
3. **Compute lost revenue per page:**

   ```
   expected_customers = sessions × account_median_conversion_rate
   lost_revenue       = (expected_customers − actual_customers) × median_customer_ltv
   ```

   Use the **median** conversion rate and LTV, not the mean — one enterprise deal will
   otherwise make every page look broken. Apply shrinkage per `shared/sparse-data.md` §3 with
   prior weight k = 10 against the account conversion rate.
4. **Attach friction evidence** for the top candidates only (these are expensive calls):
   `view:engagement-by-page`, `view:scroll-depth-by-page`, `view:rageclicks-by-page`,
   `view:dead-clicks-by-page`, `view:form-performance`, `view:conversion-funnel`.
5. **Separate paid from organic.** A paid landing page that leaks is urgent (money is flowing
   into it right now); an organic page that leaks is a content job. Use `view:ad-landing-pages`
   to split them, and rank paid first.
6. **Hand off.** Name `fv-fix-page` and the specific URL for the top 3. Do not attempt fixes
   here.

## Thresholds — fixed

- Page sessions ≥ **500** over the trailing 90 days
- Lost revenue ≥ **€1,000** over the window
- Shortlist capped at **10 pages** — a longer list does not get acted on
- Confidence stated at **80%**

## Testing recommendations

Per `shared/sparse-data.md` §5: below **10,000 visitors/month** on a page, do **not** propose
an A/B test. Recommend 5 user tests (≈80% of usability issues) or 10–15 session recordings
(70–85%) instead, and say why. Above it, state the required sample size and duration before
proposing a variant.

## Output

`shared/report-format.md`. One line per page: URL, sessions, actual vs expected customers,
lost revenue, the dominant friction signal, and paid/organic.

## Refuse when

- `fv-data-health` returns 🚩.
- Fewer than 3 pages clear the thresholds — report the account is too small for this sweep and
  point at `fv-diagnose-page` (v2) for single-URL work.
````

- [ ] **Step 2: Validate and commit**

```bash
npx vitest run tests/frontmatter.test.ts
git add skills/fv-find-leaky-pages/SKILL.md
git commit -m "feat: fv-find-leaky-pages skill"
```

---

### Task 15: `fv-fix-page`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-fix-page/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: fv-fix-page
description: Apply a landing-page fix — a GitHub pull request against the site repo, or a Webflow CMS/page write. Takes a diagnosis from fv-find-leaky-pages and turns it into a reviewable change.
cadence: on-demand
requires: [fullvision]
writes: [webflow]
---

# fv-fix-page

The only skill in v1 that changes the website. Two write targets, user-selectable.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## Choosing the write target

- **`github`** — the site lives in a repo the user has checked out. Edit files, open a **pull
  request**. Never commit to the default branch. Uses the local `git`/`gh` CLI, no MCP server.
- **`webflow`** — the site is a Webflow project. Use the `webflow` MCP server for CMS and page
  writes.

`fv-setup` detects which is available. If both are, **ask once** and record the answer in
`.fullvision/config.json` (`{"site_write_target": "github"}`) so later runs do not re-ask.
If neither is available, run read-only per `shared/safety-rails.md` §9 and emit the change-list
as a diff or a copy-pasteable content block.

Note: `webflow` is declared in `writes` but not in `requires` — the GitHub path needs no MCP
server at all, so Webflow being absent must not make this skill unavailable.

## Steps

1. **Take the diagnosis as input.** If none was supplied, ask for a URL and pull the evidence
   yourself: `view:page-performance`, `view:engagement-by-page`, `view:scroll-depth-by-page`,
   `view:rageclicks-by-page`, `view:dead-clicks-by-page`, `view:form-performance`.
2. **State the hypothesis before the change.** One sentence, tied to a number:
   "62% of sessions never reach the pricing block (median scroll 41%), so the CTA is below the
   fold on mobile."
3. **Propose the change with its evidence, then STOP.** Two turns, always
   (`shared/safety-rails.md` §1). Include what the change is expected to move and by how much.
4. **On confirmation, write the change log entry first**
   (`.fullvision/changes/YYYY-MM-DD.md`), then apply:
   - **GitHub:** branch `fv-fix/<slug>`, make the edit, open a PR whose body is the hypothesis
     plus the evidence. Never merge it — the PR *is* the review gate.
   - **Webflow:** write via the `webflow` MCP server. Because a Webflow write is live
     immediately, record the exact previous value in the change log **before** writing so the
     revert instruction is concrete.
5. **State how to measure it.** Name the view and the metric to re-check, and when.

## Scope limits — fixed

- One page per run.
- **Copy, layout and form-field changes only.** No pricing changes, no legal or policy copy,
  no navigation restructure, no analytics or tracking code.
- **Irreversible actions are refused outright** (`shared/safety-rails.md` §8): deleting a
  page, deleting a CMS collection, unpublishing a site.
- Never propose an A/B test the page's traffic cannot power — see `shared/sparse-data.md` §5
  and the 10,000 visitors/month floor.

## Output

`shared/report-format.md`, plus the PR URL or the Webflow item id.

## Refuse when

- `fv-data-health` returns 🚩 — you would be fixing a page based on incomplete behaviour data.
- The page has fewer than **500 sessions** in the trailing 90 days. There is no evidence to
  act on; say so.
- The requested change is outside the scope limits above.
````

- [ ] **Step 2: Validate and commit**

```bash
npx vitest run tests/frontmatter.test.ts
git add skills/fv-fix-page/SKILL.md
git commit -m "feat: fv-fix-page skill (GitHub PR + Webflow write paths)"
```

---

### Task 16: `fv-build-audience`

**Blocked by:** T7

**Files:**
- Create: `skills/fv-build-audience/SKILL.md`

- [ ] **Step 1: Write the skill**

Note the deviation from the spec, decided during planning: audience activation is **not** on
the FullVision MCP tool surface (those tools live in the Iris agent surface,
`full_distrib/src/agent/tools/audiences.ts`). v1 is therefore read-only mode per
`shared/safety-rails.md` §9 — full analysis, change-list artifact, hand off to the app.

````markdown
---
name: fv-build-audience
description: Turn a described segment into a sized, floor-checked, consent-gated audience with a chosen destination. Emits an activation change-list; activation itself happens in the FullVision app.
cadence: on-demand
requires: [fullvision]
writes: []
---

# fv-build-audience

Describe a segment, get back a real one: sized, checked against the destination platform's
minimum, and gated on consent. The gate is the point of this skill — the segment SQL is the
easy part.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## Preflight — non-negotiable, in this order

```
1. size the segment
2. check the platform floor  → route to email if it cannot clear it
3. check the consent flag    → no consent ⇒ REFUSE ad upload, offer email
4. pick the destination
```

Never reorder these. Sizing before consent means proposing an upload that must then be
retracted.

### 1. Size

Compile the description to a ClickHouse SELECT. Use `fullvision:compile_custom_view` to check
it compiles, then `fullvision:run_sql_query` to count (`$USER_ID` required in every WHERE).
Report the raw count **and** the emailable count — they differ.

### 2. Floor

| Destination | Floor | Raw list needed at B2B ~20% match |
|---|---|---|
| Google Customer Match | 100 matched (lowered from 1,000 in 2026) | ~500 |
| Meta Custom Audiences | 100 matched | 300–500 |
| LinkedIn Matched Audiences | 300 matched (LinkedIn recommends 50k) | **1,500+** |

The ~20% B2B match rate is structural — people buy with work emails and use personal ones on
ad platforms. Do not model a higher rate optimistically. If the raw list cannot clear the
floor, **route to email** and say why; do not upload a list that will sit unmatched.

### 3. Consent — a hard gate, not a warning

A German DPA has ruled that uploading customer lists to ad platforms without explicit consent
is illegal **even when hashed**, and rejected legitimate interest as a basis. Google requires
`ad_user_data` and `ad_personalization` both GRANTED per EEA user, with **no B2B or
work-email carve-out**.

Therefore:

- **No ad-platform upload without a verifiable consent flag on the contact record.** Not an
  assumption, not an inference from "they're a customer" — a flag.
- **Email/ESP activation is the default for EU B2B**, not the fallback.
- If the consent flag does not exist in the data at all, that is a refusal, not a caveat.
  Say the field is missing and stop.

### 4. Destination

Google Customer Match / Meta Custom Audience / LinkedIn Matched Audience / Brevo. Pick based
on floor clearance and consent state, and state which you picked and why.

## Activation — read-only in v1

Audience create/sync is not exposed on the FullVision MCP surface. Per
`shared/safety-rails.md` §9 this is read-only mode, not an error:

1. Emit the compiled SQL, the size, the emailable count, the floor verdict, the consent
   verdict and the chosen destination as a change-list artifact.
2. Point the user at the FullVision app to create the audience and enable the automation.
   Delivery then runs on FullVision's existing audience-delivery cron (Customer Match / Meta
   Custom Audience) — **not** from this plugin.
3. Do not attempt to upload contacts from here under any circumstance, even if a platform MCP
   with write access is connected. The consent gate and the delivery ledger both live
   server-side, and bypassing them is exactly the failure this skill exists to prevent.

## Refuse when

- The consent flag is absent from the data, or GRANTED for fewer contacts than the floor.
- The segment cannot clear any destination's floor, including email.
- The description implies a special-category segment (health, ethnicity, political, sexual
  orientation, religion, trade-union membership) — refuse outright, in any jurisdiction.
- `fv-data-health` returns 🚩 — segment membership would be built on broken identity data.
````

- [ ] **Step 2: Validate and commit**

```bash
npx vitest run tests/frontmatter.test.ts
git add skills/fv-build-audience/SKILL.md
git commit -m "feat: fv-build-audience skill (read-only activation in v1)"
```

---

### Task 17: `fv-analyst` subagent

**Blocked by:** T7

**Files:**
- Create: `agents/fv-analyst.md`

Deep-dive analysis burns context — many `query_view` calls whose raw rows the main thread does
not need. An isolated subagent keeps the transcript clean and returns only findings.

- [ ] **Step 1: Write the agent**

```markdown
---
name: fv-analyst
description: Isolated FullVision data analyst. Use for multi-view investigations where only the conclusion matters — segment sizing, cross-view correlation, cohort digging. Returns findings and the numbers behind them, never raw rows.
tools: mcp__fullvision__query_view, mcp__fullvision__run_sql_query, mcp__fullvision__list_views, mcp__fullvision__list_metrics, mcp__fullvision__get_guidance, mcp__fullvision__get_table_schema, mcp__fullvision__list_tables
---

You are a FullVision data analyst. You answer one question with evidence and stop.

Read `shared/reading-fullvision-data.md` before your first call. It is the difference between
a right answer and a plausible one.

Rules:

1. `list_views` before naming a view. `get_guidance` before interpreting any revenue,
   attribution, MRR or churn result. `list_metrics` for formula definitions.
2. Aggregate in SQL. Never fetch rows to count, sum or average them yourself. If a result set
   exceeds a few dozen rows, your query is wrong.
3. Every number you report carries its n and its window. A ROAS without a denominator count
   is not evidence.
4. Amounts are cents and currency-mixed — `GROUP BY currency` or convert.
5. Never compare raw ROAS across ad platforms; their attribution windows differ (Google 90d,
   Meta 7d upload wall with pLTV, LinkedIn 365d).
6. Spend before `ads-measurement-start` is unmeasurable, not unprofitable.
7. If the data does not support an answer, say so and stop. Do not produce a hedged one.

Return: the finding, the numbers behind it, the window, the n, and the confidence level. No
raw rows. No recommendations — recommending is a skill's job, not yours.
```

- [ ] **Step 2: Validate and commit**

```bash
claude plugin validate --strict .
git add agents/fv-analyst.md
git commit -m "feat: fv-analyst isolated analysis subagent"
```

---

### Task 18: Degradation + safety-rail tests

**Blocked by:** T10, T11, T12, T13, T14, T15, T16

**Files:**
- Reuse: `tests/lib/skills.ts`
- Create: `tests/degradation.test.ts`
- Create: `tests/safety-rails.test.ts`

These assert the properties the skills *claim*, statically. A behavioural test would need a
live model run; these catch the failure that actually happens — a skill edited to drop its
refusal clause or its threshold.

- [ ] **Step 1: Write `tests/degradation.test.ts`**

```ts
import { loadSkills } from "./lib/skills";

const skills = loadSkills();
const writeSkills = skills.filter((s) => s.frontmatter.writes.length > 0);

describe("degradation contract", () => {
  it("ships the seven v1 skills", () => {
    expect(skills.map((s) => s.dir).sort()).toEqual([
      "fv-build-audience",
      "fv-cut-wasted-spend",
      "fv-data-health",
      "fv-find-leaky-pages",
      "fv-fix-page",
      "fv-setup",
      "fv-verify-revenue-feedback-loop",
    ]);
  });

  it("every skill requires fullvision — it is the only non-optional server", () => {
    for (const s of skills) expect(s.frontmatter.requires).toContain("fullvision");
  });

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s documents read-only mode rather than treating a missing write server as an error",
    (_dir, skill) => {
      expect(skill.body.toLowerCase()).toContain("read-only");
      expect(skill.body).toMatch(/change-list/i);
    },
  );

  it("fv-setup explains the degradation rule to the user", () => {
    const setup = skills.find((s) => s.dir === "fv-setup")!;
    expect(setup.body).toMatch(/unavailable/i);
    expect(setup.body).toMatch(/read-only/i);
  });
});
```

- [ ] **Step 2: Write `tests/safety-rails.test.ts`**

```ts
import { loadSkills } from "./lib/skills";

const skills = loadSkills();
const writeSkills = skills.filter((s) => s.frontmatter.writes.length > 0);

describe("safety rails", () => {
  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s declares when it refuses",
    (_dir, skill) => {
      expect(skill.body).toMatch(/## Refuse when/);
      // At least one concrete refusal condition, not an empty heading.
      const section = skill.body.split("## Refuse when")[1] ?? "";
      expect(section.split("\n").filter((l) => l.trim().startsWith("-")).length)
        .toBeGreaterThan(0);
    },
  );

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s runs fv-data-health as a precondition",
    (_dir, skill) => {
      if (skill.dir === "fv-data-health" || skill.dir === "fv-setup") return;
      expect(skill.body).toContain("fv-data-health");
    },
  );

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s declares numeric thresholds rather than deciding at runtime",
    (_dir, skill) => {
      expect(skill.body).toMatch(/## Thresholds|## Scope limits/);
      // Thresholds must be actual numbers.
      expect(skill.body).toMatch(/\d/);
    },
  );

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s commits to propose-then-confirm and refuses irreversible actions",
    (_dir, skill) => {
      expect(skill.body).toMatch(/two turns|STOP\. Do not write|then STOP|Irreversible/i);
    },
  );

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s bounds its blast radius",
    (_dir, skill) => {
      expect(skill.body).toMatch(/blast radius|Max \*\*\d|Scope limits/i);
    },
  );
});
```

- [ ] **Step 3: Run the full suite**

```bash
npx vitest run
```
Expected: all suites PASS (contract suite skips without `FULLVISION_API_KEY`). Fix any skill
that fails rather than loosening an assertion — a failure here means the skill genuinely
dropped a rail.

- [ ] **Step 4: Commit**

```bash
git add tests/degradation.test.ts tests/safety-rails.test.ts
git commit -m "test: degradation and safety-rail contracts"
```

---

### Task 19: CI + README

**Blocked by:** T18

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (currently the scaffold placeholder — replace entirely)

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

The contract job needs a real key. Add `FULLVISION_API_KEY` as a repo secret (an Evaboot
**read-scoped** key — never the owner key) before merging.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Plugin manifest validation
        run: npx --yes @anthropic-ai/claude-code plugin validate --strict .
      - name: Frontmatter, degradation, safety rails, pinned SHAs
        run: npx vitest run --exclude tests/contract.test.ts

  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Live FullVision MCP contract
        env:
          FULLVISION_API_KEY: ${{ secrets.FULLVISION_API_KEY }}
        run: npx vitest run tests/contract.test.ts
```

- [ ] **Step 2: Replace `README.md`**

````markdown
# FullVision for Claude Code

Revenue-attributed marketing operations in your terminal. FullVision joins ad spend, web
behaviour, SEO and Stripe revenue into one attributed dataset; this plugin turns that dataset
into changes you can review and apply.

Meta's own MCP can tell you your CPA. Only FullVision can tell you LTV-adjusted ROAS by
campaign, attributed to real Stripe revenue, across platforms, on comparable attribution
windows. Every skill here exists to use that.

## Install

```
/plugin marketplace add FullVision-Team/fullvision-plugin
/plugin install fullvision@fullvision-plugin
```

Then, in a project directory:

```
/fullvision:fv-setup
```

That is the only instruction. `fv-setup` tells you what works right now with what you have
connected, and names the one thing worth connecting next.

## Setup

Set your FullVision API key before the first run:

```bash
export FULLVISION_API_KEY=sk_…
```

(1-click OAuth is coming; v1 uses a bearer key.)

Optional, per server you want to use: `GOOGLE_ADS_DEVELOPER_TOKEN`, `LINKEDIN_ACCESS_TOKEN`,
`BREVO_API_KEY`. Meta and Webflow authenticate in the browser on first use. You do not need
all of them — every skill degrades gracefully.

**Recommended:** enable deferred tool loading (`ENABLE_TOOL_SEARCH`). This plugin bundles six
MCP servers, and tool-selection accuracy degrades measurably when a lot of tool schema is
loaded at once. Deferred loading fetches only the tools a skill actually names.

## Skills

| Skill | Cadence | Job |
|---|---|---|
| `fv-setup` | on install | What's usable right now, and what to connect next |
| `fv-data-health` | precondition | Is the data trustworthy? Runs inside every other skill |
| `fv-verify-revenue-feedback-loop` | weekly | Is closed revenue actually reaching Google/Meta/LinkedIn? |
| `fv-cut-wasted-spend` | weekly | Terms that spend money and produce zero payers → negative keywords |
| `fv-find-leaky-pages` | weekly | Pages ranked by revenue lost, not bounce rate |
| `fv-fix-page` | on demand | Applies the fix — GitHub PR or Webflow write |
| `fv-build-audience` | on demand | Sized, floor-checked, consent-gated segments |

## How it behaves

**It never writes in the turn it analyses.** Every write skill proposes a change-list with the
evidence inline — spend, payers, revenue, n — then stops and waits for you. You can overrule
one line without re-running anything.

**It refuses on thin data.** B2B conversion volume is low and an LLM will happily rank three
data points. Every skill declares a minimum n and says so when it is not met, rather than
producing a confident answer from noise.

**It is honest about attribution windows.** Google judges on 90-day click age, Meta on a
7-day upload wall with predicted LTV, LinkedIn on 365 days. Skills never compare raw ROAS
across platforms, and spend from before FullVision started measuring is reported as
unmeasurable, not unprofitable.

**Consent is a hard gate.** No ad-platform audience upload without a verifiable consent flag
per contact — hashing is not a legal basis. Email activation is the default for EU B2B.

## Known limitations

- **Google Ads is read-only.** The official Google server exposes GAQL reads only, and the
  write-capable alternatives are community servers that can spend your money. Google changes
  are emitted as a reviewed list you apply in the Ads UI.
- **`fv-build-audience` hands off to the FullVision app** for activation.
- **Irreversible actions are out of scope** — no deleting campaigns, audiences or pages.

## Contributing

`npm test` runs everything. The contract test hits the live FullVision MCP and needs
`FULLVISION_API_KEY`; it skips without one.

Bumping a pinned MCP server SHA is a **security review**, not a chore — see
[`docs/mcp-servers.md`](docs/mcp-servers.md).

## License

MIT
````

- [ ] **Step 3: Full green run**

```bash
npm test
claude plugin validate --strict .
```
Expected: all suites PASS, validate exits 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: validate manifests, contracts and supply chain; rewrite README"
```

- [ ] **Step 5: Add the CI secret**

```bash
gh secret set FULLVISION_API_KEY --repo FullVision-Team/fullvision-plugin
```
Paste an Evaboot **read-scoped** key when prompted. Never the owner key. If no read-scoped
key exists, note it in the PR body rather than using a privileged one — the `contract` CI job
will fail until it is set, and that is the correct state.

---

## Done means

- `npm test` green, `claude plugin validate --strict .` exit 0, CI green on the PR.
- `/plugin marketplace add FullVision-Team/fullvision-plugin` followed by
  `/plugin install fullvision@fullvision-plugin` installs cleanly in a fresh session, and
  `/fullvision:fv-setup` runs and produces a connection matrix.
- The contract test fails loudly if a view or tool named by any skill is renamed in
  `full_distrib`.
