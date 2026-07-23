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

Then, in the repository that serves your website:

```
/fullvision:onboard
```

That is the only instruction, and it works from a standing start — no account, no API key,
nothing connected. `onboard` walks you through signup, installs the tracker **into your
actual codebase** as a pull request, connects Stripe and your ad platforms, and does not
call a step done until it can see the data arriving.

Already set up? Call `fullvision:get_capabilities` — it tells you what works right now with
what you have connected, and names the one thing worth connecting next.

Your weekly Google Ads session is one command: `/fullvision:google-ads-review`. It verifies
that closed Stripe revenue is reaching Google as conversion signal, finds the terms that spend
money and produce zero payers, and stages the fixes for you to confirm.

## Setup

Nothing to do up front — `onboard` runs the login for you at the right moment. To connect
a machine on its own (a second laptop, a re-login after 90 days, switching workspace):

```
/fullvision:login
```

This opens your browser, you pick a workspace and click Authorize, and the key is saved to
`~/.fullvision/credentials.json`. It is read-only, expires in 90 days, and is revocable any
time in FullVision → Settings → API keys.

Prefer to manage the key yourself? Export `FULLVISION_API_KEY=sk_…` instead — it takes
precedence over the saved credential.

Optional, per server you want to use: `BREVO_API_KEY`. Webflow authenticates in the browser on
first use. You do not need all of them — every skill degrades gracefully.

**Recommended:** enable deferred tool loading (`ENABLE_TOOL_SEARCH`). This plugin bundles three
MCP servers, and tool-selection accuracy degrades measurably when a lot of tool schema is
loaded at once. Deferred loading fetches only the tools a skill actually names.

## Skills

| Skill | Cadence | Job |
|---|---|---|
| `onboard` | on install | Zero to first attributed data — signup, tracker installed in your repo, Stripe, ads |
| `login` | on demand | Connect this machine — browser login, read-only key, no pasting |
| `google-ads-review` | weekly | The weekly Google session — verify the revenue loop, cut zero-payer spend, stage budget fixes |
| `find-leaky-pages` | weekly | Pages ranked by revenue lost, not bounce rate |
| `fix-page` | on demand | Applies the fix — GitHub PR or Webflow write |
| `design-page-test` | on demand | Can this page power an A/B test? Usually no, with the numbers |
| `find-keyword-gaps` | monthly | Queries that impress but never pay, ranked by revenue |
| `fix-striking-distance` | monthly | Positions 5–20 where a snippet rewrite moves real money |
| `win-back-churned` | monthly | Lapsed customers worth recovering → a staged Brevo list |
| `build-audience` | on demand | Sized, floor-checked, consent-gated segments (incl. retargeting) |

## Why there are no "specialist" agents

A reasonable first instinct is to ship a Google Ads specialist, a Meta specialist, a LinkedIn
specialist, an SEO specialist and a strategist. This plugin deliberately does not.

A subagent buys you exactly two things: an isolated context window and a restricted tool set.
It does not buy expertise — that comes from the instructions, which a skill delivers into the
main conversation where the user actually is. Subagents start with no conversation history and
cannot ask the user a question mid-run.

Splitting by ad platform is worse than merely unnecessary. The question that matters is
cross-platform — *which channel gets the next €10k?* — and answering it requires one context
holding all three platforms on comparable attribution windows. That comparison is the entire
reason FullVision exists. Three per-platform agents would each answer confidently from a third
of the evidence.

So: platform knowledge lives in `shared/platforms/*.md` and is read by whichever skill needs
it. Jobs are skills. The only subagent is `analyst`, and it earns its place on context
isolation alone — deep multi-view digs whose raw rows nobody needs to see.

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

- **`build-audience` hands off to the FullVision app** for activation.
- **Irreversible or learning-resetting actions are out of scope** — no deleting campaigns,
  audiences or pages, and no bidding strategies, targeting or creative. Google conversion-goal
  management is **in scope** (reversible, gated by `apply_proposal`).

## Contributing

`npm test` runs everything. The contract test hits the live FullVision MCP and needs
`FULLVISION_API_KEY`; it skips without one.

Bumping a pinned MCP server SHA is a **security review**, not a chore — see
[`docs/mcp-servers.md`](docs/mcp-servers.md).

## License

MIT
