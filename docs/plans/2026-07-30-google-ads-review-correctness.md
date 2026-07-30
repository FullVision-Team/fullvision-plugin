# google-ads-review Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four defects in `google-ads-review` that make it judge Google Ads on the wrong window, mine the wrong table for negative keywords, refuse to run during an account relaunch, and abort on a health metric it does not depend on.

**Architecture:** All changes are to skill and shared-reference markdown. The plugin's test suite already asserts against skill *bodies* via `loadSkills()`, so every change here is genuinely test-first: write the assertion about what the skill must say, watch it fail, edit the markdown, watch it pass. No gateway or TypeScript runtime code changes — the single `.ts` edit is a one-line widening of a test-lib regex.

**Tech Stack:** Markdown skills, TypeScript + vitest (`globals: true`), `tests/lib/skills.ts` (`loadSkills`, `splitFrontmatter`), `tests/lib/mcp.ts` (`extractReferences`, live contract suite).

**Dependency Graph:**
- Wave 1: Task 1, Task 2, Task 3, Task 4 (parallel — four separate files)
- Wave 2: Task 5 (first `SKILL.md` edit; needs Task 3's shared rule and Task 4's regex)
- Wave 3: Task 6 (`SKILL.md`; needs Task 1 + Task 2 shared references and Task 5's header)
- Wave 4: Task 7 (`SKILL.md`; needs Task 6's maturity concept)

Tasks 5, 6 and 7 all modify `skills/google-ads-review/SKILL.md` and `tests/google-ads-review.test.ts`, so `executing-plans` serialises them regardless — the `Blocked by` chain states the real ordering dependency rather than relying on that.

---

## Context an engineer needs before starting

**What this skill is.** One weekly Google Ads session: check that Stripe revenue is reaching Google as a conversion signal, then find search terms spending money on zero paying customers, and stage the fixes. It never writes in the turn it analyses (`shared/safety-rails.md` §1).

**The four defects, in one line each:**

1. It judges on a **trailing 90-day window**. That is Google's *upload* limit, not FullVision's attribution limit — FullVision attribution is unbounded. Using it understates every campaign and can kill a keyword whose payers convert on day 120.
2. Step 4 pulls `view:keyword-performance` for negative-keyword candidates. That view is **Google Search Console** — organic queries. The skill mines organic search and proposes the results as *paid* negatives.
3. Two of its refusals (`window < 90 days`, `< 5 qualifying terms`) fire for the first months of any account relaunch, so the skill is useless exactly when an account most needs watching.
4. Step 1 aborts on `check_data_health = red`. All three health checks are **workspace-global** and none is ads-scoped.

**Existing test contracts you must not break** (`tests/safety-rails.test.ts`, `tests/degradation.test.ts`):
- The body must still contain `check_data_health`.
- `## Refuse when` must still exist with at least one `-` bullet.
- `## Thresholds` (or `## Scope limits`) must still exist and contain digits.
- Blast radius must still match `/blast radius|Max \*\*\d|Scope limits/i`.
- Body must still contain `read-only` and match `/change-list/i`.

Run the suite with `npm test` (vitest, `globals: true` — do not import `describe`/`it`).

**Keep this repo generic.** These skills ship to other workspaces. No customer names, channel names, hostnames or account ids in any file this plan touches.

---

### Task 1: Split Google's click-age limit from FullVision's attribution window

**Blocked by:** none

**Files:**
- Modify: `shared/platforms/google.md:6-12`
- Test: `tests/platform-google.test.ts`

The shared platform reference gets its own test file. `tests/google-ads-review.test.ts` is created later by Task 5 and holds skill-body assertions only — keeping the two apart means Tasks 5-7 append to a file about one subject.

- [ ] **Step 1: Write the test**

Create `tests/platform-google.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const googleRef = readFileSync(join(ROOT, "shared/platforms/google.md"), "utf8");

describe("google platform reference: attribution window", () => {
  it("does not tell skills to judge on a trailing 90-day window", () => {
    expect(googleRef).not.toMatch(/judge google on a trailing 90-day window/i);
  });

  it("keeps the 90-day click age, scoped to what Google can receive", () => {
    expect(googleRef).toMatch(/90-day click age/i);
    expect(googleRef).toMatch(/upload|receive|cannot be uploaded/i);
  });

  it("states that FullVision's own attribution is unbounded", () => {
    expect(googleRef).toMatch(/unbounded|no limit|not bounded/i);
    expect(googleRef).toMatch(/first-touch|person-stitched/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/platform-google.test.ts`
Expected: FAIL — "does not tell skills to judge on a trailing 90-day window" and the unbounded assertion both fail against the current file.

- [ ] **Step 3: Rewrite the section**

`shared/platforms/google.md:6-12` — replace the whole `## Attribution window` section with two clearly separated concepts. Google's 90-day click age stays, but is described as a constraint on what Google can *count and be sent*, not as a window for judging. Add a second subsection stating FullVision attribution is person-stitched first-touch with no time limit, and that this is what every judgement uses. Include the consequence explicitly: a payer whose first ad click is older than 90 days is fully attributed in FullVision but can never be uploaded to Google, so Google's bidding is structurally blind to the longest-cycle buyers — which is a finding worth reporting, not a window to judge by.

Delete the sentence "Judge Google on a trailing 90-day window. A shorter window systematically understates it." entirely.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/platform-google.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — no other suite reads this file's window wording.

- [ ] **Step 6: Commit**

```bash
git add shared/platforms/google.md tests/platform-google.test.ts
git commit -m "fix(google): separate Google's click-age upload limit from FullVision's unbounded attribution"
```

---

### Task 2: State that FullVision attribution is unbounded in the reading protocol

**Blocked by:** none

**Files:**
- Modify: `shared/reading-fullvision-data.md:49-58`
- Test: `tests/reading-protocol.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/reading-protocol.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const protocol = readFileSync(
  join(ROOT, "shared/reading-fullvision-data.md"), "utf8");

describe("reading protocol: whose window is whose", () => {
  it("keeps the per-platform table of platform-reported windows", () => {
    expect(protocol).toMatch(/\| Google \| 90-day click age/);
  });

  it("says the table describes platform-reported windows, not our own", () => {
    expect(protocol).toMatch(/platform-reported|as the platform reports/i);
  });

  it("states FullVision's own attribution is unbounded and is what decisions use", () => {
    expect(protocol).toMatch(/unbounded/i);
    expect(protocol).toMatch(/decisions? use|judge on|what we judge/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/reading-protocol.test.ts`
Expected: FAIL — the last two assertions fail; the table exists but is unqualified.

- [ ] **Step 3: Qualify the table**

`shared/reading-fullvision-data.md:49-58` — immediately above the `| Platform | Window | What it means |` table, state that the table lists what **each platform reports and can receive**, and that these are the numbers to normalise when comparing platforms. Immediately below the table, add a short paragraph: FullVision's own attribution is person-stitched first-touch with **no time limit**, and that is what every ROAS, payer count and waste judgement in this plugin uses. A platform's window never becomes our lookback.

Leave the existing "Never rank campaigns across platforms on raw ROAS" sentence in place — it is still correct and now reads against the right backdrop.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/reading-protocol.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/reading-fullvision-data.md tests/reading-protocol.test.ts
git commit -m "docs(reading): distinguish platform-reported windows from FullVision's unbounded attribution"
```

---

### Task 3: Add the coverage-scoping rule to the safety rails

**Blocked by:** none

**Files:**
- Modify: `shared/safety-rails.md` (append a new numbered section after §9)
- Test: `tests/safety-rails.test.ts` (add one `describe` block; do not touch the existing ones)

- [ ] **Step 1: Write the test**

Append to `tests/safety-rails.test.ts`, after the existing `describe("safety rails", ...)` block:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

describe("coverage scoping rule", () => {
  const rails = readFileSync(join(ROOT, "shared/safety-rails.md"), "utf8");

  it("tells skills to gate on the coverage their own evidence rests on", () => {
    expect(rails).toMatch(/scope.{0,40}coverage|coverage.{0,40}your own evidence/i);
  });

  it("says a workspace-wide verdict is context, not an automatic stop", () => {
    expect(rails).toMatch(/not an automatic stop|context, never a stop|never a stop/i);
  });
});
```

Note the existing file already imports `loadSkills, isAnalysisSkill` from `./lib/skills` — add `ROOT` to a separate import line as shown rather than editing the existing import, so the diff stays minimal.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/safety-rails.test.ts`
Expected: FAIL on both new assertions; the five existing `safety rails` tests still PASS.

- [ ] **Step 3: Add the rule**

`shared/safety-rails.md` — append a new section `## 10. Gate on the coverage your evidence rests on`. Content: `check_data_health` returns three **workspace-global** figures. A skill must report the global verdict for context, but must gate its own destructive actions on the coverage that its *own* evidence actually depends on. A skill whose primary evidence is client-side pageviews is not blocked by Stripe identity coverage; a skill whose evidence is payer counts is. State the consequence in the direction that matters: missing identity can only *lose* conversions, never invent them, so low coverage biases toward false negatives — which makes it a reason to withhold a destructive proposal, not a reason to stop reporting.

Keep it to a short paragraph plus one line naming the failure it prevents: a skill that aborts on a global red goes silent every week over data it never reads.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/safety-rails.test.ts`
Expected: PASS — the two new tests plus every existing one.

- [ ] **Step 5: Commit**

```bash
git add shared/safety-rails.md tests/safety-rails.test.ts
git commit -m "feat(rails): add rule 10 — gate on the coverage your own evidence rests on"
```

---

### Task 4: Let the contract suite check hyphenated tool names

**Blocked by:** none

**Files:**
- Modify: `tests/lib/mcp.ts:54-58`
- Test: `tests/extract-references.test.ts`

**Why this is in scope:** Task 5 makes the skill depend on the `ad-report` tool. `extractReferences` currently matches tool names with `/`fullvision:([a-z_]+)`/`, which has no hyphen, so `` `fullvision:ad-report` `` is silently skipped by the live contract suite. Without this one-character-class fix, the new dependency is never verified against the real gateway and a rename upstream goes undetected.

- [ ] **Step 1: Write the test**

Create `tests/extract-references.test.ts`:

```ts
import { extractReferences } from "./lib/mcp";

describe("extractReferences", () => {
  it("extracts hyphenated tool names", () => {
    expect(extractReferences("call `fullvision:ad-report` now").tools)
      .toContain("ad-report");
  });

  it("still extracts underscored tool names", () => {
    expect(extractReferences("`fullvision:run_sql_query`").tools)
      .toContain("run_sql_query");
  });

  it("still extracts view names", () => {
    expect(extractReferences("`view:ads-leaderboard`").views)
      .toContain("ads-leaderboard");
  });

  it("does not treat a bare word after the colon as a tool", () => {
    expect(extractReferences("fullvision:ad-report").tools).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/extract-references.test.ts`
Expected: FAIL on "extracts hyphenated tool names" only — the other three pass.

- [ ] **Step 3: Widen the character class**

`tests/lib/mcp.ts:55` — change the tools regex character class from `[a-z_]+` to `[a-z0-9_-]+` so hyphenated and digit-bearing tool names are captured. Leave the views regex unchanged; it already allows hyphens.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/extract-references.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. The contract suite skips without `FULLVISION_API_KEY`; if you have one set, it now additionally validates any hyphenated tool the skills reference — a genuine new check, so a failure here is a real finding, not a regression.

- [ ] **Step 6: Commit**

```bash
git add tests/lib/mcp.ts tests/extract-references.test.ts
git commit -m "test(contract): match hyphenated tool names so ad-report is verified"
```

---

### Task 5: Replace the global health abort with an ads-scoped coverage gate, and declare read-only degradation

**Blocked by:** Task 3, Task 4

**Files:**
- Modify: `skills/google-ads-review/SKILL.md:30-33` (step 1), `:122-128` (read-only degradation), `:100-112` (thresholds block)
- Test: `tests/google-ads-review.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/google-ads-review.test.ts`:

```ts
import { loadSkills } from "./lib/skills";

const skill = loadSkills().find((s) => s.dir === "google-ads-review")!;

describe("google-ads-review: health gating", () => {
  it("does not abort the whole run on a workspace-global red verdict", () => {
    expect(skill.body).not.toMatch(/on `?red`?,? abort/i);
  });

  it("still reports the global verdict for context", () => {
    expect(skill.body).toContain("check_data_health");
  });

  it("reads ads-scoped coverage from the ad-report payload, not the view", () => {
    expect(skill.body).toContain("obs_gclid_clicks");
    expect(skill.body).toContain("`fullvision:ad-report`");
    expect(skill.body).toMatch(/not a declared metric|payload, not the view/i);
  });

  it("declares the gclid coverage floor as a fixed number", () => {
    expect(skill.body).toMatch(/70\s*%/);
  });

  it("withholds only the destructive path below the floor", () => {
    expect(skill.body).toMatch(/withh(e|o)ld/i);
  });

  it("treats unknown coverage as failing, not passing", () => {
    expect(skill.body).toMatch(/unknown coverage is not good coverage|absent.{0,60}withheld/i);
  });
});

describe("google-ads-review: unavailable ads surface", () => {
  it("checks capabilities before assuming the google tools exist", () => {
    expect(skill.body).toContain("get_capabilities");
  });

  it("declares a read-only run rather than dying on a tool error", () => {
    expect(skill.body).toMatch(/read-only run/i);
    expect(skill.body).toMatch(/ready.{0,10}false/i);
  });

  it("names skipped GAQL diagnostics instead of silently shortening the list", () => {
    expect(skill.body).toMatch(/skipped, not faked|names each skipped/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/google-ads-review.test.ts`
Expected: FAIL — every assertion except "still reports the global verdict" and "checks capabilities" fails.

- [ ] **Step 3: Rewrite step 1 of the skill**

`skills/google-ads-review/SKILL.md:30-33` — replace the precondition step. It must:
- Call `fullvision:check_data_health` and put the verdict in the report header **as context**, never as a stop. Cite `shared/safety-rails.md` §10 (added in Task 3).
- Compute an **ads-scoped coverage figure**, `obs_gclid_clicks / g_clicks`, from the `landing_pages` array of the `` `fullvision:ad-report` `` response. State explicitly that `obs_gclid_clicks` is *not* a declared metric of the `ad-landing-pages` view, so the view must not be queried for it.
- Declare the floor as **70%**, fixed, changeable only by editing this file.
- Below the floor, or when the field is absent from the payload, withhold **performance** negative-keyword proposals and say so with the figure. Unknown coverage is not good coverage. Diagnostics and reporting run in full either way.

- [ ] **Step 4: Add the read-only degradation section**

`skills/google-ads-review/SKILL.md:122-128` — expand the existing `## Read-only degradation` section (keep the heading; `tests/degradation.test.ts` needs the body to contain `read-only` and `change-list`). Add: the run calls `` `fullvision:get_capabilities` `` first and branches on the `google_ads` connection's `ready` flag.

With `ready: true`, the full path runs and numbered change-list lines are staged proposal ids.

With `ready: false`, it is a **read-only run**: everything reachable from FullVision's own views still runs, and the change-list is emitted as a copy-pasteable artifact with the exact Ads UI path per change and no applyable ids. State that `fullvision:google_ads_search` is part of the same surface, so every GAQL-sourced diagnostic — search terms, conversion-goal sanity, final-URL/AI-Max drift — is **skipped and named**, never silently omitted. Per `shared/safety-rails.md` §9 this is a normal outcome, not a failure.

- [ ] **Step 5: Add the coverage floor to the declared thresholds**

`skills/google-ads-review/SKILL.md:100-112` — in the `## Thresholds — fixed, never runtime-adjusted` block, add a short subsection listing the gclid coverage floor at **70%**. Leave the feedback-loop thresholds unchanged.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/google-ads-review.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — in particular `safety-rails.test.ts`'s "calls check_data_health as a precondition" and `degradation.test.ts`'s read-only assertions must still pass.

- [ ] **Step 8: Commit**

```bash
git add skills/google-ads-review/SKILL.md tests/google-ads-review.test.ts
git commit -m "fix(google-ads-review): scope the health gate to ads coverage and declare read-only degradation"
```

---

### Task 6: Fix the judging window and the negative-keyword data source

**Blocked by:** Task 1, Task 2, Task 5

**Files:**
- Modify: `skills/google-ads-review/SKILL.md:60-69` (steps 3-4), `:100-112` (thresholds)
- Test: `tests/google-ads-review.test.ts`

- [ ] **Step 1: Write the test**

Append to `tests/google-ads-review.test.ts`:

```ts
describe("google-ads-review: judging window", () => {
  it("does not judge on a trailing 90-day window", () => {
    expect(skill.body).not.toMatch(/trailing\s+\*{0,2}90\*{0,2}\s*days?/i);
  });

  it("judges from the measurement start to a maturity line", () => {
    expect(skill.body).toContain("ads-measurement-start");
    expect(skill.body).toMatch(/maturity|maturation/i);
  });

  it("derives the maturity line from observed click-to-charge lag", () => {
    expect(skill.body).toMatch(/p80/i);
    expect(skill.body).toContain("run_sql_query");
  });

  it("declares the fallback constant and when it applies", () => {
    expect(skill.body).toMatch(/60\s*days/i);
    expect(skill.body).toMatch(/\b8\b/);
  });

  it("carries a debt marker to promote the lag into a gateway view", () => {
    expect(skill.body).toMatch(/debt:/);
  });

  it("reports payers too old to upload as a finding", () => {
    expect(skill.body).toMatch(/never be uploaded|cannot be uploaded/i);
  });
});

describe("google-ads-review: negative-keyword sources", () => {
  it("does not mine the organic GSC keyword view", () => {
    expect(skill.body).not.toContain("view:keyword-performance");
  });

  it("takes search terms from GAQL search_term_view only", () => {
    expect(skill.body).toContain("search_term_view");
    expect(skill.body).toContain("`fullvision:google_ads_search`");
  });

  it("uses the paid keyword grain for keyword-level context", () => {
    expect(skill.body).toMatch(/ads-leaderboard|level=keyword/);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/google-ads-review.test.ts`
Expected: FAIL on the window and source assertions; Task 5's tests in the same file still pass.

- [ ] **Step 3: Rewrite step 3 — the measurable window**

`skills/google-ads-review/SKILL.md:60-62` — keep `` `view:ads-measurement-start` `` as the left edge and the "unmeasurable, not wasteful" wording. Add the right edge: a **maturity line**, because a click needs time to become a charge before "0 payers" is admissible evidence.

Derive it: query the observed lag between first ad click and first Stripe charge across ad-sourced payers with `` `fullvision:run_sql_query` ``, and take the **p80** as the maturity line. Declare the SQL verbatim in this file so it is auditable and fixed rather than re-invented per run (`shared/safety-rails.md` §3). The query must carry the literal `$USER_ID` placeholder in its `WHERE` clause and aggregate in SQL.

Declare the fallback: while fewer than **8** ad-sourced payers exist to fit a percentile, use **60 days** and say in the report that it is a fallback and why. Add a marker line in the step:

```
debt: skill-side p80 lag query, ceiling = plugin ships to a second workspace,
upgrade trigger = promote to a gateway view so the fact lives in a tool not markdown
```

- [ ] **Step 4: Rewrite step 4 — the data sources**

`skills/google-ads-review/SKILL.md:64-69` — replace the `view:keyword-performance` pull entirely. That view is Google Search Console; using it here mines organic queries and proposes them as paid negatives.

Correct sources, stated plainly so the mistake cannot recur:
- **Search terms** — what people actually typed — come from GAQL `search_term_view` via `` `fullvision:google_ads_search` ``, and nowhere else. No FullVision view carries them. Negatives are built from search terms, not keywords.
- **Paid keyword grain** for context — `` `view:ads-leaderboard` `` at `?level=keyword`, using the `clipped_*` columns.
- Keep the existing GAQL rules (one resource per query, `segments.date` in `WHERE`, metrics in micros).

Add one sentence naming the trap: `view:keyword-performance` is the **organic-search** counterpart and must never be used for paid negatives.

- [ ] **Step 5: Update the declared thresholds**

`skills/google-ads-review/SKILL.md:100-112` — in the negative-keyword threshold list, delete the line `Window = trailing **90 days**, matching Google's click-age window` and replace it with the measurement-start-to-maturity-line window. Leave the €150 spend, 60 clicks, 0 payers and 85% confidence thresholds unchanged.

- [ ] **Step 6: Put both derived figures in the report header**

`skills/google-ads-review/SKILL.md` — in the `## Output` section, state that the header carries two lines beyond the `shared/report-format.md` shape: the **ads-scoped gclid coverage figure** (from Task 5) and the **maturity date this run judged to**, marked as derived-p80 or fallback. A reader must be able to see what window produced the numbers without reading the body — a change-list whose window is invisible cannot be audited later.

Add the assertion to `tests/google-ads-review.test.ts`:

```ts
it("puts the coverage figure and the maturity date in the report header", () => {
  const output = skill.body.split("## Output")[1] ?? "";
  expect(output).toMatch(/coverage/i);
  expect(output).toMatch(/maturity/i);
});
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/google-ads-review.test.ts`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. If `FULLVISION_API_KEY` is set, the contract suite now checks that `ads-leaderboard` and every referenced tool exists live.

- [ ] **Step 9: Commit**

```bash
git add skills/google-ads-review/SKILL.md tests/google-ads-review.test.ts
git commit -m "fix(google-ads-review): judge on unbounded attribution and mine search terms, not GSC queries"
```

---

### Task 7: Add the launch phase and rewrite the refusals

**Blocked by:** Task 6

**Files:**
- Modify: `skills/google-ads-review/SKILL.md:28-29` (steps preamble), `:100-120` (thresholds + blast radius), `:136-143` (refuse when)
- Test: `tests/google-ads-review.test.ts`

- [ ] **Step 1: Write the test**

Append to `tests/google-ads-review.test.ts`:

```ts
describe("google-ads-review: launch phase", () => {
  it("declares the phase boundary as a volume fact", () => {
    expect(skill.body).toMatch(/launch phase/i);
    expect(skill.body).toMatch(/qualifying terms/i);
  });

  it("no longer refuses on a short measurable window", () => {
    expect(skill.body).not.toMatch(/measurable window is shorter than/i);
  });

  it("no longer refuses when fewer than five terms qualify", () => {
    const refusals = skill.body.split("## Refuse when")[1] ?? "";
    expect(refusals).not.toMatch(/fewer than \*{0,2}5\*{0,2} terms/i);
  });

  it("still declares at least one refusal", () => {
    const refusals = skill.body.split("## Refuse when")[1] ?? "";
    expect(refusals.split("\n").filter((l) => l.trim().startsWith("-")).length)
      .toBeGreaterThan(0);
  });

  it("allows irrelevance negatives on a non-statistical criterion", () => {
    expect(skill.body).toMatch(/irrelevance negative/i);
    expect(skill.body).toMatch(/non-statistical|independent of n|not volume/i);
  });

  it("hard-zeroes budget, bidding and status in launch phase", () => {
    expect(skill.body).toMatch(/hard-zero/i);
  });

  it("caps irrelevance negatives at 25", () => {
    expect(skill.body).toMatch(/25/);
  });

  it("declares a minimum n for the journey diagnosis and forbids per-person stories", () => {
    expect(skill.body).toMatch(/\b20\b/);
    expect(skill.body).toContain("journeys");
    expect(skill.body).toMatch(/PII|drop-off shape/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/google-ads-review.test.ts`
Expected: FAIL on every launch-phase assertion; "still declares at least one refusal" passes already.

- [ ] **Step 3: Add the phase branch to the steps preamble**

`skills/google-ads-review/SKILL.md:28-29` — immediately under `## Steps`, add the phase rule as a derived fact, not a judgement:

```
launch phase  ⇔  qualifying terms < 5
mature phase  ⇔  otherwise
```

State that the phase is computed, never chosen, and that steps 5-7 below run in full only in mature phase.

- [ ] **Step 4: Add the launch-phase section**

Add a `## Launch phase` section after the steps. It does strictly less than the mature path:

1. Health — the ads-scoped figure from step 1; never aborts.
2. Plumbing diagnostics, all read-only: gclid landing (`obs_gclid_clicks` vs `g_clicks`), Stripe upload success rate and terminal-expired rows, conversion-goal sanity, Quality Score and `worst_landing_page_experience` per ad landing page, and final-URL / AI Max drift.
3. **Irrelevance negatives only**, from `search_term_view`, judged on meaning rather than volume — a term for an unrelated product is wrong on click 1, not click 60. Declare this as an explicitly **non-statistical** criterion so it is not confused with the €150/60-click performance thresholds. List every term verbatim with its spend and clicks so a human can overrule any single line. **Performance negatives do not fire in launch phase**, and the report says so.
4. **Journey diagnosis** — `` `fullvision:journeys` `` cohort on `first_touch_channel: "Paid Search"` over the judging window, answering where ad clickers stop. Minimum **20** ad-sourced people; below that, report the count and stop. Output is a drop-off shape, never a per-person story — journey rows are PII.
5. Budget, bidding and campaign status are **hard-zero**.

- [ ] **Step 5: Update thresholds and blast radius**

`skills/google-ads-review/SKILL.md:100-120` — add the launch-phase numbers to `## Thresholds`: the irrelevance-negative cap of **25**, the journey minimum of **20** people, and the phase boundary of **5** qualifying terms. In `## Blast radius`, add a launch-phase line: max 25 irrelevance negatives, zero of everything else, one run per account per day.

- [ ] **Step 6: Rewrite the refusals**

`skills/google-ads-review/SKILL.md:136-143` — in `## Refuse when`, delete two bullets:
- `check_data_health returns red` (replaced by the ads-scoped gate from Task 5)
- `The measurable window is shorter than 90 days` (the 90-day window is gone)
- `Fewer than 5 terms clear the thresholds` (now the launch-phase branch, not a refusal)

Keep the upload-ledger-history refusal. Add one new refusal: the ads-scoped coverage figure cannot be computed **and** a destructive proposal would otherwise be staged — report and stop rather than propose blind.

At least one `-` bullet must remain or `tests/safety-rails.test.ts` fails.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/google-ads-review.test.ts`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 9: Independent review**

Invoke the `codex-review` skill with `mode=code`. The diff changes the rules governing an action that spends money; a second reader is worth one pass. Fix anything it flags as critical or high.

- [ ] **Step 10: Commit**

```bash
git add skills/google-ads-review/SKILL.md tests/google-ads-review.test.ts
git commit -m "feat(google-ads-review): add launch phase so a relaunching account is watched from click 1"
```

---

## Out of scope

- **The `clipped_*` right edge.** `full_distrib`'s `ads-leaderboard.ts` clips only on the left (measurement start), while its public docs page claims it also excludes un-matured days. That is a real defect affecting every consumer of `ad-report`, but it lives in another repo. Task 6's skill-side maturity line is the workaround; the gateway fix is planned separately.
- **`src/mcp/health-verdict.ts`.** The three global figures stay exactly as they are — they are correct for their own purpose. This plan changes only how one skill *uses* them.
- **Meta and LinkedIn.** Still reads-only on the MCP surface; their upload loops are untouched.
