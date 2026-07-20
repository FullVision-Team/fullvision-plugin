# Report format

Every skill produces exactly one artifact. Same shape, so a weekly review can concatenate
them and a human can skim six of them in two minutes.

## Structure

```markdown
# <skill name> — <account / workspace> — <YYYY-MM-DD>

**Verdict:** <one sentence. The answer, not a summary of the process.>
**Window judged:** <dates> (<clipped|full>, measurement start <date>)
**Data health:** <✅ ok | ⚠️ degraded: which check, what it biases>
**Confidence:** <80|85|90>% — <n> observations

## Proposed changes

1. **<action> `<entity>`** — <evidence with numbers and n>
   Revert: <exact instruction>

2. …

## Not proposed (and why)

- `<entity>` — <which threshold it failed, with the number>

## Notes
<anything that changes how the above should be read>
```

## Rules

- **Verdict first.** If a reader stops after one line they should have the answer.
- **Every number carries its n.** A ROAS without a denominator count is not evidence.
- **"Not proposed" is not optional.** Showing what was excluded and why is what makes the
  proposed list trustworthy. A report with an empty proposed list and a full excluded list is
  a good report.
- **No emoji beyond the health marker.** No congratulation. No "great news!".
- **Write to `.fullvision/reports/<skill>/YYYY-MM-DD.md`** in the working directory, and print
  the path.
