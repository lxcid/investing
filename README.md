# Investment research

An evidence-first, local repository for managing and analyzing a long-term
investment portfolio. The research has an Asia-market focus, but the mandate is
not limited by geography. GFM Markdown with Obsidian-style wiki links and embeds
is the working interface, original filings are the evidence, financial models
own repeatable calculations, and the investor makes the decision.

## Investment philosophy

The goal is to operate like a disciplined, owner-oriented portfolio manager,
drawing heavily from Warren Buffett and Charlie Munger:

- Treat a share as partial ownership of a business, not a ticker to trade.
- Estimate value conservatively and demand a margin of safety.
- Look for a good business selling below its underlying value: the investment
  equivalent of finding a worthwhile item discounted at the supermarket.
- Remember that a low price alone is not value. The item may be unwanted,
  damaged, or deteriorating; a cheap stock may be a value trap.
- Prefer durable economics, trustworthy management, sensible capital allocation,
  and the patience to wait when no opportunity is compelling.
- Record the original reasoning and disconfirming evidence so results can be
  judged without hindsight.

These are influences, not universal rules. Much of Buffett and Munger's record
and investing context is rooted in the United States. Asian and other markets
can differ in governance, controlling shareholders, disclosure, liquidity,
currency, regulation, and the role of governments. Ideas must be tested against
local evidence rather than transferred mechanically. The research process
should continue learning from credible investors with experience across Asia
and other non-US markets.

## Portfolio management

The repository separates authoritative state from derived analysis. All
human-maintained investment content lives under `vault/`; applications and
tools only read or validate it.

- `vault/portfolio/mandate.md` defines the objective, scope, constraints, risk
  lens, review cadence, and decision rights.
- `vault/portfolio/holdings.csv` and `vault/portfolio/cash.csv` record factual
  current positions and cash, including existing positions whose research is
  incomplete. Weights and exposures are calculated, never hand-maintained.
- Each company `index.md` owns company identity and research/portfolio status.
- `vault/portfolio/watchlist.csv` only records why and when a company should be
  reviewed.
- `vault/portfolio/decisions.md` preserves dated decisions and the thesis
  version used at the time.
- `vault/portfolio/evaluation-log.jsonl` stores typed, append-only workflow
  evaluations validated against `vault/schemas/evaluation-log.schema.json`.

Agents analyze evidence, challenge assumptions, calculate repeatable outputs,
and propose actions. Only the investor authorizes portfolio decisions.

The first tracked company is [Raffles Medical Group Ltd
(SGX: BSL)](vault/companies/SGX/BSL_Raffles-Medical-Group/index.md). It is currently a
watchlist candidate; no holding, price, or valuation has been assumed.

## Repository layout

```text
vault/                          Authoritative investment content
  portfolio/                    Mandate, current state, decisions, and reviews
  companies/
    <exchange>/
      <ticker>_<short-name>/
        index.md                Identity, status, and timestamped metadata
        thesis.md               Versioned current investment thesis
        valuation.md            Scenarios and calculated margin of safety
        scorecard.md            Anchored assessments with confidence and evidence
        questions.md            Open research questions
        timeline.md             Material company events
        sources/                Original, unmodified evidence
        extracted/              Machine-readable derivatives
        analysis/               Interpretation and investor judgment
        models/                 Financial inputs and calculated outputs
  templates/                    Starting points for repeatable work
  schemas/                      Contracts for machine-readable records
docs/                           Research method and project boundaries
apps/
  portfolio-tools/              Moon/uv portfolio validation and analysis
  portfolio-reader/             Moon/Node research-reading web application
.agents/skills/                 Narrow repository workflows, added when proven
```

Only create the subdirectories a company actually needs. Keep original sources,
extracted material, financial models, and analysis separate.

## Start the experiment

1. Research BSL as the first tracked candidate, then add one financial company
   and one income vehicle such as a REIT for sector contrast.
2. Create the exchange directory, then copy `vault/templates/company/` to
   `vault/companies/<exchange>/<ticker>_<short-name>/`.
3. Add primary documents under `sources/` without modifying them.
4. Build a cited company profile and normalized financial history.
5. Record actual ownership as `portfolio_status: holding`, even when valuation
   is incomplete. Complete `valuation.md` before claiming a margin of safety or
   proposing a purchase.
6. Record substantive reviews in `vault/portfolio/evaluation-log.jsonl` and
   portfolio decisions in `vault/portfolio/decisions.md`.
7. Expand toward 10-20 companies only after the first folders are useful.

See [docs/research-method.md](docs/research-method.md) for the workflow and
[AGENTS.md](AGENTS.md) for repository rules followed by agents.

Repository skills can be added under `.agents/skills/` as repeated manual
workflows become clear. A skill should encode a narrow, auditable process; it
should not replace the evidence rules or the investor's decision authority.

## Portfolio commands

The repository pins Moon 2.4.3, Node.js 26, pnpm, and uv in `.prototools`. Moon
orchestrates tasks; uv owns the Python project environment and lockfile, while
the research-reading app owns its pnpm dependencies and lockfile. There is
intentionally no root package or uv workspace.

```sh
proto install
moon run portfolio-tools:validate
moon run portfolio-tools:test
moon run portfolio-tools:summary
moon run portfolio-reader:dev
moon run portfolio-reader:test
```

The web application is a read-only bridge to the research, not a competing
system of record. Markdown, CSV, JSON, and preserved source documents remain
authoritative. The app may improve navigation and comprehension, but it must
not silently write research or convert signals into portfolio decisions.

Validation reads the base currency from `vault/portfolio/mandate.md`; there is no
independent command default. `validate` accepts factual holdings and cash under
a working mandate, while `summary` requires a confirmed mandate before deriving
weights or position-currency exposure. Both commands reject observations after
the current local date. The current-state CSVs do not reconstruct historical
portfolio state.

The initial holdings contract expects a complete dated price and FX group. Test
that assumption during real portfolio onboarding; if a truthful position lacks
a usable market observation, revise the representation rather than inventing a
value or omitting ownership.

## Working principle

> Scripts and financial models calculate. Agents analyze with cited evidence.
> The investor decides.
