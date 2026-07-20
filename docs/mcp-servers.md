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
| fullvision | 22 tools over 73 views | custom views, funnels | bearer key today; 1-click OAuth planned |
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
