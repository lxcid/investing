# Research method

## Scope of the first experiment

Begin with three complete company folders in the current focus markets, then
expand to a 10-20 company research universe. The initial universe can be
centered on SGX or another Asian market without making that geography a
permanent boundary.

Dividend payment, limited analyst coverage, small capitalization, and recent
unpopularity are not evidence of value. For any controlling shareholder,
whether family, founder, state, parent company, or other, assess economic and
voting alignment, capital allocation, succession and key-person dependence,
related-party transactions, and minority-shareholder treatment.

The goal is to test research quality, portfolio usefulness, and time saved, not
whether an agent can pick winning stocks.

## Evidence layers

Keep these layers separate and make the layer of every important conclusion
clear:

1. **Sources:** original filings, results, presentations, announcements, and
   transcripts. These are immutable evidence.
2. **Extracted:** text, tables, and structured facts derived from a source.
3. **Financial models:** timestamped inputs, assumptions, calculations, and
   scenarios.
4. **Analysis:** interpretation, thesis tests, risks, and investor judgment.

## Research stages

### 1. Screening

Use structured data and scripts to examine earning power, free cash flow where
applicable, leverage, interest coverage, dilution, returns on capital, and
valuation versus history or peers. Investigate anomalies rather than smoothing
them away. Do not add style filters or catalyst requirements unless an
experiment has produced evidence that the filter adds value.

### 2. Business understanding

Explain how the company makes money, segment and geographic exposure, revenue
and margin drivers, concentration, cyclicality, reinvestment needs, industry
structure, competitive advantages, governance, and ways profitability could
disappear.

### 3. Valuation and mispricing

Ask: **What must the market believe for the current price to be reasonable?**
Complete `valuation.md` with a dated price and source, normalized economics,
share count and dilution, balance-sheet or equity-value bridge, explicit
assumptions, conservative/base/downside value ranges, and a calculated margin of
safety. Test implied assumptions against history, peers, primary evidence, and
downside scenarios.

Use sector-appropriate mechanics:

- **Operating companies:** normalized owner earnings or free cash flow,
  reinvestment needs, net debt, dilution, and enterprise-to-equity bridge.
- **Banks:** normalized earnings and ROE, book value, capital adequacy, credit
  losses, and sustainable distributions; do not apply an ordinary-company
  enterprise-value bridge mechanically.
- **REITs:** normalized distributable income or AFFO, DPU, NAV, leverage,
  interest costs, cap rates, and equity funding requirements.

Distinguish a discounted security from a deteriorating business.

### 4. Monitoring

For each new result or announcement, determine what changed and whether it
affects the thesis, valuation, margin of safety, distributions when applicable,
or required action. Use `vault/templates/review-update.md`; do not rewrite the
thesis for routine noise.

### 5. Portfolio analysis

Read the mandate, holdings, and cash records before proposing an action. Compare
an opportunity with existing holdings and cash, not only with an absolute
hurdle. Calculate weights and listing/cash-currency exposures from source
tables; do not store derived values manually. Analyze underlying business
currency exposure separately. Consider concentration, liquidity, correlated
risks, valuation-date mismatch, and the opportunity cost of the weakest current
holding.

## Experiment log

Record every substantive agent-assisted review in
`vault/portfolio/evaluation-log.jsonl`. Each line must satisfy
`vault/schemas/evaluation-log.schema.json`; validate it with
`moon run portfolio-tools:validate`. Judge factual and citation accuracy, new
insight, decision relevance, consistency, time saved, and follow-up action.
After 20-30 entries, create a dated retrospective workflow review under
`vault/portfolio/evaluation-reviews/`. Assess false confidence and missed material
facts using evidence that became available after the original reviews. Do not
fill retrospective fields at intake.

A useful historical test is to replay old announcements in chronological order,
without using later information, and see whether the process identifies material
changes without overreacting to noise. Portfolio replay requires an immutable
dated snapshot or a Git worktree at the relevant historical commit; the current
portfolio tables alone cannot reconstruct earlier state.

## Deliberately deferred

Do not add a custom interface, vector or graph database, full-exchange crawler,
real-time market feed, autonomous trading, automatic recommendations, portfolio
optimizer, or multi-agent orchestration until the local workflow exposes a
specific limitation.
