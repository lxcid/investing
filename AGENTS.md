# AGENTS.md

This repository helps the investor manage and analyze a long-term,
evidence-backed portfolio. It is not a trading system. Keep changes small,
inspectable, and easy to undo.

The mandate is global value investing with an Asia-market focus. Warren Buffett
and Charlie Munger are major influences: think like a business owner, estimate
value conservatively, and require a margin of safety. Do not transfer their
US-market conclusions mechanically to other markets. Test every principle
against local governance, ownership, disclosure, liquidity, currency,
regulation, and market structure, and remain open to learning from credible
investors with experience in Asia and other non-US markets.

## Decision rights

Agents may collect and classify evidence, calculate repeatable outputs, compare
opportunities, challenge theses, and propose actions. Only the investor may
authorize a buy, sell, position size, mandate change, or other portfolio action.
Do not represent a proposal as an executed decision.

## Sources of truth

- `vault/portfolio/mandate.md` is authoritative for objectives, constraints,
  risk, cadence, and decision rights.
- `vault/portfolio/holdings.csv` and `vault/portfolio/cash.csv` are authoritative
  for current owned positions and cash. Never infer ownership from a watchlist
  or thesis.
- A company `index.md` is authoritative for identity, listing quote currency
  (`currency`), `research_status`, and `portfolio_status`. The listing currency
  must match `price_currency` in holdings; analyze reporting and underlying
  business currencies separately.
- `vault/portfolio/watchlist.csv` owns review scheduling and the reason for tracking;
  it must not duplicate company identity or status fields.
- `vault/portfolio/decisions.md` is an append-only decision record.
- `vault/portfolio/evaluation-log.jsonl` is the typed append-only evaluation
  record; `vault/schemas/evaluation-log.schema.json` is its versioned contract.

Use `vault/companies/<exchange>/<ticker>_<short-name>` as `company_path` in
portfolio tables and logs. Ticker alone is not a valid cross-market identifier.

Allowed status values are:

- `research_status`: `candidate`, `active`, `monitoring`, or `archived`.
- `portfolio_status`: `none`, `watchlist`, `holding`, or `exited`.

`portfolio_status: holding` means the investor actually owns the security. It
is a factual state, not a research or valuation approval. Record
investor-supplied holdings and cash faithfully even when research is incomplete
or the mandate has `status: working`.

Only the investor may confirm or change the mandate. A working mandate permits
factual state validation but not derived weights, exposures, opportunity
comparisons, recommendations, or other portfolio analysis.

## Non-negotiable research rules

- Never alter an original file under a company's `sources/` directory.
- Keep source evidence, extracted content, financial calculations, and analysis
  in their respective directories. Do not silently blend them.
- Classify important statements as one of: **reported fact**, **calculated
  metric**, **management claim**, **agent inference**, or **investor judgment**.
- Cite material claims to a local source and page or section when available. Use
  a repository-relative Obsidian link such as
  `[[vault/companies/SGX/D05_DBS/sources/annual-reports/fy2025.pdf#page=84|FY2025 annual report, p. 84]]`.
- State when evidence is absent, ambiguous, stale, or contradictory. Never fill
  gaps with invented values.
- Put repeatable arithmetic in a script or financial model. Include the input
  period, currency, units, formula or assumptions, and data source.
- Never claim a margin of safety without a completed, dated `valuation.md` that
  states the current price, source, normalized economics, value range, and
  calculation.
- Require completed valuation work before proposing a purchase, not before
  recording an existing holding.

## Thesis and decision discipline

`thesis.md` is a maintained decision artifact, not an automatically regenerated
summary. Give each deliberate thesis review a version such as `2026-07-15-v1`
and record it in the file frontmatter. A new filing or announcement should first
produce a review based on `vault/templates/review-update.md`.

Change a thesis only when asked to perform a deliberate thesis review. Update
the version, append a dated explanation of the evidence and rationale, and
commit the thesis before recording any dependent portfolio decision. A decision
must record the thesis version and Git commit, or link to an immutable dated
review artifact. A link to the mutable current thesis alone is insufficient.

