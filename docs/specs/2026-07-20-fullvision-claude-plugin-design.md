# FullVision Claude Plugin — Design Spec

**Date:** 2026-07-20
**Status:** Approved design, ready for planning
**Target repo:** `FullVision-Team/fullvision-plugin` (new, public) — NOT this repo
**Depends on:** MCP OAuth spec (separate, `full_distrib` + `full_app`)

---

## 1. Problem

FullVision joins ad spend, web behaviour, SEO, and Stripe revenue into one attributed dataset. That data currently lands in a dashboard a human reads. The job it should do — "tell me what to change, then change it" — still requires a person to translate a chart into an action inside Google Ads / Meta / LinkedIn / the website.

A Claude Code plugin closes that gap: FullVision supplies revenue-attributed truth, platform MCP servers supply the hands, and skills encode the playbook between them.

**The moat:** Meta's own MCP can report CPA. Only FullVision can report LTV-adjusted ROAS by campaign, attributed to real Stripe revenue, across platforms, on comparable attribution windows. Every skill exists to exploit that asymmetry.

## 2. Audience & distribution

- **Audience:** external FullVision customers, GA. Realistically marketing-ops / growth engineers who work in a terminal, plus a Claude Desktop path via the MCP connector.
- **Distribution:** public GitHub repo that is simultaneously the plugin and its own marketplace. `/plugin marketplace add FullVision-Team/fullvision-plugin` → `/plugin install fullvision@fullvision-plugin`.
- **License:** MIT. No FullVision source in the repo — only config, skills, and docs.

## 3. Architecture

### 3.1 Repo shape

```
fullvision-plugin/                     # public GitHub repo = plugin = marketplace
├── .claude-plugin/
│   ├── marketplace.json               # so `/plugin marketplace add` targets this same repo
│   └── plugin.json                    # name: fullvision, version, author, keywords
├── .mcp.json                          # the 6 servers (§3.2)
├── skills/
│   └── fv-<name>/SKILL.md             # one dir per skill
├── shared/                            # referenced BY skills, not a skill dir
│   ├── reading-fullvision-data.md     # view names, attribution windows, gotchas
│   ├── safety-rails.md                # the write protocol (§4)
│   ├── sparse-data.md                 # B2B small-sample protocol (§5)
│   └── report-format.md
├── agents/
│   └── fv-analyst.md                  # optional isolated deep-dive subagent
├── CHANGELOG.md
└── README.md                          # single instruction: run /fullvision:fv-setup
```

Skills are namespaced by plugin name at invocation: `/fullvision:fv-cut-wasted-spend`. The `fv-` prefix is retained deliberately despite the doubling, so skills survive being copied out of the plugin into `~/.claude/skills/` and still read as a product family.

**Why a standalone repo, not `full_distrib/plugin/`:** the coupling to `full_distrib` is a *version contract* (which MCP tools exist), not a code dependency. It is better enforced by a contract test (§7) than by co-location, and it lets the plugin be public while `full_distrib` stays private.

### 3.2 The MCP bundle

```json
{
  "mcpServers": {
    "fullvision": {
      "type": "http",
      "url": "${FULLVISION_MCP_URL:-https://data.fullvision.io/mcp}"
    },
    "meta-ads": {
      "type": "http",
      "url": "https://mcp.facebook.com/ads"
    },
    "google-ads": {
      "type": "stdio",
      "command": "pipx",
      "args": ["run", "--spec", "git+https://github.com/googleads/google-ads-mcp.git@<PINNED_SHA>", "google-ads-mcp"],
      "env": { "GOOGLE_ADS_DEVELOPER_TOKEN": "${GOOGLE_ADS_DEVELOPER_TOKEN}" }
    },
    "linkedin-ads": { "…": "community server, PINNED to a reviewed SHA" },
    "webflow": { "type": "http", "url": "https://mcp.webflow.com/sse" },
    "brevo":   { "…": "official Brevo MCP, api-key auth" }
  }
}
```

