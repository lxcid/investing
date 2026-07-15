# Valuation

## Status

Initial price and market-multiple snapshot complete. Normalized earning power,
intrinsic value, and margin of safety have not been calculated.

## Valuation basis

| Field | Value | Source |
|---|---|---|
| Valuation date | 2026-07-15 | |
| Current price | SGD 0.940 at 17:04 SGT | [[sources/market-data/2026-07-15-google-finance.html|Google Finance price snapshot]] |
| Shares outstanding | 1,840,190,875 issued shares excluding treasury, as at 2026-05-18 | [[sources/announcements/2026-05-19-director-interest-loo-choon-yong.pdf|Director-interest disclosure]] |
| Potential dilution | 78.707m options outstanding at 2025-12-31; 62.574m were anti-dilutive for FY2025 EPS | [[sources/annual-reports/fy2025.pdf#page=181|FY2025 annual report, PDF p. 181]] [[sources/annual-reports/fy2025.pdf#page=214|FY2025 annual report, PDF p. 214]] |
| Net debt / (cash) | SGD (261.1)m before lease liabilities; SGD (223.4)m after lease liabilities | [[sources/annual-reports/fy2025.pdf#page=136|FY2025 annual report, PDF p. 136]] |
| Non-operating adjustments | Not yet determined; investment properties carry SGD 233.6m at fair value | [[sources/annual-reports/fy2025.pdf#page=170|FY2025 annual report, PDF p. 170]] |

## Normalized economics

Not completed. FY2025 provides the following one-year reference points:

| Reference metric | Value | Classification / limitation |
|---|---:|---|
| PATMI | SGD 70.6m | Reported fact; includes the effect of a SGD 4.7m pretax investment-property fair-value gain |
| Diluted EPS | SGD 0.0381 | Reported fact |
| Operating cash flow | SGD 101.3m | Reported fact; includes insurance and working-capital movements |
| Cash FCF before lease principal | SGD 91.3m | Calculated proxy: operating cash flow less cash purchases of PPE and intangibles |
| Cash FCF after lease principal | SGD 79.9m | Calculated proxy: preceding amount less lease-principal payments |

Neither cash FCF proxy is normalized owner earnings. Maintenance versus growth
capital spending and the post-COVID earnings base remain unresolved.
[[sources/annual-reports/fy2025.pdf#page=137|FY2025 annual report, PDF p. 137]]
[[sources/annual-reports/fy2025.pdf#page=141|FY2025 annual report, PDF p. 141]]

## Method and sector fit

RMG should ultimately be valued as an operating healthcare group with separate
checks on:

1. normalized owner earnings from Singapore Healthcare and Hospital Services;
2. insurance economics and required regulatory capital;
3. China hospital losses, breakeven requirements, and recoverable asset values;
4. genuinely separable investment properties and excess cash; and
5. share-option dilution.

No method has yet been populated because China hospital and insurance economics
are insufficiently disclosed for a conservative normalized estimate.

## Equity-value bridge

| Component | Value | Evidence / rationale |
|---|---:|---|
| Enterprise or asset value | — | Not estimated |
| Add: excess cash and non-operating assets | — | Cash is SGD 310.8m, but required operating and insurance liquidity is not established |
| Less: debt and debt-like liabilities | — | Borrowings are SGD 49.7m and leases are SGD 37.7m; final treatment depends on the selected method |
| Other adjustments | — | Investment properties, China assets, and option dilution require separate analysis |
| Equity value | — | Not estimated |
| Diluted shares | — | Not selected; current issued and FY2025 diluted weighted-average counts are both recorded |
| Value per share | — | Not estimated |

## Assumptions

| Assumption | Downside | Base | Conservative upside | Evidence / rationale |
|---|---:|---:|---:|---|

Not populated.

## Value range

| Scenario | Equity value | Value per share | Margin of safety |
|---|---:|---:|---:|
| Downside | — | — | — |
| Base | — | — | — |
| Conservative upside | — | — | — |

Margin of safety = `(estimated value per share - current price) / estimated value per share`.

No margin of safety is reported because no value range has been completed.

## Observed market multiples

| Metric | Value |
|---|---:|
| Market capitalisation | SGD 1.730bn |
| Reported P/E | 24.67x |
| Reported earnings yield | 4.05% |
| Price / book | 1.63x |
| Price / sales | 2.26x |
| EV / EBITDA, including lease liabilities | 11.16x |
| FY2025 final-dividend yield | 3.19% |
| Cash FCF yield before lease principal | 5.28% |
| Cash FCF yield after lease principal | 4.62% |

These are calculated metrics from
[[models/initial_metrics.py|the repeatable metrics model]], using the dated
market and financial inputs. They are not intrinsic-value estimates.

## Reverse expectations

Not yet modeled. At 24.67x reported earnings, the market is not pricing a simple
liquidation or no-growth case. A reverse model should test the hospital margin,
China breakeven, insurance profitability, and reinvestment assumptions required
to earn an adequate return from SGD 0.940.

## Sensitivities and failure cases

- Continued losses or impairment at the Shanghai and Chongqing hospitals
- Reversal of FY2025 Hospital Services margin gains
- Persistent insurance claims inflation and negative segment PBT
- Cash conversion reverting as insurance and working capital normalize
- Higher maintenance capital expenditure than the one-year cash-spending figure
- Option dilution or capital allocation that offsets per-share progress
- Property values proving inseparable from low-return operations
