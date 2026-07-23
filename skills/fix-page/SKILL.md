---
name: fix-page
description: Apply a landing-page fix — a GitHub pull request against the site repo, or a Webflow CMS/page write. Takes a diagnosis from find-leaky-pages and turns it into a reviewable change.
cadence: on-demand
requires: [fullvision]
writes: [webflow]
---

# fix-page

The only skill in v1 that changes the website. Two write targets, user-selectable.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## Choosing the write target

- **`github`** — the site lives in a repo the user has checked out. Edit files, open a **pull
  request**. Never commit to the default branch. Uses the local `git`/`gh` CLI, no MCP server.
- **`webflow`** — the site is a Webflow project. Use the `webflow` MCP server for CMS and page
  writes.

`capabilities` detects which is available. If both are, **ask once** and record the answer in
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

- `data-health` returns 🚩 — you would be fixing a page based on incomplete behaviour data.
- The page has fewer than **500 sessions** in the trailing 90 days. There is no evidence to
  act on; say so.
- The requested change is outside the scope limits above.
