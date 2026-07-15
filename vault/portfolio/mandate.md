---
status: working
base_currency: SGD
mandate_updated: 2026-07-15
---

# Investment mandate

This is the working policy for portfolio analysis. The investor may revise it;
agents may identify gaps and propose changes but may not change the mandate or
execute portfolio actions without explicit approval.

The `working` status permits investor-supplied holdings and cash to be recorded
and validated as factual state. The investor must change it to `confirmed`
before derived portfolio analysis, opportunity comparisons, or recommendations.

## Objective and horizon

- Compound purchasing power over a multi-year horizon, normally five years or
  longer.
- Prefer understandable businesses whose conservative value exceeds price by a
  meaningful margin.
- Avoid permanent capital loss; short-term price volatility alone is not the
  definition of risk.

## Base currency and universe

- **Base currency:** SGD, as a working default to be confirmed by the investor.
- **Universe:** publicly listed equities globally, with an Asia-market focus.
- No single screening attribute establishes eligibility.

## Portfolio and risk principles

- Evaluate business durability, balance-sheet resilience, governance, minority
  shareholder treatment, valuation, liquidity, currency, and correlated risks.
- Compare every proposed addition with cash and the weakest current holding.
- Concentration is permitted only when evidence, downside resilience, and the
  margin of safety support it. No fixed position limit has yet been set.
- There is no standing authority for leverage, short selling, derivatives, or
  illiquid private investments. Each requires an explicit mandate change.
- Holdings, cash, prices, and FX inputs must be dated and sourced. Derived
  weights and exposures must come from scripts or financial models.
- In portfolio CSVs, `fx_to_base` means units of base currency for one unit of
  the source currency. Listing-currency exposure is not a substitute for
  analyzing a company's underlying economic currency exposure.

## Review cadence and triggers

- Review a company after material results, capital allocation, governance,
  financing, regulatory, or thesis-changing events.
- Review the portfolio as a whole at least quarterly as a working default.
- Review this mandate annually or after a material change in the investor's
  objectives or constraints.

## Decision rights

- **Agents:** gather evidence, calculate, analyze, challenge, compare, and
  propose.
- **Investor:** authorize watchlist, buy, sell, position-size, and mandate
  decisions.
- `portfolio_status: holding` records actual ownership, not research approval.
  Existing holdings may be recorded before valuation is complete.
- A proposed action is not a holding until the investor confirms it and
  `vault/portfolio/holdings.csv` is updated.

## Investor details still to confirm

- Liquidity needs and emergency-cash requirements
- Tax, account, ethical, and legal constraints
- Maximum acceptable position, sector, country, and currency exposures
- Performance benchmark and review-period expectations
