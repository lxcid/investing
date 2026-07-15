"""Validate portfolio source data and render derived portfolio analysis."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError

MAX_VALUATION_DATE_GAP_DAYS = 7
RESEARCH_STATUSES = {"candidate", "active", "monitoring", "archived"}
PORTFOLIO_STATUSES = {"none", "watchlist", "holding", "exited"}
CURRENCY_PATTERN = re.compile(r"^[A-Z]{3}$")

HOLDING_FIELDS = [
    "company_path",
    "quantity",
    "average_cost",
    "cost_currency",
    "position_date",
    "position_source",
    "current_price",
    "price_currency",
    "price_date",
    "price_source",
    "fx_to_base",
    "fx_date",
    "fx_source",
    "notes",
]
CASH_FIELDS = [
    "currency",
    "amount",
    "as_of_date",
    "source",
    "fx_to_base",
    "fx_date",
    "fx_source",
    "notes",
]
WATCHLIST_FIELDS = ["company_path", "added_date", "next_review_date", "reason"]


class PortfolioValidationError(ValueError):
    """Raised when authoritative portfolio state is invalid or inconsistent."""


@dataclass(frozen=True)
class Mandate:
    status: str
    base_currency: str


@dataclass(frozen=True)
class Company:
    company_path: str
    exchange: str
    ticker: str
    currency: str
    research_status: str
    portfolio_status: str


@dataclass(frozen=True)
class Holding:
    company_path: str
    quantity: Decimal
    current_price: Decimal
    price_currency: str
    price_date: date
    fx_to_base: Decimal

    @property
    def local_value(self) -> Decimal:
        return self.quantity * self.current_price

    @property
    def base_value(self) -> Decimal:
        return self.local_value * self.fx_to_base


@dataclass(frozen=True)
class CashBalance:
    currency: str
    amount: Decimal
    as_of_date: date
    fx_to_base: Decimal

    @property
    def base_value(self) -> Decimal:
        return self.amount * self.fx_to_base


@dataclass(frozen=True)
class PortfolioSnapshot:
    mandate: Mandate
    companies: dict[str, Company]
    holdings: list[Holding]
    cash: list[CashBalance]
    watchlist_count: int
    evaluation_count: int


def fail(message: str) -> PortfolioValidationError:
    return PortfolioValidationError(message)


def read_frontmatter(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        raise fail(f"cannot read {path}: {error}") from error
    match = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)", text, re.DOTALL)
    if not match:
        raise fail(f"{path}: missing YAML frontmatter")
    try:
        data = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        raise fail(f"{path}: invalid YAML frontmatter: {error}") from error
    if not isinstance(data, dict):
        raise fail(f"{path}: frontmatter must be a mapping")
    return data


def read_csv(path: Path, expected_fields: list[str]) -> list[dict[str, str]]:
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != expected_fields:
                raise fail(
                    f"{path}: expected columns {expected_fields}, got {reader.fieldnames}"
                )
            rows = list(reader)
    except OSError as error:
        raise fail(f"cannot read {path}: {error}") from error
    for line_number, row in enumerate(rows, start=2):
        if None in row:
            raise fail(f"{path}:{line_number}: too many columns")
    return rows


def require(row: dict[str, str], fields: tuple[str, ...], identity: str) -> None:
    missing = [field for field in fields if not row.get(field, "").strip()]
    if missing:
        raise fail(f"{identity}: missing {', '.join(missing)}")


def parse_decimal(value: str, field: str, identity: str) -> Decimal:
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise fail(f"{identity}: invalid {field} {value!r}") from error
    if not parsed.is_finite():
        raise fail(f"{identity}: {field} must be finite")
    if parsed <= 0:
        raise fail(f"{identity}: {field} must be positive")
    return parsed


def parse_date(value: str, field: str, identity: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise fail(f"{identity}: invalid {field} {value!r}; use YYYY-MM-DD") from error


def reject_future_date(
    value: date, field: str, validation_date: date, identity: str
) -> None:
    if value > validation_date:
        raise fail(
            f"{identity}: {field} {value} cannot be after validation as-of date "
            f"{validation_date}"
        )


def parse_currency(value: str, field: str, identity: str) -> str:
    if not CURRENCY_PATTERN.fullmatch(value):
        raise fail(f"{identity}: {field} must be a three-letter uppercase currency")
    return value


def parse_fx(
    row: dict[str, str], source_currency: str, base_currency: str, value_date: date, identity: str
) -> Decimal:
    fields = ("fx_to_base", "fx_date", "fx_source")
    populated = [bool(row.get(field, "").strip()) for field in fields]
    if source_currency == base_currency and not any(populated):
        return Decimal("1")
    require(row, fields, identity)
    rate = parse_decimal(row["fx_to_base"], "fx_to_base", identity)
    fx_date = parse_date(row["fx_date"], "fx_date", identity)
    if source_currency == base_currency and rate != 1:
        raise fail(f"{identity}: base-currency fx_to_base must equal 1")
    if fx_date > value_date:
        raise fail(
            f"{identity}: FX date {fx_date} cannot be after value date {value_date}"
        )
    if (value_date - fx_date).days > MAX_VALUATION_DATE_GAP_DAYS:
        raise fail(
            f"{identity}: value date {value_date} and FX date {fx_date} differ by "
            f"more than {MAX_VALUATION_DATE_GAP_DAYS} days"
        )
    return rate


def load_mandate(repo_root: Path) -> Mandate:
    path = repo_root / "vault" / "portfolio" / "mandate.md"
    data = read_frontmatter(path)
    status = data.get("status")
    if status not in {"working", "confirmed"}:
        raise fail(f"{path}: status must be working or confirmed")
    base_currency = data.get("base_currency")
    if not isinstance(base_currency, str):
        raise fail(f"{path}: base_currency is required")
    parse_currency(base_currency, "base_currency", str(path))
    return Mandate(status=status, base_currency=base_currency)


def load_companies(repo_root: Path) -> dict[str, Company]:
    companies: dict[str, Company] = {}
    listing_paths: dict[tuple[str, str], str] = {}
    companies_root = repo_root / "vault" / "companies"
    for index_path in sorted(companies_root.glob("*/*/index.md")):
        company_path = index_path.parent.relative_to(repo_root).as_posix()
        data = read_frontmatter(index_path)
        exchange = data.get("exchange")
        ticker = data.get("ticker")
        currency = data.get("currency")
        research_status = data.get("research_status")
        portfolio_status = data.get("portfolio_status")
        if not all(isinstance(value, str) for value in (exchange, ticker, currency)):
            raise fail(
                f"{index_path}: exchange, ticker, and currency are required strings"
            )
        for field, value in (("exchange", exchange), ("ticker", ticker)):
            if not value or value.strip() != value:
                raise fail(
                    f"{index_path}: {field} must be a non-empty trimmed string"
                )
        parse_currency(currency, "currency", str(index_path))
        if research_status not in RESEARCH_STATUSES:
            raise fail(f"{index_path}: invalid research_status {research_status!r}")
        if portfolio_status not in PORTFOLIO_STATUSES:
            raise fail(f"{index_path}: invalid portfolio_status {portfolio_status!r}")
        path_parts = PurePosixPath(company_path).parts
        directory_name = path_parts[3]
        ticker_prefix = f"{ticker}_"
        short_name = (
            directory_name.removeprefix(ticker_prefix)
            if directory_name.startswith(ticker_prefix)
            else ""
        )
        if exchange != path_parts[2]:
            raise fail(f"{index_path}: exchange does not match the company path")
        if not short_name or short_name.strip() != short_name:
            raise fail(
                f"{index_path}: company directory must use "
                "<ticker>_<short-name> with a non-empty short name without "
                "surrounding whitespace"
            )
        listing_identity = (exchange, ticker)
        if listing_identity in listing_paths:
            raise fail(
                f"{index_path}: duplicate listing identity {exchange}:{ticker}; "
                f"already defined by {listing_paths[listing_identity]}"
            )
        listing_paths[listing_identity] = company_path
        companies[company_path] = Company(
            company_path=company_path,
            exchange=exchange,
            ticker=ticker,
            currency=currency,
            research_status=research_status,
            portfolio_status=portfolio_status,
        )
    return companies


def require_company(
    repo_root: Path, companies: dict[str, Company], raw_path: str, identity: str
) -> Company:
    pure_path = PurePosixPath(raw_path)
    if (
        raw_path != pure_path.as_posix()
        or pure_path.is_absolute()
        or len(pure_path.parts) != 4
        or pure_path.parts[:2] != ("vault", "companies")
    ):
        raise fail(f"{identity}: invalid canonical company_path {raw_path!r}")
    if any(part in {"", ".", ".."} for part in pure_path.parts):
        raise fail(f"{identity}: invalid canonical company_path {raw_path!r}")
    resolved = (repo_root / Path(*pure_path.parts)).resolve()
    companies_root = (repo_root / "vault" / "companies").resolve()
    if not resolved.is_relative_to(companies_root) or not (resolved / "index.md").is_file():
        raise fail(f"{identity}: company_path does not exist: {raw_path}")
    company = companies.get(raw_path)
    if company is None:
        raise fail(f"{identity}: company_path is not indexed: {raw_path}")
    return company


def require_artifact(repo_root: Path, raw_path: str, identity: str) -> Path:
    pure_path = PurePosixPath(raw_path)
    if (
        raw_path != pure_path.as_posix()
        or pure_path.is_absolute()
        or not pure_path.parts
        or any(part in {"", ".", ".."} for part in pure_path.parts)
    ):
        raise fail(f"{identity}: invalid canonical artifact path {raw_path!r}")
    resolved = (repo_root / Path(*pure_path.parts)).resolve()
    if not resolved.is_relative_to(repo_root.resolve()):
        raise fail(f"{identity}: artifact escapes repository: {raw_path}")
    if not resolved.is_file():
        raise fail(f"{identity}: artifact does not exist: {raw_path}")
    return resolved


def load_holdings(
    repo_root: Path,
    mandate: Mandate,
    companies: dict[str, Company],
    validation_date: date,
) -> list[Holding]:
    path = repo_root / "vault" / "portfolio" / "holdings.csv"
    rows = read_csv(path, HOLDING_FIELDS)
    holdings: list[Holding] = []
    seen: set[str] = set()
    for line_number, row in enumerate(rows, start=2):
        identity = f"{path}:{line_number}"
        require(
            row,
            (
                "company_path",
                "quantity",
                "average_cost",
                "cost_currency",
                "position_date",
                "position_source",
                "current_price",
                "price_currency",
                "price_date",
                "price_source",
            ),
            identity,
        )
        company_path = row["company_path"]
        if company_path in seen:
            raise fail(f"{identity}: duplicate company_path {company_path}")
        seen.add(company_path)
        company = require_company(repo_root, companies, company_path, identity)
        if company.portfolio_status != "holding":
            raise fail(
                f"{identity}: {company_path} has portfolio_status "
                f"{company.portfolio_status!r}, expected 'holding'"
            )
        quantity = parse_decimal(row["quantity"], "quantity", identity)
        parse_decimal(row["average_cost"], "average_cost", identity)
        parse_currency(row["cost_currency"], "cost_currency", identity)
        position_date = parse_date(row["position_date"], "position_date", identity)
        reject_future_date(
            position_date, "position_date", validation_date, identity
        )
        current_price = parse_decimal(row["current_price"], "current_price", identity)
        price_currency = parse_currency(row["price_currency"], "price_currency", identity)
        price_date = parse_date(row["price_date"], "price_date", identity)
        reject_future_date(price_date, "price_date", validation_date, identity)
        if position_date > price_date:
            raise fail(
                f"{identity}: position date {position_date} cannot be after price "
                f"date {price_date}"
            )
        if price_currency != company.currency:
            raise fail(
                f"{identity}: price_currency {price_currency} does not match "
                f"company currency {company.currency}"
            )
        fx_to_base = parse_fx(
            row, price_currency, mandate.base_currency, price_date, identity
        )
        holdings.append(
            Holding(
                company_path=company_path,
                quantity=quantity,
                current_price=current_price,
                price_currency=price_currency,
                price_date=price_date,
                fx_to_base=fx_to_base,
            )
        )
    return holdings


def load_cash(
    repo_root: Path, mandate: Mandate, validation_date: date
) -> list[CashBalance]:
    path = repo_root / "vault" / "portfolio" / "cash.csv"
    rows = read_csv(path, CASH_FIELDS)
    balances: list[CashBalance] = []
    seen: set[str] = set()
    for line_number, row in enumerate(rows, start=2):
        identity = f"{path}:{line_number}"
        require(row, ("currency", "amount", "as_of_date", "source"), identity)
        currency = parse_currency(row["currency"], "currency", identity)
        if currency in seen:
            raise fail(f"{identity}: duplicate cash currency {currency}")
        seen.add(currency)
        amount = parse_decimal(row["amount"], "amount", identity)
        as_of_date = parse_date(row["as_of_date"], "as_of_date", identity)
        reject_future_date(as_of_date, "as_of_date", validation_date, identity)
        fx_to_base = parse_fx(row, currency, mandate.base_currency, as_of_date, identity)
        balances.append(
            CashBalance(
                currency=currency,
                amount=amount,
                as_of_date=as_of_date,
                fx_to_base=fx_to_base,
            )
        )
    return balances


def load_watchlist(
    repo_root: Path, companies: dict[str, Company], validation_date: date
) -> set[str]:
    path = repo_root / "vault" / "portfolio" / "watchlist.csv"
    rows = read_csv(path, WATCHLIST_FIELDS)
    watchlist: set[str] = set()
    for line_number, row in enumerate(rows, start=2):
        identity = f"{path}:{line_number}"
        require(row, ("company_path", "added_date", "reason"), identity)
        company_path = row["company_path"]
        if company_path in watchlist:
            raise fail(f"{identity}: duplicate company_path {company_path}")
        company = require_company(repo_root, companies, company_path, identity)
        if company.portfolio_status != "watchlist":
            raise fail(
                f"{identity}: {company_path} has portfolio_status "
                f"{company.portfolio_status!r}, expected 'watchlist'"
            )
        added_date = parse_date(row["added_date"], "added_date", identity)
        reject_future_date(added_date, "added_date", validation_date, identity)
        if row["next_review_date"].strip():
            next_review_date = parse_date(
                row["next_review_date"], "next_review_date", identity
            )
            if next_review_date < added_date:
                raise fail(
                    f"{identity}: next_review_date {next_review_date} cannot be "
                    f"before added_date {added_date}"
                )
        watchlist.add(company_path)
    return watchlist


def validate_status_consistency(
    companies: dict[str, Company], holdings: list[Holding], watchlist: set[str]
) -> None:
    holding_paths = {holding.company_path for holding in holdings}
    overlap = holding_paths & watchlist
    if overlap:
        raise fail(f"companies cannot be both held and watchlisted: {sorted(overlap)}")
    for company_path, company in companies.items():
        if company.portfolio_status == "holding" and company_path not in holding_paths:
            raise fail(f"{company_path}: status is holding but holdings.csv has no row")
        if company.portfolio_status == "watchlist" and company_path not in watchlist:
            raise fail(f"{company_path}: status is watchlist but watchlist.csv has no row")


def validate_valuation_dates(holdings: list[Holding], cash: list[CashBalance]) -> None:
    dates = [holding.price_date for holding in holdings] + [balance.as_of_date for balance in cash]
    if dates and (max(dates) - min(dates)).days > MAX_VALUATION_DATE_GAP_DAYS:
        raise fail(
            "portfolio price/cash dates differ by more than "
            f"{MAX_VALUATION_DATE_GAP_DAYS} days"
        )


def load_evaluation_log(
    repo_root: Path, companies: dict[str, Company], validation_date: date
) -> int:
    schema_path = repo_root / "vault" / "schemas" / "evaluation-log.schema.json"
    log_path = repo_root / "vault" / "portfolio" / "evaluation-log.jsonl"
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        lines = log_path.read_text(encoding="utf-8").splitlines()
    except (OSError, json.JSONDecodeError) as error:
        raise fail(f"cannot read evaluation log contract: {error}") from error
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        raise fail(f"{schema_path}: invalid JSON Schema: {error.message}") from error
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    count = 0
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            raise fail(f"{log_path}:{line_number}: blank JSONL records are not allowed")
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            raise fail(f"{log_path}:{line_number}: invalid JSON: {error.msg}") from error
        errors = sorted(validator.iter_errors(record), key=lambda item: list(item.path))
        if errors:
            raise fail(f"{log_path}:{line_number}: {errors[0].message}")
        identity = f"{log_path}:{line_number}"
        evaluation_date = parse_date(record["date"], "date", identity)
        reject_future_date(evaluation_date, "date", validation_date, identity)
        company_path = record["company_path"]
        if company_path is not None:
            require_company(repo_root, companies, company_path, identity)
        require_artifact(repo_root, record["artifact"], identity)
        count += 1
    return count


def validate_portfolio(
    repo_root: Path, *, as_of_date: date | None = None
) -> PortfolioSnapshot:
    repo_root = repo_root.resolve()
    validation_date = as_of_date or date.today()
    mandate = load_mandate(repo_root)
    companies = load_companies(repo_root)
    holdings = load_holdings(repo_root, mandate, companies, validation_date)
    cash = load_cash(repo_root, mandate, validation_date)
    watchlist = load_watchlist(repo_root, companies, validation_date)
    validate_status_consistency(companies, holdings, watchlist)
    validate_valuation_dates(holdings, cash)
    evaluation_count = load_evaluation_log(repo_root, companies, validation_date)
    return PortfolioSnapshot(
        mandate=mandate,
        companies=companies,
        holdings=holdings,
        cash=cash,
        watchlist_count=len(watchlist),
        evaluation_count=evaluation_count,
    )


def render_summary(snapshot: PortfolioSnapshot) -> str:
    rows: list[tuple[str, str, str, date, Decimal, Decimal]] = []
    for holding in snapshot.holdings:
        rows.append(
            (
                holding.company_path,
                "security",
                holding.price_currency,
                holding.price_date,
                holding.local_value,
                holding.base_value,
            )
        )
    for balance in snapshot.cash:
        rows.append(
            (
                f"Cash {balance.currency}",
                "cash",
                balance.currency,
                balance.as_of_date,
                balance.amount,
                balance.base_value,
            )
        )
    if not rows:
        return "No valued holdings or cash recorded."
    if snapshot.mandate.status != "confirmed":
        raise fail(
            "vault/portfolio/mandate.md must have status: confirmed before derived "
            "portfolio analysis"
        )
    total = sum((row[5] for row in rows), Decimal("0"))
    if total <= 0:
        raise fail("total portfolio value must be positive")
    output = [
        "| Position | Type | Currency | As of | Local value | Base value | Weight |",
        "|---|---|---|---|---:|---:|---:|",
    ]
    currency_totals: dict[str, Decimal] = {}
    for identity, kind, currency, as_of, local_value, base_value in rows:
        weight = base_value / total * Decimal("100")
        output.append(
            f"| {identity} | {kind} | {currency} | {as_of} | {local_value:.2f} | "
            f"{base_value:.2f} {snapshot.mandate.base_currency} | {weight:.2f}% |"
        )
        currency_totals[currency] = currency_totals.get(currency, Decimal("0")) + base_value
    output.extend(
        [
            "",
            f"Total portfolio value: {total:.2f} {snapshot.mandate.base_currency}",
            "",
            "## Position-currency exposure",
            "",
            "| Currency | Base value | Weight |",
            "|---|---:|---:|",
        ]
    )
    for currency, base_value in sorted(currency_totals.items()):
        weight = base_value / total * Decimal("100")
        output.append(
            f"| {currency} | {base_value:.2f} {snapshot.mandate.base_currency} | "
            f"{weight:.2f}% |"
        )
    return "\n".join(output)


def discover_repo_root(start: Path) -> Path:
    for candidate in (start.resolve(), *start.resolve().parents):
        if (candidate / "vault" / "portfolio" / "mandate.md").is_file():
            return candidate
    raise fail("cannot find repository root containing vault/portfolio/mandate.md")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="portfolio-tools")
    parser.add_argument("--repo-root", type=Path)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("validate")
    subparsers.add_parser("summary")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        repo_root = args.repo_root.resolve() if args.repo_root else discover_repo_root(Path.cwd())
        snapshot = validate_portfolio(repo_root)
        if args.command == "summary":
            print(render_summary(snapshot))
        else:
            print(
                "Portfolio data is valid "
                f"(base currency: {snapshot.mandate.base_currency}; "
                f"holdings: {len(snapshot.holdings)}; cash: {len(snapshot.cash)}; "
                f"watchlist: {snapshot.watchlist_count}; "
                f"evaluation records: {snapshot.evaluation_count})."
            )
    except PortfolioValidationError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
