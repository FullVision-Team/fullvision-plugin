---
name: onboard
description: Take a new user from no FullVision account to first attributed revenue data — signup, workspace, login, tracker installed in their actual codebase, Stripe, and search/ads connections. The install-time entry point.
cadence: on-install
requires: [fullvision]
writes: []
---

# onboard

Get this user from nothing to a working, attributed dataset. Nothing else in the plugin
functions until this is done.

**Do not refuse on auth failure in phases 0–2.** Every other analysis skill treats a missing
`fullvision` connection as fatal. Here it is the starting condition — the user does not have
a key yet, and that is the state you are fixing.

**Authentication is `login`'s job, not yours.** It owns the browser flow, the key, and the
credential file. Never teach a second way to authenticate — no copying secret keys out of
Settings, no shell-profile edits. If you find yourself explaining `sk_` handling, you have
gone wrong.

Read `shared/reading-fullvision-data.md` before any view call in phase 4 onward. It does not
apply to phases 0–3, where there is nothing to read yet.

## What only this skill can do

The web onboarding at `app.fullvision.io` can hand out a tracker snippet. It cannot install it.
You are running inside the user's repository — you can find their layout file, insert the
snippet correctly for their framework, and open a PR. **That is the reason this skill exists.**
Do not degrade into a list of links the user could have read on the website.

Account creation and OAuth genuinely require a browser. Everything downstream of the key does
not. Hold that line: browser only where the auth model forces it.

## Phases

Run these in order. Announce the phase, do the work, verify, then move on. Never present the
whole plan as a wall of steps up front — this is a conversation, not a checklist dump.

### Phase 0 — Establish where the user already is

Do not assume a blank slate; re-runs are common and re-doing a finished step is worse than
skipping it.

1. Call `fullvision:list_views`. Success ⇒ they are already connected; skip to phase 4.
2. On auth failure, do they have a FullVision account at all? Ask — it is one question and
   it decides everything. An existing user needs only phase 2; a new one starts at phase 1.

State which phase you are entering and why, in one line.

### Phase 1 — Account and workspace (browser)

Hand the user these links, one at a time, waiting for each:

| Step | Link |
|---|---|
| Sign up (Google or email) | https://app.fullvision.io/signup |
| Verify email — **mandatory** | https://app.fullvision.io/verify-email |
| Create the workspace | https://app.fullvision.io/onboarding |

The workspace form asks for their website URL and product URL. If you can infer these from
the repo (package.json `homepage`, README, deployed domain in CI config, `.env`), offer them
as suggestions rather than making the user look them up.

**Email verification is a hard gate.** Login will not offer them a workspace until it is done.
Say this before they leave for the browser, not after they come back confused.

### Phase 2 — Connect this machine

Run the `login` skill. That is the whole phase — it opens the browser, the user picks a
workspace and clicks Authorize, and a read-only key lands in `~/.fullvision/credentials.json`.

Do not build a parallel path. Never send them to the API-keys page for a secret key, never
offer to write one into their shell profile, and never accept a key pasted into the chat.
`login` exists so none of that has to happen.

Say what they are approving before the browser opens — read-only, scoped to the one workspace
they pick, 90 days, revocable in Settings. `login` states this too; saying it first is what
makes the browser prompt unsurprising rather than alarming.

If several workspaces are offered, make sure they pick the one this repository serves. Linking
the wrong workspace fails silently: everything downstream succeeds against empty data, and it
reads as a broken install hours later.

### Phase 3 — Confirm the connection

Call `fullvision:list_views`, and name the workspace that came back so a user with several
knows which one they just linked.

If it still fails on auth, the usual cause is that the MCP server started before the credential
existed — restart Claude Code and re-run. Do not go hunting for a key to export. An exported
`FULLVISION_API_KEY` takes precedence over the credential file, so if login succeeded but the
wrong workspace appears, a stale environment variable is the reason.

### Phase 4 — Install the tracker in their repo

The step that justifies doing this in a terminal. Work in their actual codebase.

1. **Read their workspace config.** `GET https://data.fullvision.io/workspace` returns the
   site config, authenticated with the credential login already stored. You also need their
   **publishable** `pk_` key for the snippet — that one lives at
   https://app.fullvision.io/setup/data-sync/web-tracker, alongside the current inline stub.

   `pk_` is the only FullVision key that belongs in client-side HTML. It is not the key
   `login` stored, and the two are not interchangeable in either direction.
2. **Detect the framework, and check it is not already installed.** Look for `next.config.*`,
   `nuxt.config.*`, `svelte.config.*`, `astro.config.*`, `app/layout.tsx`, `index.html`, a
   Webflow/WordPress export, or a plain static site. Name what you found before editing.

   **Grep for an existing tracker first** (`t.js`, `fv_visitor_id`, `data-key="pk_`). Users
   re-run this skill, and a second snippet double-counts every pageview — which corrupts the
   data rather than erroring, so nothing will tell you it happened. If one is present, verify
   the `pk_` matches this workspace and move on; do not add another.
