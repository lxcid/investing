from __future__ import annotations

import csv
import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from investing_portfolio_tools.portfolio_summary import (
    CASH_FIELDS,
    HOLDING_FIELDS,
    WATCHLIST_FIELDS,
    PortfolioValidationError,
    build_parser,
    render_summary,
    validate_portfolio,
)

WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_SOURCE = WORKSPACE_ROOT / "vault" / "schemas" / "evaluation-log.schema.json"
COMPANY_PATH = "vault/companies/SGX/AAA_Test"


def write_csv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_mandate(root: Path, *, status: str = "confirmed", base: str = "SGD") -> None:
    (root / "vault" / "portfolio").mkdir(parents=True, exist_ok=True)
    (root / "vault" / "portfolio" / "mandate.md").write_text(
        f"---\nstatus: {status}\nbase_currency: {base}\n---\n\n# Mandate\n",
        encoding="utf-8",
    )


def write_company(
    root: Path,
    *,
    company_path: str = COMPANY_PATH,
    exchange: str = "SGX",
    ticker: str = "AAA",
    portfolio_status: str = "holding",
    currency: str = "SGD",
) -> None:
    directory = root / company_path
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "index.md").write_text(
        "---\n"
        f"ticker: {json.dumps(ticker)}\n"
        f"exchange: {json.dumps(exchange)}\n"
        f"currency: {currency}\n"
        "research_status: active\n"
        f"portfolio_status: {portfolio_status}\n"
        "---\n\n# Test company\n",
        encoding="utf-8",
    )


def holding_row(**overrides: str) -> dict[str, str]:
    row = {
        "company_path": COMPANY_PATH,
        "quantity": "100",
        "average_cost": "1.00",
        "cost_currency": "SGD",
        "position_date": "2026-07-01",
        "position_source": "broker statement",
        "current_price": "1.20",
        "price_currency": "SGD",
        "price_date": "2026-07-15",
        "price_source": "exchange close",
        "fx_to_base": "",
        "fx_date": "",
        "fx_source": "",
        "notes": "",
    }
    row.update(overrides)
    return row


def cash_row(**overrides: str) -> dict[str, str]:
    row = {
        "currency": "SGD",
        "amount": "20",
        "as_of_date": "2026-07-15",
        "source": "broker statement",
        "fx_to_base": "",
        "fx_date": "",
        "fx_source": "",
        "notes": "",
    }
    row.update(overrides)
    return row


def watchlist_row(**overrides: str) -> dict[str, str]:
    row = {
        "company_path": COMPANY_PATH,
        "added_date": "2026-07-15",
        "next_review_date": "",
        "reason": "test",
    }
    row.update(overrides)
    return row


def evaluation_record(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "schema_version": 1,
        "date": "2026-07-15",
        "company_path": COMPANY_PATH,
        "artifact": "analysis/test.md",
        "task": "review",
        "useful": True,
        "new_insight": True,
        "evidence_correct": True,
        "time_saved_minutes": 10,
        "action": "continue",
        "notes": "",
    }
    record.update(overrides)
    return record


def setup_repo(
    root: Path,
    *,
    mandate_status: str = "confirmed",
    base_currency: str = "SGD",
    company_status: str = "holding",
    company_currency: str = "SGD",
    holdings: list[dict[str, str]] | None = None,
    cash: list[dict[str, str]] | None = None,
    watchlist: list[dict[str, str]] | None = None,
) -> None:
    write_mandate(root, status=mandate_status, base=base_currency)
    write_company(
        root, portfolio_status=company_status, currency=company_currency
    )
    write_csv(
        root / "vault" / "portfolio" / "holdings.csv",
        HOLDING_FIELDS,
        [holding_row()] if holdings is None else holdings,
    )
    write_csv(
        root / "vault" / "portfolio" / "cash.csv",
        CASH_FIELDS,
        [] if cash is None else cash,
    )
    write_csv(
        root / "vault" / "portfolio" / "watchlist.csv",
        WATCHLIST_FIELDS,
        [] if watchlist is None else watchlist,
    )
    (root / "vault" / "portfolio" / "evaluation-log.jsonl").write_text(
        "", encoding="utf-8"
    )
    (root / "vault" / "schemas").mkdir(parents=True, exist_ok=True)
    shutil.copy(
        SCHEMA_SOURCE, root / "vault" / "schemas" / "evaluation-log.schema.json"
    )


def test_empty_working_portfolio_is_valid(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        mandate_status="working",
        company_status="watchlist",
        holdings=[],
        watchlist=[watchlist_row(next_review_date="2026-08-15")],
    )

    snapshot = validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))

    assert snapshot.mandate.base_currency == "SGD"
    assert render_summary(snapshot) == "No valued holdings or cash recorded."


def test_cli_rejects_public_as_of_option() -> None:
    with pytest.raises(SystemExit) as error:
        build_parser().parse_args(["validate", "--as-of", "2026-07-20"])

    assert error.value.code == 2


