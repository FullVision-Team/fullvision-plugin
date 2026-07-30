---
name: fix-page
description: Apply a landing-page fix as a GitHub pull request against the site repo. Takes a diagnosis from find-leaky-pages and turns it into a reviewable change.
cadence: on-demand
requires: [fullvision]
writes: []
---

# fix-page

The only skill in v1 that changes the website. One write path: a pull request against the
repo that serves the site.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## The write path

The site lives in a repo the user has checked out. Edit files, open a **pull request**. Never
commit to the default branch. This uses the local `git`/`gh` CLI and no MCP server at all,
which is why `writes` is empty — no write server being connected can make this skill
unavailable.

If the site repo is not available, run read-only per `shared/safety-rails.md` §9 and emit the
change-list as a diff or a copy-pasteable content block.

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
   (`.fullvision/changes/YYYY-MM-DD.md`), then apply: branch `fv-fix/<slug>`, make the edit,
   open a PR whose body is the hypothesis plus the evidence. Never merge it — the PR *is* the
   review gate.
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

`shared/report-format.md`, plus the PR URL.

## Refuse when

- `fullvision:check_data_health` reports **`health-event-coverage`** degraded — this skill's
  evidence is client-side behaviour (scroll depth, rageclicks, form performance), so thin event
  coverage means fixing a page on incomplete behaviour data. Report the global verdict as context
  per `shared/safety-rails.md` §10, but gate on this check alone: `health-identity-recon` and
  `health-checkout-coverage` do not block a run that is not fixing a page on payer counts.
- The page has fewer than **500 sessions** in the trailing 90 days. There is no evidence to
  act on; say so.
- The requested change is outside the scope limits above.
