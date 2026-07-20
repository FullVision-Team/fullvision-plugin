---
name: fv-build-audience
description: Turn a described segment into a sized, floor-checked, consent-gated audience with a chosen destination. Emits an activation change-list; activation itself happens in the FullVision app.
cadence: on-demand
requires: [fullvision]
writes: []
---

# fv-build-audience

Describe a segment, get back a real one: sized, checked against the destination platform's
minimum, and gated on consent. The gate is the point of this skill — the segment SQL is the
easy part.

Read `shared/reading-fullvision-data.md`, `shared/safety-rails.md` and
`shared/sparse-data.md` before calling anything. All three are binding.

## Preflight — non-negotiable, in this order

```
1. size the segment
2. check the platform floor  → route to email if it cannot clear it
3. check the consent flag    → no consent ⇒ REFUSE ad upload, offer email
4. pick the destination
```

Never reorder these. Sizing before consent means proposing an upload that must then be
retracted.

### 1. Size

Compile the description to a ClickHouse SELECT. Use `fullvision:compile_custom_view` to check
it compiles, then `fullvision:run_sql_query` to count (`$USER_ID` required in every WHERE).
Report the raw count **and** the emailable count — they differ.

### 2. Floor

| Destination | Floor | Raw list needed at B2B ~20% match |
|---|---|---|
| Google Customer Match | 100 matched (lowered from 1,000 in 2026) | ~500 |
| Meta Custom Audiences | 100 matched | 300–500 |
| LinkedIn Matched Audiences | 300 matched (LinkedIn recommends 50k) | **1,500+** |

The ~20% B2B match rate is structural — people buy with work emails and use personal ones on
ad platforms. Do not model a higher rate optimistically. If the raw list cannot clear the
floor, **route to email** and say why; do not upload a list that will sit unmatched.

### 3. Consent — a hard gate, not a warning

A German DPA has ruled that uploading customer lists to ad platforms without explicit consent
is illegal **even when hashed**, and rejected legitimate interest as a basis. Google requires
`ad_user_data` and `ad_personalization` both GRANTED per EEA user, with **no B2B or
work-email carve-out**.

Therefore:

- **No ad-platform upload without a verifiable consent flag on the contact record.** Not an
  assumption, not an inference from "they're a customer" — a flag.
- **Email/ESP activation is the default for EU B2B**, not the fallback.
- If the consent flag does not exist in the data at all, that is a refusal, not a caveat.
  Say the field is missing and stop.

### 4. Destination

Google Customer Match / Meta Custom Audience / LinkedIn Matched Audience / Brevo. Pick based
on floor clearance and consent state, and state which you picked and why.

## Activation — read-only in v1

Audience create/sync is not exposed on the FullVision MCP surface. Per
`shared/safety-rails.md` §9 this is read-only mode, not an error:

1. Emit the compiled SQL, the size, the emailable count, the floor verdict, the consent
   verdict and the chosen destination as a change-list artifact.
2. Point the user at the FullVision app to create the audience and enable the automation.
   Delivery then runs on FullVision's existing audience-delivery cron (Customer Match / Meta
   Custom Audience) — **not** from this plugin.
3. Do not attempt to upload contacts from here under any circumstance, even if a platform MCP
   with write access is connected. The consent gate and the delivery ledger both live
   server-side, and bypassing them is exactly the failure this skill exists to prevent.

## Refuse when

- The consent flag is absent from the data, or GRANTED for fewer contacts than the floor.
- The segment cannot clear any destination's floor, including email.
- The description implies a special-category segment (health, ethnicity, political, sexual
  orientation, religion, trade-union membership) — refuse outright, in any jurisdiction.
- `fv-data-health` returns 🚩 — segment membership would be built on broken identity data.