| Server | Official? | Read | Write | Auth burden on customer |
|---|---|---|---|---|
| fullvision | ours | ✅ 22 tools / 73 views | audiences, views, funnels | 1-click OAuth (§3.3) |
| meta-ads | ✅ Meta, hosted | ✅ | ✅ 29 tools | 1-click OAuth |
| google-ads | ✅ Google, self-hosted | ✅ GAQL only | ❌ **read-only by design** | developer token (days) + Python toolchain |
| linkedin-ads | ❌ community (25★) | ✅ | ✅ | own dev app + LinkedIn app review (weeks) |
| webflow | ✅ Webflow, hosted | ✅ | ✅ CMS/pages | 1-click OAuth |
| brevo | ✅ Brevo, first-party | ✅ | ✅ lists/segments/campaigns | API key |

**Amazon SES** is supported as a narrow send-only destination via the AWS CLI/SDK, **not** as a bundled MCP: no production-grade SES MCP exists (awslabs has an open RFC; only a non-production AWS *sample* ships). SES also allows **one contact list per AWS account** with no segments and no campaign object, so segment/campaign skills are structurally impossible there and must declare themselves unavailable rather than fail mid-run.

**Google Ads writes are out of scope for v1.** The official server is read-only; the only write-capable options are community servers with low adoption that can spend customer money. Google "actions" are therefore emitted as a reviewed change-list the user applies, and this limitation is stated plainly in `fv-setup` output and the README.

### 3.3 FullVision auth — 1-click

FullVision's MCP must implement **OAuth 2.1 + PKCE with dynamic client registration** (RFC 9728 protected-resource metadata → RFC 8414 auth-server metadata → RFC 7591 DCR), matching Meta / Webflow / HubSpot / PostHog. Claude Code then opens a browser, shows a FullVision consent screen, and stores the token itself — no env var.

This is net-new work in `full_distrib` (today: `Authorization: Bearer sk_…` via `resolveApiKey`) plus a consent page in `full_app`. **It is specified separately.** The plugin is built and tested against bearer auth and flips to OAuth by changing `.mcp.json` only.

### 3.4 Degradation

Every skill declares in frontmatter:

```yaml
name: fv-cut-wasted-spend
description: …
cadence: weekly
requires: [fullvision, google-ads]
writes: [google-ads]
```

- A missing **read** dependency ⇒ the skill declares itself unavailable in `fv-setup` and refuses to run.
- A missing **write** dependency ⇒ the skill runs the full analysis and emits the change-list as an artifact. **Missing MCP is read-only mode, never an error.**

### 3.5 Context budget

Six servers is well past the point where tool-schema bloat degrades tool selection (measured: ~95% → 71% accuracy under heavy MCP load). Mitigations, all required:

1. Document and recommend `ENABLE_TOOL_SEARCH` (deferred tool loading) in the README.
2. Keep FullVision's server consolidated — it already is (22 tools over 73 views, guarded by a tool-surface budget test).
3. Every skill names the **exact** tools it needs, so deferred loading fetches a handful rather than everything.

### 3.6 Supply chain

- Community servers (`linkedin-ads`, and Google Ads if a write server is ever added) are **pinned to a reviewed commit SHA**. Never a floating tag, never `@latest`.
- The reviewed SHA and review date are recorded in the repo.
- A dependency-update PR is a **security review**, not a chore — these servers can spend customer money.
- Official servers (Meta, Webflow, Google, Brevo) may float.

## 4. Write protocol (`shared/safety-rails.md`)

Binding on every skill that writes.

