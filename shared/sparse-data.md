# Sparse-data protocol

B2B conversion volume is low, sales cycles are long, and multi-touch attribution is
structurally unreliable. Deterministic MTA has been measured crediting web search with 78% of
conversions where 12% of the same buyers self-reported it, and roughly 60% of B2B buying
happens dark-funnel. An LLM handed 3 conversions will rank them confidently. Do not let it.

## 1. Every skill declares a minimum n and refuses below it

Stated as a fixed number in the skill's own frontmatter/body. The refusal is explicit:

> Not enough data to judge `Campaign X`: 3 payers over 90 days (minimum 8). At this volume the
> ROAS estimate's confidence interval spans profitable and unprofitable. No recommendation.

Never "ranked anyway, treat with caution."

## 2. Confidence at 80–90%, not 95%

Matching B2B practice — at these volumes a 95% bar rejects everything and the skill becomes
useless. State the level used in the output, every time.

## 3. Shrinkage over raw counts

Small-sample estimates are pulled toward the account mean, not trusted at face value. For a
campaign with `n` conversions and account mean ROAS `m`:

```
shrunk_roas = (n × observed_roas + k × m) / (n + k)      # k = 10, the prior weight
```

Rank on `shrunk_roas`. Report both. A campaign with 2 conversions and ROAS 8.0 shrinks to
roughly the account mean, which is the honest answer.

## 4. Attributed revenue is evidence, never ground truth

At low volume, a pause recommendation requires a **corroborating signal** alongside low ROAS —
one of: zero pipeline in CRM, near-zero engaged sessions from that source, no assisted
conversions in any attribution model, or a landing-page bounce profile far off the account
baseline. ROAS alone is not sufficient to spend the customer's money differently.

## 5. Never propose an A/B test the traffic can't power

Below roughly **10,000 visitors/month** on the page in question, do not propose a variant
test. The honest recommendation is qualitative: 5 user tests surface ~80% of usability
issues; 10–15 session recordings surface 70–85%. Say that instead of proposing an
underpowered test that will read as noise for six weeks.

If the traffic does support a test, state the required sample size and expected duration
before proposing it.