def test_summary_reads_base_currency_from_mandate(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        base_currency="USD",
        company_currency="USD",
        holdings=[
            holding_row(
                cost_currency="USD",
                price_currency="USD",
            )
        ],
    )

    output = render_summary(validate_portfolio(tmp_path))

    assert "120.00 USD" in output
    assert "Total portfolio value: 120.00 USD" in output


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("quantity", "-1", "quantity must be positive"),
        ("average_cost", "0", "average_cost must be positive"),
        ("current_price", "-0.50", "current_price must be positive"),
    ],
)
def test_rejects_invalid_holding_numbers(
    tmp_path: Path, field: str, value: str, expected: str
) -> None:
    setup_repo(tmp_path, holdings=[holding_row(**{field: value})])

    with pytest.raises(PortfolioValidationError, match=expected):
        validate_portfolio(tmp_path)


def test_rejects_duplicate_holdings(tmp_path: Path) -> None:
    setup_repo(tmp_path, holdings=[holding_row(), holding_row()])

    with pytest.raises(PortfolioValidationError, match="duplicate company_path"):
        validate_portfolio(tmp_path)


def test_rejects_duplicate_listing_identity(tmp_path: Path) -> None:
    duplicate_path = "vault/companies/SGX/AAA_Duplicate"
    setup_repo(
        tmp_path,
        holdings=[holding_row(), holding_row(company_path=duplicate_path)],
    )
    write_company(tmp_path, company_path=duplicate_path)

    with pytest.raises(PortfolioValidationError, match="duplicate listing identity"):
        validate_portfolio(tmp_path)


def test_rejects_company_path_without_short_name(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    write_company(
        tmp_path,
        company_path="vault/companies/SGX/AAA",
        portfolio_status="none",
    )

    with pytest.raises(PortfolioValidationError, match="non-empty short name"):
        validate_portfolio(tmp_path)


def test_rejects_blank_ticker(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    write_company(
        tmp_path,
        company_path="vault/companies/SGX/_BlankTicker",
        ticker="",
        portfolio_status="none",
    )

    with pytest.raises(
        PortfolioValidationError, match="ticker must be a non-empty trimmed string"
    ):
        validate_portfolio(tmp_path)


def test_rejects_non_positive_fx(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        company_currency="USD",
        holdings=[
            holding_row(
                price_currency="USD",
                fx_to_base="0",
                fx_date="2026-07-15",
                fx_source="central bank",
            )
        ],
    )

    with pytest.raises(PortfolioValidationError, match="fx_to_base must be positive"):
        validate_portfolio(tmp_path)


def test_rejects_missing_company_path(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        holdings=[holding_row(company_path="vault/companies/SGX/ZZZ_Missing")],
    )

    with pytest.raises(PortfolioValidationError, match="does not exist"):
        validate_portfolio(tmp_path)


def test_rejects_holding_status_mismatch(tmp_path: Path) -> None:
    setup_repo(tmp_path, company_status="watchlist")

    with pytest.raises(PortfolioValidationError, match="expected 'holding'"):
        validate_portfolio(tmp_path)


def test_rejects_missing_watchlist_membership(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        company_status="watchlist",
        holdings=[],
        watchlist=[],
    )

    with pytest.raises(PortfolioValidationError, match="watchlist.csv has no row"):
        validate_portfolio(tmp_path)


def test_rejects_missing_holding_membership(tmp_path: Path) -> None:
    setup_repo(tmp_path, holdings=[])

    with pytest.raises(PortfolioValidationError, match="holdings.csv has no row"):
        validate_portfolio(tmp_path)


def test_working_mandate_accepts_factual_state_but_blocks_summary(
    tmp_path: Path,
) -> None:
    setup_repo(tmp_path, mandate_status="working", cash=[cash_row()])

    snapshot = validate_portfolio(tmp_path)

    assert len(snapshot.holdings) == 1
    assert len(snapshot.cash) == 1

    with pytest.raises(
        PortfolioValidationError, match="status: confirmed before derived"
    ):
        render_summary(snapshot)


def test_rejects_material_fx_date_mismatch(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        company_currency="USD",
        holdings=[
            holding_row(
                price_currency="USD",
                fx_to_base="1.30",
                fx_date="2026-07-01",
                fx_source="central bank",
            )
        ],
    )

    with pytest.raises(PortfolioValidationError, match="differ by more than 7 days"):
        validate_portfolio(tmp_path)


def test_rejects_fx_date_after_value_date(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        company_currency="USD",
        holdings=[
            holding_row(
                price_currency="USD",
                fx_to_base="1.30",
                fx_date="2026-07-20",
                fx_source="central bank",
            )
        ],
    )

    with pytest.raises(PortfolioValidationError, match="cannot be after value date"):
        validate_portfolio(tmp_path)


def test_rejects_position_date_after_price_date(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        holdings=[
            holding_row(
                position_date="2026-07-10",
                price_date="2026-07-05",
            )
        ],
    )

    with pytest.raises(PortfolioValidationError, match="cannot be after price date"):
        validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))