3. **Insert the snippet** into the single site-wide layout — the one file every page renders
   through. Two parts, both required:

   ```html
   <!-- inline stub: mints fv_visitor_id during parse, before the async load lands -->
   <script>/* inline stub from the app's tracker page */</script>
   <script async data-key="pk_…" src="https://db.fullvision.io/t.js?k=pk_…"></script>
   ```

   Keep **both** the `data-key` attribute and the `?k=` query parameter. HTML optimizers and
   some CDNs strip query strings from script URLs; `data-key` is the fallback that keeps the
   tracker alive when they do. Dropping it produces a tracker that works locally and silently
   fails in production.

   The inline stub matters for attribution accuracy, not just speed: it sets the visitor
   cookie during HTML parse, so a visitor who bounces before the async script lands is still
   identified. Fetch its current contents from the app's web-tracker page rather than
   reconstructing it from memory.

4. **Framework-specific placement.** Next.js App Router wants `next/script` with the right
   strategy, not a raw tag; Nuxt wants `nuxt.config` `app.head.script`. Match the idiom of
   the framework and the surrounding code — a raw `<script>` in a React tree is a bug, not a
   style preference.

   **The async tag is the easy half; the inline stub is where frameworks fight you.** It has
   to execute during HTML parse, which is exactly what component-tree script handling defers.
   In Next.js App Router that means `next/script` with `strategy="beforeInteractive"` (and
   `dangerouslySetInnerHTML` for the stub body), not a `<script>` in the JSX. Get this wrong
   and the tracker still *works* — it just mints the visitor cookie late, quietly losing the
   bounced-visitor attribution the stub exists to protect. Nothing will flag it.
5. **Commit on a branch and open a PR.** Never commit a tracker straight to their main branch.
   Say plainly that the tracker will not report until that PR is merged and deployed.
6. **Verify with real data.** Once deployed, poll `view:web-traffic-live` until the first
   pageview appears. Ask them to load their site in a normal browser — a `curl` or a headless
   fetch is dropped as bot traffic and will never show up, which reads as a broken install.

Do not declare this phase done on "the code is committed." It is done when a pageview arrives.

### Phase 5 — Stripe

Revenue is the spine. Without it, every skill in the plugin degrades to traffic analytics.

Send them to https://app.fullvision.io/setup/data-sync/stripe — 1-click OAuth, or a restricted
key. Then poll `GET https://db.fullvision.io/v1/connections` (Bearer `sk_`) until the `stripe`
entry reports `ready: true`.

`ready` means the credential is valid and stored. It does **not** mean revenue has arrived —
`last_webhook_at` stays null until someone actually pays, and a backfill of history runs
separately. Do not report "no revenue data" as a setup failure on a fresh connection.

### Phase 6 — Server-side events (the step users skip, and shouldn't)

Web pageviews alone cannot see signup, activation, or anything that happens on their backend.
More importantly, server events are what link a paying Stripe customer back to the visitor who
clicked the ad. Skip this and a large share of customers arrive unattributed, which caps every
ROAS number the plugin will ever report.

Point them at https://app.fullvision.io/setup/data-sync/events. If their backend is in this
repo, offer to write the call — find the signup handler and show the diff.

**The failure mode worth naming out loud:** sending a server event without the visitor cookie
forwarded from the browser. The event lands, the person is created, and the attribution chain
is silently broken. If you write this call, forward the `fv_visitor_id` cookie.

Verify with `view:recent-events`.

### Phase 7 — Search and ads

Only now, and only what they actually use. Ask before sending links.

| Source | Link |
|---|---|
| Search Console | https://app.fullvision.io/setup/data-sync/search-console |
| Google Ads | https://app.fullvision.io/setup/data-sync/google-ads |
| Meta Ads | https://app.fullvision.io/setup/data-sync/meta-ads |
| LinkedIn Ads | https://app.fullvision.io/setup/data-sync/linkedin-ads |

Confirm each via `GET /v1/connections`. GSC reports `ready: false` until a *property* is
selected — a connected Google account with no site chosen is the most common half-finished
state here, and the error message does not make that obvious.

Do not push all four. Someone who spends nothing on LinkedIn does not need a LinkedIn
connection, and asking for one costs trust.

### Phase 8 — Hand off

Call `fullvision:check_data_health` and report the three coverage numbers, so the user starts
with a calibrated sense of what their data can support. Then call `fullvision:get_capabilities`
for what to do next.

Say clearly what is still missing and what it would unlock. A user who stopped after the
tracker should know their ROAS numbers are traffic-only until Stripe is connected.

## Backfill takes time

Stripe backfill and the first attribution rebuild are not instant — a large account takes a
while, and the ads-measurement window only opens at the first Stripe *webhook* charge.
Numbers in the first hours are partial by construction. Say so, rather than letting the user
discover it as an apparent bug.

## Style

- **One step at a time.** Never dump all eight phases. Ask, wait, verify, continue.
- **Explain the why in one line**, not three. "Server events are how a Stripe customer gets
  linked back to the ad they clicked" earns the step; a paragraph on identity resolution
  loses them.
- **Verify with data, never with "did that work?"** You have the API. Use it.
- **Resumable.** Phase 0 makes re-running safe. Users will close the terminal mid-flow.

## Refuse when

- The user pastes a secret key into the chat. Say it is now in the transcript, tell them to
  rotate it at `/settings/api-keys`, and continue with the new one.
- You are asked to commit a tracker or an API key directly to the default branch. Branch and
  PR, always.
- A `pk_` and an `sk_` are being confused. The publishable key is safe in client HTML; the
  secret key must never enter a browser-served file. Stop and correct it — this is the one
  mistake here with a real security cost.
- The repo you are in is plainly not the site being tracked (no web surface, wrong domain).
  Confirm which codebase serves the site before editing.
