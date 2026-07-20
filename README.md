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
