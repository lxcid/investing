"""Calculate Raffles Medical's initial FY2025 and price-snapshot metrics.

Inputs are reported in SGD thousands except per-share data and share counts.
The output is a dated market snapshot, not an intrinsic-value estimate.
"""

from __future__ import annotations

import json
from pathlib import Path


COMPANY_DIR = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def pct_change(current: float, prior: float) -> float:
    return (current / prior - 1) * 100


def main() -> None:
    financials = load_json(COMPANY_DIR / "financials" / "fy2025.json")
    market = load_json(COMPANY_DIR / "market-data" / "2026-07-15-price.json")

    income = financials["income_statement"]
    position = financials["financial_position"]
    cash_flow = financials["cash_flow"]
    capital = financials["capital_structure"]
    geography = financials["geography"]
    price = market["price"]
    shares = capital["issued_shares_excluding_treasury_as_of_2026_05_18"]

    market_cap_m = price * shares / 1_000_000
    borrowings_m = (
        position["borrowings_current"] + position["borrowings_non_current"]
    ) / 1000
    lease_liabilities_m = (
        position["lease_liabilities_current"]
        + position["lease_liabilities_non_current"]
    ) / 1000
    cash_m = position["cash_and_cash_equivalents"] / 1000
    net_cash_ex_leases_m = cash_m - borrowings_m
    net_cash_after_leases_m = net_cash_ex_leases_m - lease_liabilities_m

    fcf_before_lease_m = (
        cash_flow["net_cash_from_operating_activities"]
        - cash_flow["purchase_of_property_plant_and_equipment"]
        - cash_flow["acquisition_of_intangible_assets"]
    ) / 1000
    fcf_after_lease_m = (
        fcf_before_lease_m - cash_flow["payment_of_lease_liabilities"] / 1000
    )

    segment_metrics = {}
    for name, segment in financials["segments"].items():
        metric = {
            "revenue_growth_pct": pct_change(
                segment["revenue"], segment["revenue_prior"]
            ),
            "profit_before_tax_margin_pct": (
                segment["profit_before_tax"] / segment["revenue"] * 100
            ),
        }
        if segment["profit_before_tax"] < 0 and segment["profit_before_tax_prior"] < 0:
            metric["pretax_loss_reduction_pct"] = (
                (
                    abs(segment["profit_before_tax_prior"])
                    - abs(segment["profit_before_tax"])
                )
                / abs(segment["profit_before_tax_prior"])
                * 100
            )
        else:
            metric["profit_before_tax_growth_pct"] = pct_change(
                segment["profit_before_tax"], segment["profit_before_tax_prior"]
            )
        segment_metrics[name] = metric

    total_geo_assets = sum(
        geography[
            "non_current_assets_excluding_financial_instruments_and_deferred_tax"
        ].values()
    )

    output = {
        "basis": {
            "financial_period": financials["period_end"],
            "price_date": market["as_of"],
            "currency": financials["currency"],
            "share_count_date": "2026-05-18",
        },
        "operating_metrics": {
            "revenue_growth_pct": pct_change(
                income["revenue"], income["revenue_prior"]
            ),
            "ebitda_margin_pct": income["ebitda"] / income["revenue"] * 100,
            "operating_margin_pct": (
                income["operating_profit"] / income["revenue"] * 100
            ),
            "patmi_growth_pct": pct_change(income["patmi"], income["patmi_prior"]),
            "patmi_margin_pct": income["patmi"] / income["revenue"] * 100,
            "operating_cash_flow_to_patmi_pct": (
                cash_flow["net_cash_from_operating_activities"]
                / income["patmi"]
                * 100
            ),
            "investment_property_fair_value_gain_pct_of_pbt": (
                income["investment_property_fair_value_gain"]
                / income["profit_before_tax"]
                * 100
            ),
            "cash_fcf_before_lease_principal_sgd_m": fcf_before_lease_m,
            "cash_fcf_after_lease_principal_sgd_m": fcf_after_lease_m,
        },
        "balance_sheet_metrics": {
            "net_cash_excluding_leases_sgd_m": net_cash_ex_leases_m,
            "net_cash_after_lease_liabilities_sgd_m": net_cash_after_leases_m,
            "net_cash_excluding_leases_per_share_sgd": (
                net_cash_ex_leases_m * 1_000_000 / shares
            ),
            "net_cash_after_lease_liabilities_per_share_sgd": (
                net_cash_after_leases_m * 1_000_000 / shares
            ),
            "investment_properties_per_share_sgd": (
                position["investment_properties"] * 1000 / shares
            ),
        },
        "market_metrics": {
            "price_sgd": price,
            "market_cap_sgd_m": market_cap_m,
            "reported_pe_x": price / income["diluted_eps_sgd"],
            "reported_earnings_yield_pct": income["diluted_eps_sgd"] / price * 100,
            "price_to_book_x": (
                market_cap_m / (position["equity_attributable_to_owners"] / 1000)
            ),
            "price_to_sales_x": market_cap_m / (income["revenue"] / 1000),
            "dividend_yield_pct": (
                financials["dividend"]["fy2025_final_dividend_per_share_sgd"]
                / price
                * 100
            ),
            "enterprise_value_excluding_leases_sgd_m": (
                market_cap_m + borrowings_m - cash_m
            ),
            "enterprise_value_including_leases_sgd_m": (
                market_cap_m + borrowings_m + lease_liabilities_m - cash_m
            ),
            "ev_to_ebitda_excluding_leases_x": (
                (market_cap_m + borrowings_m - cash_m) / (income["ebitda"] / 1000)
            ),
            "ev_to_ebitda_including_leases_x": (
                (market_cap_m + borrowings_m + lease_liabilities_m - cash_m)
                / (income["ebitda"] / 1000)
            ),
            "price_to_cash_fcf_before_lease_principal_x": (
                market_cap_m / fcf_before_lease_m
            ),
            "cash_fcf_yield_before_lease_principal_pct": (
                fcf_before_lease_m / market_cap_m * 100
            ),
            "price_to_cash_fcf_after_lease_principal_x": (
                market_cap_m / fcf_after_lease_m
            ),
            "cash_fcf_yield_after_lease_principal_pct": (
                fcf_after_lease_m / market_cap_m * 100
            ),
            "position_within_52_week_range_pct": (
                (price - market["week_52_low"])
                / (market["week_52_high"] - market["week_52_low"])
                * 100
            ),
            "premium_to_52_week_low_pct": (
                price / market["week_52_low"] - 1
            )
            * 100,
            "discount_to_52_week_high_pct": (
                1 - price / market["week_52_high"]
            )
            * 100,
        },
        "concentration_metrics": {
            "greater_china_revenue_pct": (
                geography["revenue"]["greater_china"] / income["revenue"] * 100
            ),
            "greater_china_non_current_assets_pct": (
                geography[
                    "non_current_assets_excluding_financial_instruments_and_deferred_tax"
                ]["greater_china"]
                / total_geo_assets
                * 100
            ),
            "major_customer_revenue_pct": (
                geography["major_customer_revenue"] / income["revenue"] * 100
            ),
            "founder_total_interest_pct": capital[
                "founder_total_interest_pct_as_of_2026_05_18"
            ],
            "options_outstanding_pct_of_current_shares": (
                capital["options_outstanding_as_of_2025_12_31"] / shares * 100
            ),
        },
        "segment_metrics": segment_metrics,
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