@pytest.mark.parametrize(
    ("field", "expected"),
    [
        ("position_date", "position_date"),
        ("price_date", "price_date"),
    ],
)
def test_rejects_future_holding_dates(
    tmp_path: Path, field: str, expected: str
) -> None:
    setup_repo(tmp_path, holdings=[holding_row(**{field: "2026-07-20"})])

    with pytest.raises(
        PortfolioValidationError,
        match=rf"{expected} .* cannot be after validation as-of date",
    ):
        validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))


def test_rejects_future_cash_date(tmp_path: Path) -> None:
    setup_repo(tmp_path, cash=[cash_row(as_of_date="2026-07-20")])

    with pytest.raises(
        PortfolioValidationError,
        match="as_of_date .* cannot be after validation as-of date",
    ):
        validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))


def test_injected_validation_date_allows_same_day_fixture(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        holdings=[
            holding_row(
                position_date="2026-06-01",
                price_date="2026-06-30",
            )
        ],
        cash=[cash_row(as_of_date="2026-06-30")],
    )

    snapshot = validate_portfolio(tmp_path, as_of_date=date(2026, 6, 30))
    output = render_summary(snapshot)

    assert "Total portfolio value: 140.00 SGD" in output


def test_rejects_price_currency_that_differs_from_listing(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        holdings=[
            holding_row(
                price_currency="USD",
                fx_to_base="1.30",
                fx_date="2026-07-15",
                fx_source="central bank",
            )
        ],
    )

    with pytest.raises(
        PortfolioValidationError, match="does not match company currency"
    ):
        validate_portfolio(tmp_path)


@pytest.mark.parametrize("amount", ["-1", "0"])
def test_rejects_non_positive_cash(tmp_path: Path, amount: str) -> None:
    setup_repo(tmp_path, cash=[cash_row(amount=amount)])

    with pytest.raises(PortfolioValidationError, match="amount must be positive"):
        validate_portfolio(tmp_path)


def test_rejects_watchlist_review_before_added_date(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        company_status="watchlist",
        holdings=[],
        watchlist=[
            watchlist_row(
                added_date="2026-07-10",
                next_review_date="2026-07-05",
            )
        ],
    )

    with pytest.raises(PortfolioValidationError, match="cannot be before added_date"):
        validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))


def test_rejects_future_watchlist_added_date(tmp_path: Path) -> None:
    setup_repo(
        tmp_path,
        company_status="watchlist",
        holdings=[],
        watchlist=[
            watchlist_row(
                added_date="2026-07-20",
                next_review_date="2026-08-15",
            )
        ],
    )

    with pytest.raises(
        PortfolioValidationError,
        match="added_date .* cannot be after validation as-of date",
    ):
        validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))


def test_rejects_invalid_evaluation_record(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    record = evaluation_record(useful="yes")
    (tmp_path / "vault" / "portfolio" / "evaluation-log.jsonl").write_text(
        json.dumps(record) + "\n", encoding="utf-8"
    )

    with pytest.raises(PortfolioValidationError, match="not of type 'boolean'"):
        validate_portfolio(tmp_path)


def test_rejects_invalid_evaluation_schema_without_traceback(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    schema_path = tmp_path / "vault" / "schemas" / "evaluation-log.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    schema["type"] = "invalid-type"
    schema_path.write_text(json.dumps(schema), encoding="utf-8")

    with pytest.raises(PortfolioValidationError, match="invalid JSON Schema"):
        validate_portfolio(tmp_path)


def test_rejects_future_evaluation_record(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    artifact = tmp_path / "analysis" / "test.md"
    artifact.parent.mkdir(parents=True)
    artifact.write_text("# Test analysis\n", encoding="utf-8")
    (tmp_path / "vault" / "portfolio" / "evaluation-log.jsonl").write_text(
        json.dumps(evaluation_record(date="2026-07-20")) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(
        PortfolioValidationError,
        match="date .* cannot be after validation as-of date",
    ):
        validate_portfolio(tmp_path, as_of_date=date(2026, 7, 15))


def test_accepts_evaluation_record_with_existing_artifact(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    artifact = tmp_path / "analysis" / "test.md"
    artifact.parent.mkdir(parents=True)
    artifact.write_text("# Test analysis\n", encoding="utf-8")
    (tmp_path / "vault" / "portfolio" / "evaluation-log.jsonl").write_text(
        json.dumps(evaluation_record()) + "\n", encoding="utf-8"
    )

    snapshot = validate_portfolio(tmp_path)

    assert snapshot.evaluation_count == 1


def test_rejects_missing_evaluation_artifact(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    (tmp_path / "vault" / "portfolio" / "evaluation-log.jsonl").write_text(
        json.dumps(evaluation_record()) + "\n", encoding="utf-8"
    )

    with pytest.raises(PortfolioValidationError, match="artifact does not exist"):
        validate_portfolio(tmp_path)


def test_rejects_traversal_evaluation_artifact(tmp_path: Path) -> None:
    setup_repo(tmp_path)
    (tmp_path / "vault" / "portfolio" / "evaluation-log.jsonl").write_text(
        json.dumps(evaluation_record(artifact="../../missing.md")) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(
        PortfolioValidationError, match="invalid canonical artifact path"
    ):
        validate_portfolio(tmp_path)
