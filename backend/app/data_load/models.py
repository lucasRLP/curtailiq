from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class LoadedTable:
    """Raw bounded load with source/table scope and no hidden transforms."""

    dataset: str
    database: str
    schema: str
    load_id: str
    consistency: str
    extracted_at: datetime
    columns: tuple[str, ...]
    rows: tuple[dict[str, Any], ...]
    start: str | None = None
    end: str | None = None
    _page_size: int = 1

    @property
    def row_count(self) -> int:
        return len(self.rows)

    @property
    def pages_read(self) -> int:
        if not self.rows:
            return 0
        return (self.row_count + self._page_size - 1) // self._page_size

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "curtailiq-redshift-load-v1",
            "dataset": self.dataset,
            "database": self.database,
            "schema": self.schema,
            "load_id": self.load_id,
            "consistency": self.consistency,
            "extracted_at": self.extracted_at.isoformat(),
            "requested_range": {"start": self.start, "end_exclusive": self.end},
            "row_count": self.row_count,
            "columns": list(self.columns),
            "rows": list(self.rows),
        }