When challenging a thesis, seek the strongest contrary evidence rather than
merely producing another bullish or bearish summary.

## Default workflow

1. Read `vault/portfolio/mandate.md` for any portfolio or decision-related task.
2. Read the company `index.md`, `thesis.md`, `valuation.md`, open questions, and
   existing analysis.
3. Inventory relevant local sources and identify missing reporting periods.
4. Extract or calculate before interpreting; retain a trace to each source.
5. Separate what changed from why it may matter.
6. Report materiality, thesis impact, valuation and margin-of-safety impact,
   dividend or distribution impact when applicable, portfolio opportunity cost,
   open questions, and follow-up needed.
7. Add only artifacts that will be reused or audited later.

For screening, scripts own ratios and rankings. For research, an agent may
explain disclosures, compare language, identify inconsistencies, generate
questions, and test assumptions with cited evidence.

## Repository conventions

- Exchanges are first-level directories below `vault/companies/`. Company
  directories use `vault/companies/<exchange>/<ticker>_<short-name>`, for
  example `vault/companies/SGX/D05_DBS`. The short-name suffix must be non-empty;
  exchange and ticker identify the listing and must be unique together.
- Use ISO dates (`YYYY-MM-DD`) and state the currency and units beside figures.
- Write GitHub-Flavored Markdown. In vault research notes, use Obsidian
  `[[wiki links]]` for internal references and `![[embeds]]` when transclusion
  adds useful context. Use ordinary Markdown links in GitHub-facing files such
  as `README.md`. Prefer vault-relative wiki-link targets and use full paths when
  a short filename is ambiguous.
- Keep stable company metadata in the YAML frontmatter of `index.md`; do not
  create a separate `company.yaml`. Whenever frontmatter changes, update
  `metadata_updated` with the current ISO date.
- Use Markdown for narrative reasoning, CSV for flat current state, JSONL for
  typed append-only records with a committed schema, and JSON for individual
  structured snapshots. Do not keep competing formats for one source of truth.
- Preserve user-written judgments and unrelated working-tree changes.
- Do not add a user interface, database, crawler, live feed, agent framework, or
  other infrastructure until a documented research limitation requires it.
- Do not commit secrets, paid research without permission, or personal account
  data.

## Portfolio tooling

Moon is the repository task orchestrator and uv owns the Python environment and
lockfile for `apps/portfolio-tools`. Use the pinned commands from the repository
root:

```text
moon run portfolio-tools:validate
moon run portfolio-tools:test
moon run portfolio-tools:summary
```

Do not bypass validation with ad hoc calculations. The validation command must
pass before presenting portfolio weights or exposures as current analysis.

## Repository skills

Put a proven, repeatable workflow in `.agents/skills/<skill-name>/SKILL.md` only
when the manual workflow and its evidence contract are understood. Skills must
follow this file, preserve human decision authority, and avoid hidden portfolio
state. Do not create a skill merely to hold generic investment prose.

## Commit policy

Use Conventional Commits. Software changes use `feat`, `fix`, `refactor`,
`test`, `docs`, or `chore`. Investment work uses:

- `research(EXCHANGE-TICKER)` for evidence collection or business analysis with
  no thesis change.
- `review(EXCHANGE-TICKER)` for a filing or announcement review.
- `valuation(EXCHANGE-TICKER)` for changed valuation inputs, methods, or ranges.
- `thesis(EXCHANGE-TICKER)` for a deliberate versioned thesis change.
- `decision(EXCHANGE-TICKER)` only after an investor-authorized portfolio
  decision.
- `mandate(portfolio)` only after an investor-authorized mandate change.

Add material trailers when applicable:

```text
Company-Path: vault/companies/SGX/D05_DBS
Thesis-Version: 2026-07-15-v1
Thesis-Commit: <commit>
Decision-Authority: investor
```
