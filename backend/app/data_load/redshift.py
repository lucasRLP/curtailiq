from __future__ import annotations

from datetime import date, datetime, timezone
from math import ceil
from typing import Any

from app.data_load.models import LoadedTable
from app.data_load.settings import RedshiftSettings


class RedshiftLoadError(RuntimeError):
    """Safe error code: never contains connection details or source SQL."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class RedshiftReadOnlyLoader:
    """Load bounded raw rows from the five source tables used in the notebook.

    This class performs no joins, aggregation, E/T, or domain interpretation.
    Dataset identifiers and ordering columns are fixed allowlists, never SQL input.
    """

    DATASETS = {
        "dim_data": '"datalake"."public"."dim_data"',
        "dim_subsistema": '"datalake"."public"."dim_subsistema"',
        "dim_usina": '"datalake"."public"."dim_usina"',
        "fato_geracao": '"datalake"."public"."fato_geracao"',
        "fato_taxa_teif_teip": '"datalake"."public"."fato_taxa_teif_teip"',
    }
    ORDER_BY = {
        "dim_data": '"data_sk"',
        "dim_subsistema": '"id_subsistema"',
        "dim_usina": '"sk_usina"',
        "fato_geracao": '"din_instante", "sk_usina", "sk_hora"',
        "fato_taxa_teif_teip": '"din_mes", "sk_usina", "nom_taxa"',
    }
    DATE_COLUMNS = {"fato_geracao": "din_instante", "fato_taxa_teif_teip": "din_mes"}
    MAX_PAGE_SIZE = 1000
    MAX_ROWS = 100_000

    def __init__(self, settings: RedshiftSettings | dict[str, Any], connector=None):
        self.settings = settings
        self.connector = connector

    def _connect(self):
        try:
            kwargs = (
                self.settings.connection_kwargs()
                if isinstance(self.settings, RedshiftSettings)
                else dict(self.settings)
            )
            if self.connector is None:
                import redshift_connector

                connector = redshift_connector
            else:
                connector = self.connector
            return connector.connect(**kwargs)
        except Exception as exc:
            if isinstance(exc, (ValueError, RedshiftLoadError)):
                code = str(exc)
                if code not in {
                    "redshift_credentials_not_configured",
                    "redshift_connection_settings_invalid",
                    "redshift_database_mismatch",
                }:
                    code = "source_unavailable"
            else:
                code = "source_unavailable"
            raise RedshiftLoadError(code) from None

    def load_table(
        self,
        dataset: str,
        *,
        page_size: int = 500,
        max_rows: int = 10_000,
        start: date | datetime | None = None,
        end: date | datetime | None = None,
    ) -> LoadedTable:
        if dataset not in self.DATASETS:
            raise RedshiftLoadError("dataset_not_allowed")
        date_column = self.DATE_COLUMNS.get(dataset)
        if date_column is None and (start is not None or end is not None):
            raise RedshiftLoadError("date_range_not_supported")
        if date_column is not None and (start is None or end is None):
            raise RedshiftLoadError("date_range_required")
        if start is not None or end is not None:
            if not isinstance(start, (date, datetime)) or not isinstance(end, (date, datetime)):
                raise RedshiftLoadError("invalid_date_range")
            if isinstance(start, datetime) != isinstance(end, datetime):
                raise RedshiftLoadError("invalid_date_range")
            if isinstance(start, datetime) and start.utcoffset() is not None:
                raise RedshiftLoadError("timezone_not_supported_by_source_column")
            if isinstance(end, datetime) and end.utcoffset() is not None:
                raise RedshiftLoadError("timezone_not_supported_by_source_column")
            if start >= end:
                raise RedshiftLoadError("invalid_date_range")
        if (
            isinstance(page_size, bool)
            or isinstance(max_rows, bool)
            or not isinstance(page_size, int)
            or not isinstance(max_rows, int)
            or not 1 <= page_size <= self.MAX_PAGE_SIZE
            or not 1 <= max_rows <= self.MAX_ROWS
        ):
            raise RedshiftLoadError("invalid_limits")

        connection = self._connect()
        cursor = None
        rows: list[dict[str, Any]] = []
        columns: tuple[str, ...] = ()
        pages = 0
        snapshot_id = ""
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT current_database()")
            db_row = cursor.fetchone()
            if not db_row or db_row[0] != "datalake":
                raise RedshiftLoadError("database_mismatch")

            offset = 0
            table = self.DATASETS[dataset]
            order_by = self.ORDER_BY[dataset]
            max_pages = ceil(max_rows / page_size) + 1
            while True:
                if pages >= max_pages:
                    raise RedshiftLoadError("page_limit_exceeded")
                fetch_limit = min(page_size, max_rows - len(rows) + 1)
                where_sql = f' WHERE "{date_column}" >= %s AND "{date_column}" < %s' if date_column else ""
                sql = f"SELECT * FROM {table}{where_sql} ORDER BY {order_by} LIMIT %s OFFSET %s"
                bind_values = (start, end, fetch_limit, offset) if date_column else (fetch_limit, offset)
                cursor.execute(sql, bind_values)
                if not columns:
                    description = cursor.description or ()
                    columns = tuple(str(field[0]) for field in description)
                    if not columns or len({name.casefold() for name in columns}) != len(columns):
                        raise RedshiftLoadError("source_schema_invalid")
                batch = cursor.fetchmany(fetch_limit)
                pages += 1
                if len(batch) > max_rows - len(rows):
                    raise RedshiftLoadError("row_limit_exceeded")
                rows.extend(dict(zip(columns, record, strict=True)) for record in batch)
                if len(batch) < fetch_limit:
                    break
                offset += len(batch)

            # A transaction timestamp identifies this extraction only; Redshift
            # snapshot isolation/stability across different calls is not asserted.
            load_id = "load:" + datetime.now(timezone.utc).isoformat()
            result = LoadedTable(
                dataset=dataset,
                database="datalake",
                schema="public",
                load_id=load_id,
                consistency="single_connection_read_transaction_not_immutable_release",
                extracted_at=datetime.now(timezone.utc),
                columns=columns,
                rows=tuple(rows),
                start=start.isoformat() if start is not None else None,
                end=end.isoformat() if end is not None else None,
                _page_size=page_size,
            )
            if hasattr(connection, "rollback"):
                connection.rollback()
            return result
        except RedshiftLoadError:
            if hasattr(connection, "rollback"):
                connection.rollback()
            raise
        except Exception:
            if hasattr(connection, "rollback"):
                try:
                    connection.rollback()
                except Exception:
                    pass
            raise RedshiftLoadError("source_read_failed") from None
        finally:
            if cursor is not None and hasattr(cursor, "close"):
                try:
                    cursor.close()
                except Exception:
                    pass
            connection.close()
