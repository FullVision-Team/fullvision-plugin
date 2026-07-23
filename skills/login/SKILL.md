---
name: login
description: Connect this machine to FullVision in one click. Opens the browser, mints a read-only key on approval, and saves it locally. Run once after install, and again if calls start failing on auth.
cadence: on-demand
requires: []
writes: []
---

# login

Get this machine a FullVision key without the user pasting one.

`requires: []` on purpose — this is the skill that *creates* the FullVision connection, so it
must run before `fullvision` is usable. It is the only skill that works from a cold install.

## Steps

1. **Run the login script.**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/fv-login.mjs"
   ```

   It opens the browser, waits up to 5 minutes for approval, and writes the issued key to
   `~/.fullvision/credentials.json` (mode `0600`). It prints the authorize URL too — if the
   browser doesn't open, tell the user to click the printed URL.

2. **Report what it printed.** On success it names the workspace that was connected. Say
   which one — a user with several workspaces needs to know which they just linked.

3. **Verify the connection** by calling `fullvision:list_views`. If it still fails on auth,
   the MCP server was started before the key existed; tell the user to restart Claude Code.
   That is the one case a restart is needed.

4. **Hand off** — suggest, do not auto-run. If they are mid-onboarding, `onboard` resumes
   at the tracker step. Otherwise `fullvision:get_capabilities` maps what the user can
   actually do now.

## What the user is approving

State this before running, in one line: it creates a **read-only** key scoped to the workspace
they pick, valid **90 days**, revocable any time in FullVision → Settings → API keys.

## Things to state plainly

- **The key lands on disk** at `~/.fullvision/credentials.json`. On a shared machine, that
  file is the credential — say so rather than implying the login is session-bound.
- **`FULLVISION_API_KEY` still wins** if it is set in the environment. If a user logs in and
  still sees the old workspace, an exported key is shadowing the file.

## Refuse when

- The user asks to log in on a machine that is not theirs, or to a workspace they have said
  they do not own. Owner access is enforced server-side, but do not help route around it.
- The user pastes a key and asks you to write it into `credentials.json` on their behalf.
  Point them at this flow, or at `FULLVISION_API_KEY` if they want to manage it by hand —
  do not hand-edit the credential file.
