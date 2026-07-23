# Safety rails — the write protocol

Binding on every skill that writes anywhere: ad platforms, the website, email, audiences.
A skill may not relax any rule here. A skill may only make a rule *stricter*.

## 1. Propose → confirm → apply. Always two turns.

A skill never writes in the turn it analyses. It emits a change-list and stops. The user
confirms, and only then does the skill write. There is no "obviously safe" exception.

## 2. Every proposed change carries its evidence inline

Not `pause Campaign X`. This:

> **Pause `Campaign X`** — €1,240 spend / 90d, 2 payers, €310 attributed revenue,
> ROAS 0.25 (clipped window, measurement start 2026-02-11), n = 47 clicks.
> Revert: unpause in Meta Ads Manager, budget was €20/day.

The user must be able to overrule one line without re-running the analysis. If the evidence
does not fit on the line, the change is not ready to propose.

## 3. Thresholds are declared in the skill, never invented per run

Every write skill states its minimum spend, minimum conversions, and minimum window in its
own SKILL.md as fixed numbers. If the run wants a different threshold, that is a skill edit,
not a runtime decision. An LLM that picks its own threshold picks the one that produces a
recommendation.

## 4. Refuse on thin data

See `shared/sparse-data.md`. This is the single most important rule in the plugin. Below the
declared minimum n, the skill says so and stops. It does not rank anyway with a caveat.

## 5. Attribution-window honesty

Read `shared/reading-fullvision-data.md`. Never compare raw ROAS across platforms. Always use
the `clipped_*` columns and state the window judged on. Spend predating
`ads-measurement-start` is unmeasurable, not unprofitable, and may never be used as evidence
of waste.

## 6. Blast-radius caps per run

Declared per skill, defaults if the skill does not override:

- **max 10 entities** touched per run
- **max 15%** of the account's trailing-30d spend affected
- **max 1 run per skill per day** against the same account

Exceeded ⇒ stop, emit the full list, escalate to the human, apply nothing. Do not split a
too-large change-list into two runs to slip under the cap.

## 7. Change log

Every applied change appends to `.fullvision/changes/YYYY-MM-DD.md` in the working directory:

```markdown
## 14:22 — cut-wasted-spend — meta-ads

**Change:** added 12 negative keywords to ad group `AG-4471`
**Why:** 12 search terms, €890 combined spend / 90d, 0 payers, ≥ 60 clicks each
**Evidence:** ads-leaderboard clipped window from 2026-02-11; keyword-performance n per term in list below
**Revert:** remove the 12 terms from the ad group's negative keyword list (full list below)
```

Write the log entry **before** the write call, not after. A crash mid-apply must leave a
record of what was attempted.

## 8. Reversibility bias

Prefer, in order: negative keyword → budget down → pause → nothing. Never the reverse.

**Irreversible actions are out of scope for v1** and a skill must refuse them outright:
delete campaign, delete ad group, delete audience, delete a page, delete a list, hard-delete
any contact. If the only way to achieve the goal is irreversible, say so and stop.

## 9. Read-only mode is not an error

If a skill's `writes` server is not connected, the skill runs the **entire** analysis and
emits the change-list as an artifact with per-change manual instructions. It reports this as
a normal outcome, not a failure. This is the permanent mode for Google Ads (§ the official
server is read-only) and for `build-audience` in v1.