1. **Propose → confirm → apply, always two turns.** A skill never writes in the turn it analyzes. It emits a change-list with projected impact (€ affected, entities touched) and stops.
2. **Every proposed change carries its evidence inline** — not "pause Campaign X" but "pause Campaign X — €1,240 spend/90d, 2 payers, €310 revenue, ROAS 0.25, n=47 clicks." The user must be able to overrule one line without re-running the analysis.
3. **Thresholds are declared in the skill, never invented per-run.** Minimum spend, minimum conversions, minimum window.
4. **Refuse on thin data.** See §5. This is the single most important rule.
5. **Attribution-window honesty.** Google = 90-day click age; Meta = 7-day upload wall with first-charge pLTV; LinkedIn = 365-day. A skill **never compares raw ROAS across platforms** — it uses the `clipped_*`/`full_*` split already baked into `ads-leaderboard`, states the window it judges on, and respects `ads-measurement-start`: spend predating FullVision's first webhook charge is **unmeasurable**, not unprofitable.
6. **Blast-radius caps per run** — max entities touched, max % of total spend affected. Exceeded ⇒ stop, escalate to human.
7. **Change log** — every applied change appends to `.fullvision/changes/YYYY-MM-DD.md`: what, why, evidence, revert instruction.
8. **Reversibility bias** — prefer pause over delete, budget-down over pause, negative keyword over campaign kill. Irreversible actions (delete campaign, delete audience) are **out of scope for v1**.

## 5. Sparse-data protocol (`shared/sparse-data.md`)

B2B conversion volume is low, cycles are long, and multi-touch attribution is structurally unreliable (Refine Labs: deterministic MTA credited web search with 78% of conversions vs 12% self-reported by the same buyers; ~60% of B2B buying is dark-funnel). Encoded rules:

1. **Every skill declares a minimum n** and refuses below it, saying so explicitly. A campaign with 3 payers is noise; an LLM will happily rank it anyway.
2. **Confidence at 80–90%, not 95%**, matching B2B practice — and stated in the output.
3. **Prefer shrinkage over raw counts** — small-sample estimates pulled toward the account mean rather than trusted at face value.
4. **Attributed revenue is evidence, never ground truth.** At low volume, `fv-kill-losing-campaigns` requires a corroborating signal before recommending a pause, rather than acting on ROAS alone.
5. **Never propose an A/B test the traffic can't power.** Below roughly 10k visitors/month, the honest recommendation is qualitative — 5 user tests surface ~80% of usability issues; 10–15 session recordings surface 70–85%. A skill says that instead of proposing an underpowered variant test.

## 6. Skill catalog

### 6.1 Abstraction rule

> **A skill = one named job a marketer already puts on a recurring calendar, producing one artifact.**

| Level | Example | Verdict |
|---|---|---|
| Channel | `fv-google-ads-insight` | ❌ Too broad — no trigger, no threshold, undefined output; overlaps siblings so Claude picks wrong |
| **Named job** | **`fv-cut-wasted-spend`** | ✅ **Right** — marketers already run it weekly and already call it this |
| Atomic action | `fv-add-negative-keyword` | ❌ Too narrow — that's an MCP tool, not a skill; no judgment in it |

The tell: **if a marketer wouldn't schedule it, it's not a skill.**

