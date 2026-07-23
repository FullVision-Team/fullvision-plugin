# MCP servers — review record

Official, first-party servers may float. Community and self-hosted servers are pinned to a
reviewed commit SHA and **a dependency-update PR is a security review, not a chore** — these
servers hold credentials that can spend customer money.

| Server | Provider | Trust | Pin | Reviewed |
|---|---|---|---|---|
| `fullvision` | FullVision | first-party | n/a (hosted) | — |
| `webflow` | Webflow | official hosted | n/a (hosted) | — |
| `brevo` | Brevo | first-party | n/a (hosted) | — |

## Capability matrix

| Server | Read | Write | Customer auth burden |
|---|---|---|---|
| fullvision | 44 tools over 73 views + Google Ads GAQL passthrough | custom views, funnels + Google/Meta/LinkedIn campaign mutate (pause/enable + budget, propose→apply, undoable) | 1-click browser login (`/fullvision:fv-login`) |
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
