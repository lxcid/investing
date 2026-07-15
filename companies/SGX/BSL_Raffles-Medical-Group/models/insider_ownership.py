#!/usr/bin/env python3
"""Validate insider-ownership inputs and generate reusable signal series.

Inputs are ordinary voting shares and SGD per share. Percentages are decimals.
The signal rule is intentionally simple: any fall in total disclosed interest is
flagged for review; it is not an investment recommendation.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path


COMPANY = Path(__file__).resolve().parents[1]
OWNERSHIP = COMPANY / "ownership"


def read_csv(name: str) -> list[dict[str, str]]:
    with (OWNERSHIP / name).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def as_int(value: str) -> int | None:
    return int(value) if value != "" else None


def as_decimal(value: str) -> Decimal | None:
    return Decimal(value) if value != "" else None


def signal_status(change_shares: int, pct_change: Decimal | None) -> tuple[str, str]:
    if change_shares < 0:
        return "reduction_review", "true"
    if change_shares > 0:
        return "increase", "false"
    if pct_change is not None and pct_change < 0:
        return "dilution_review", "true"
    return "unchanged", "false"


def validate() -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    nodes = read_csv("nodes.csv")
    edges = read_csv("edges.csv")
    components = read_csv("component-observations.csv")
    events = read_csv("disclosure-events.csv")
    interests = read_csv("reported-interests.csv")

    node_ids = {row["node_id"] for row in nodes}
    assert len(node_ids) == len(nodes), "duplicate node_id"

    for edge in edges:
        assert edge["from_node_id"] in node_ids, edge["edge_id"]
        assert edge["to_node_id"] in node_ids, edge["edge_id"]

    component_ids = {row["holding_component_id"] for row in components}
    assert len(component_ids) == len(components), "duplicate component observation"
    for edge in edges:
        component_id = edge["holding_component_id"]
        if component_id:
            assert component_id in component_ids, (edge["edge_id"], component_id)

    for event in events:
        assert event["filer_node_id"] in node_ids, event["event_id"]
        before_primary = as_int(event["before_primary_shares"])
        before_deemed = as_int(event["before_deemed_shares"])
        after_primary = as_int(event["after_primary_shares"])
        after_deemed = as_int(event["after_deemed_shares"])
        before_total = as_int(event["before_total_shares"])
        after_total = as_int(event["after_total_shares"])
        changed = as_int(event["shares_changed"])
        assert None not in (
            before_primary,
            before_deemed,
            after_primary,
            after_deemed,
            before_total,
            after_total,
            changed,
        )
        assert before_primary + before_deemed == before_total, event["event_id"]
        assert after_primary + after_deemed == after_total, event["event_id"]
        expected = changed if event["direction"] == "acquisition" else -changed
        assert after_total - before_total == expected, event["event_id"]

        denominator = as_int(event["voting_shares_outstanding"])
        assert denominator
        calculated_after = Decimal(after_total) / Decimal(denominator)
        reported_after = as_decimal(event["after_total_pct"])
        assert reported_after is not None
        assert abs(calculated_after - reported_after) <= Decimal("0.00001"), event["event_id"]

    for snapshot in interests:
        assert snapshot["filer_node_id"] in node_ids, snapshot["snapshot_id"]
        primary = as_int(snapshot["primary_interest_shares"])
        deemed = as_int(snapshot["deemed_interest_shares"])
        total = as_int(snapshot["total_interest_shares"])
        assert None not in (primary, deemed, total)
        assert primary + deemed == total, snapshot["snapshot_id"]

    return events, interests


def generate_signals(events: list[dict[str, str]]) -> list[dict[str, str]]:
    group_for_filer = {
        "person_loo": "group_loo_disclosed",
        "person_sarah": "group_sarah_disclosed",
    }
    rows: list[dict[str, str]] = []
    for event in events:
        before = int(event["before_total_shares"])
        after = int(event["after_total_shares"])
        change = after - before
        before_pct = Decimal(event["before_total_pct"])
        after_pct = Decimal(event["after_total_pct"])
        pct_change = after_pct - before_pct
        status, review = signal_status(change, pct_change)
        rows.append(
            {
                "event_id": event["event_id"],
                "event_date": event["event_date"],
                "group_id": group_for_filer[event["filer_node_id"]],
                "before_total_shares": str(before),
                "after_total_shares": str(after),
                "change_shares": str(change),
                "relative_change_pct": str(Decimal(change) / Decimal(before)),
                "ownership_pct_change": str(pct_change),
                "transaction_type": event["transaction_type"],
                "signal_status": status,
                "review_required": review,
                "source_local": event["source_local"],
                "notes": "Review reductions by cause before interpretation.",
            }
        )
    return rows


def generate_group_series(interests: list[dict[str, str]]) -> list[dict[str, str]]:
    group_for_filer = {
        "person_loo": "group_loo_disclosed",
        "person_sarah": "group_sarah_disclosed",
    }
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in interests:
        group_id = group_for_filer.get(row["filer_node_id"])
        if group_id and row["comparable_total_interest"] == "true":
            grouped[group_id].append(row)

    output: list[dict[str, str]] = []
    for group_id, rows in grouped.items():
        rows.sort(key=lambda row: (row["as_of_date"], int(row["sequence"])))
        previous_total: int | None = None
        previous_pct: Decimal | None = None
        for row in rows:
            total = int(row["total_interest_shares"])
            pct = as_decimal(row["total_interest_pct"])
            change = 0 if previous_total is None else total - previous_total
            pct_change = None if previous_pct is None or pct is None else pct - previous_pct
            status = "baseline" if previous_total is None else signal_status(change, pct_change)[0]
            output.append(
                {
                    "as_of_date": row["as_of_date"],
                    "sequence": row["sequence"],
                    "group_id": group_id,
                    "total_interest_shares": str(total),
                    "voting_shares_outstanding": row["voting_shares_outstanding"],
                    "ownership_pct": row["total_interest_pct"],
                    "change_shares": "" if previous_total is None else str(change),
                    "ownership_pct_change": "" if pct_change is None else str(pct_change),
                    "signal_status": status,
                    "reporting_basis": row["reporting_basis"],
                    "source_local": row["source_local"],
                    "notes": row["notes"],
                }
            )
            previous_total = total
            if pct is not None:
                previous_pct = pct
    output.sort(key=lambda row: (row["group_id"], row["as_of_date"], int(row["sequence"])))
    return output


def write_csv(name: str, rows: list[dict[str, str]]) -> None:
    assert rows
    with (OWNERSHIP / name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    events, interests = validate()
    signals = generate_signals(events)
    series = generate_group_series(interests)
    write_csv("signals.csv", signals)
    write_csv("group-series.csv", series)
    print(
        f"validated {len(events)} events and {len(interests)} snapshots; "
        f"wrote {len(signals)} signals and {len(series)} series rows"
    )


if __name__ == "__main__":
    main()