Evidence: every AI marketing product converges on narrow single-purpose units — HubSpot Breeze, Jasper (100+ job-scoped agents), Clay (narrow primitives + user-composed templates), Copy.ai (discrete Actions), AdCreative (creative-only by design). Even "broad" AI-SDR products decompose narrowly internally (11x's own engineering write-up). Mutiny started with one narrow play and broadened only after it proved out. Documented failure mode: broad agents on messy data degrade sharply because breadth amplifies data-quality dependency instead of absorbing it.

Naming uses **practitioner vocabulary** — wasted spend, striking distance, creative fatigue, budget pacing, message match, win-back, content decay, cannibalization — all confirmed live usage. Broad outcomes ("run the quarterly paid audit") are composed as **orchestrators calling narrow skills**, never as one skill doing several jobs in an undifferentiated pass.

### 6.2 Foundations

| Skill | Cadence | Job |
|---|---|---|
| `fv-setup` | on install | Connection matrix; what's usable *right now*; names the next-best server to connect |
| `fv-data-health` | precondition | `health-identity-recon`, `health-checkout-coverage`, `health-event-coverage`. Bad coverage ⇒ every downstream number is a lie, and the skill says so instead of recommending |
| `fv-verify-revenue-feedback-loop` | weekly | Is closed revenue reaching Google/Meta/LinkedIn? Upload failures, Meta 7-day `expired` ledger rows, pLTV sanity. Also checks whether deal volume supports payment-only export, and recommends a mid-funnel goal if not (practitioners assign proxy values — MQL €500, SQL €2,500 — below ~20–30 closed deals/month) |
| `fv-weekly-review` | weekly | Orchestrator. Runs the read-only half of every applicable skill filtered by `cadence`, emits one ranked action list naming which skills to run |

`fv-data-health` runs as a precondition **inside** every other skill, not just standalone.

### 6.3 ① Improve ads

| Skill | Cadence | Trigger → rule → action |
|---|---|---|
| `fv-cut-wasted-spend` | weekly | terms with spend, ≥ min clicks, **zero payers** (not zero form-fills) → negative keywords |
| `fv-kill-losing-campaigns` | weekly | spend > floor & window-correct ROAS < target & n ≥ min & corroborating signal → pause |
| `fv-scale-winners` | weekly | ROAS > target **and** budget-constrained (Lost IS budget > 10%) → capped budget step; respects the 5–7 day learning hold |
| `fv-fix-budget-pacing` | daily/mid-month | over/underpace + Lost IS budget-vs-rank split → budget change, or flag it's a bid/quality problem instead of throwing money at it |
| `fv-refresh-tired-creative` | 2–3×/week | frequency + CTR decay vs the ad's **own** baseline → flag/rotate (Meta) |
| `fv-audit-ad-landing-pages` | monthly | paid traffic landing on weak/mismatched pages → hands off to ② |
| `fv-audit-account-structure` | quarterly | structural waste review (agencies cite 20–30% even in well-managed accounts) |

Reads: `ads-leaderboard`, `ads-performance`, `ltv-by-campaign`, `ads-measurement-start`, `keyword-performance`, `ad-landing-pages`.

### 6.4 ② Improve landing pages

| Skill | Cadence | Trigger → rule → action |
|---|---|---|
| `fv-find-leaky-pages` | weekly | pages ranked by **lost revenue**, not bounce rate → shortlist |
| `fv-diagnose-page` | on demand | one URL: scroll depth, rage/dead clicks, form drop-off, engaged session → evidence-backed hypothesis |
| `fv-check-message-match` | per ad group | ad headline vs page H1 → mismatch list (top cause of poor Landing Page Experience) |
| `fv-fix-forms` | monthly | field-level drop-off + field-count rules → fix list |
| `fv-fix-page` | on demand | **applies the change: GitHub PR or Webflow write** |
| `fv-rescue-striking-pages` | monthly | GSC position 11–30 with impression volume → content brief → `fv-fix-page` |
| `fv-refresh-decaying-content` | quarterly | content decay ranked **by revenue lost** — quarterly refresh cited ~42% better than annual |
| `fv-fix-keyword-cannibalization` | quarterly | two pages competing for one query (`gsc-by-page` × `gsc-queries`) |

Reads: `page-performance`, `page-customers`, `engagement-by-page`, `scroll-depth-by-page`, `rageclicks-by-page`, `dead-clicks-by-page`, `form-performance`, `conversion-funnel`, `gsc-*`.

**Website write target** is user-selectable: `github` (edit files, open a PR) or `webflow` (CMS/page write). `fv-setup` detects which is available; if both, `fv-fix-page` asks once and remembers.

### 6.5 ③ Identify audiences to retarget

| Skill | Segment |
|---|---|
| `fv-build-audience` | generic — describe a segment → compiled, floor-checked, consent-gated |
| `fv-retarget-pricing-page-visitors` | high-intent anonymous |
| `fv-recover-abandoned-checkouts` | recoverable revenue |
| `fv-win-back-churned` | churned above LTV floor |
| `fv-find-expansion-accounts` | usage-up, plan-below |
| `fv-lookalike-from-best-customers` | top-decile-LTV seed |

**Shared preflight, non-negotiable:**

```
1. size the segment
2. check platform floor   → route to email if it can't clear (see table)
3. check consent flag     → no consent ⇒ REFUSE ad upload, offer email
4. pick destination       → Google CM / Meta CA / LinkedIn / Brevo
```

| Platform | Floor | Realistic raw list at B2B ~20% match |
|---|---|---|
| Google Customer Match | 100 matched (lowered from 1,000 in 2026) | ~500 |
| Meta Custom Audiences | 100 | 300–500 |
| LinkedIn Matched Audiences | 300 matched (LinkedIn recommends 50k) | **1,500+** |

**GDPR is a hard gate, not a warning.** A German DPA ruled uploading customer lists to ad platforms without explicit consent illegal **even when hashed**; legitimate interest was rejected. Google requires `ad_user_data` + `ad_personalization` = GRANTED per EEA user with **no B2B/work-email carve-out**. Therefore: no ad-platform upload without a verifiable consent flag on the contact record, and **email/ESP activation is the default for EU B2B**, not the fallback.

Activation reuses the existing FullVision audience-delivery cron (Customer Match / Meta Custom Audience) rather than uploading from the plugin.

### 6.6 ④ Email

| Skill | Notes |
|---|---|
| `fv-sync-audience-to-email` | Brevo: list + attributes + segment. SES: append to the single account list, topic-tagged |
| `fv-send-campaign` | **Brevo only** — SES has no campaign object |
| `fv-email-list-hygiene` | suppression, bounces, unengaged pruning — works on both |

**Known gap:** these three are designed from SES/Brevo capability research, not from practitioner cadence research (which did not cover lifecycle/email). A cadence pass is required before building them.

### 6.7 v1 scope

Ship six, because they exercise every architectural path and prove the model before writing fifteen more:

1. `fv-setup` — onboarding, connection matrix
2. `fv-data-health` — the precondition
3. `fv-verify-revenue-feedback-loop` — the moat, and the thing that keeps every other number honest
4. `fv-cut-wasted-spend` — read + platform write
5. `fv-find-leaky-pages` + `fv-fix-page` — read + site write (GitHub and Webflow paths)
6. `fv-build-audience` — floor check + consent gate + activation

Everything else is v2+, ordered by observed usage.

## 7. Testing

- **Contract test against the live FullVision MCP** — asserts every view and tool a skill names still exists. This is what replaces co-location with `full_distrib`; it must run in CI and fail loudly on tool-surface drift.
- **Skill frontmatter validation** — `name`, `description`, `cadence`, `requires`, `writes` present and well-formed; `requires` names only servers declared in `.mcp.json`.
- **Degradation test** — with a write server absent, the skill still completes and produces a change-list artifact.
- **Safety-rail test** — a write skill given a thin-data fixture must refuse, and must not emit a write proposal.
- **`claude plugin validate --strict`** in CI.
- **Pinned-SHA check** — CI fails if any community server reference is unpinned.

## 8. Out of scope for v1

- Google Ads write actions (official server is read-only; community write servers are unvetted).
- Irreversible actions of any kind (delete campaign, delete audience).
- SES segment/campaign skills (structurally impossible — one list per account, no campaign object).
- Claude Desktop packaging (the MCP works as a connector once OAuth lands; the skills do not install the same way).
- Submission to Anthropic's official/community catalog. Self-hosted marketplace first.

## 9. Dependencies & sequencing

1. **MCP OAuth 2.1 + DCR** (`full_distrib` + `full_app` consent screen) — separate spec. Not a blocker for building; only for the 1-click install story.
2. This plugin repo — buildable immediately against bearer auth.
3. Email cadence research pass — blocker for §6.6 only.

## File Inventory

Net-new files only, in a new repo (`fullvision-plugin`) — no existing-file touch points in `full_db`.

Read-only contract references (not modified by this spec):
- `full_distrib/src/mcp/server.ts:61` — `createMcpServer`, the 22-tool surface the contract test asserts against.
- `full_distrib/src/mcp/server.ts:529-534` — bearer auth path that OAuth will replace (separate spec).
- `full_distrib/src/core/registry.ts:3` — `REGISTRY`, the 73 views skills read from.
- `full_distrib/src/core/composites.ts:9` — `page-report`, `page-scorecard`.
