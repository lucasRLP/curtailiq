import pytest

from app.data_load.redshift import RedshiftLoadError, RedshiftReadOnlyLoader


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.description = None
        self.rows = []
        self.calls = []

    def execute(self, sql, args=None):
        self.calls.append((sql, args))
        if "current_database()" in sql:
            self.description = [("current_database",)]
            self.rows = [("datalake",)]
        elif '"datalake"."public"."fato_geracao"' in sql:
            self.description = [("din_instante",), ("sk_usina",), ("val_energia_mwh",)]
            self.rows = [(args[0], 11, 42.5)] if args[3] == 0 else []
        elif "FROM \"datalake\".\"public\".\"dim_usina\"" in sql:
            self.description = [("sk_usina",), ("nom_usina",), ("ceg",)]
            offset = args[1]
            batches = [[(4, "A", None), (5, "B", "CEG5")], [(6, "C", "")]]
            self.rows = batches[offset // 2]
        else:
            raise AssertionError("SQL fora da allowlist de leitura")

    def fetchone(self):
        return self.rows[0]

    def fetchmany(self, size):
        result, self.rows = self.rows[:size], self.rows[size:]
        return result

    def close(self):
        pass


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor(self)
        self.closed = False
        self.committed = False
        self.rolled_back = False

    def cursor(self):
        return self.cursor_instance

    def close(self):
        self.closed = True

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


class FakeConnector:
    def __init__(self, connection=None):
        self.connection = connection or FakeConnection()
        self.kwargs = None

    def connect(self, **kwargs):
        self.kwargs = kwargs
        return self.connection


def config():
    return {
        "host": "redshift.example.invalid",
        "port": 5439,
        "database": "datalake",
        "user": "reader",
        "password": "not-a-real-password",
        "timeout": 4,
    }


def test_redshift_settings_keep_password_out_of_repr_and_never_default_credentials():
    from app.data_load.settings import RedshiftSettings
    settings = RedshiftSettings(_env_file=None, host="db.example", user="reader", password="sensitive-value")
    assert "sensitive-value" not in repr(settings)
    assert settings.connection_kwargs()["password"] == "sensitive-value"
    with pytest.raises(ValueError, match="redshift_credentials_not_configured"):
        RedshiftSettings(_env_file=None).connection_kwargs()


def test_redshift_settings_reject_a_different_database():
    from app.data_load.settings import RedshiftSettings
    settings = RedshiftSettings(_env_file=None, host="db.example", user="reader", password="pw", database="other")
    with pytest.raises(ValueError, match="redshift_database_mismatch"):
        settings.connection_kwargs()


def test_fact_load_requires_a_date_filter_before_opening_a_connection():
    connector = FakeConnector()
    loader = RedshiftReadOnlyLoader(config(), connector=connector)
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table("fato_geracao", page_size=2, max_rows=10)
    assert exc.value.code == "date_range_required"
    assert connector.kwargs is None


def test_dimension_load_rejects_fact_date_filters():
    from datetime import date
    loader = RedshiftReadOnlyLoader(config(), connector=FakeConnector())
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table("dim_usina", page_size=2, max_rows=10, start=date(2026, 1, 1), end=date(2026, 1, 2))
    assert exc.value.code == "date_range_not_supported"


def test_fact_date_filter_is_bound_in_query_and_half_open():
    from datetime import date
    connector = FakeConnector()
    loader = RedshiftReadOnlyLoader(config(), connector=connector)
    result = loader.load_table("fato_geracao", page_size=2, max_rows=10, start=date(2026, 1, 1), end=date(2026, 1, 2))
    assert result.rows[0]["val_energia_mwh"] == 42.5
    fact_calls = [(sql, params) for sql, params in connector.connection.cursor_instance.calls if "fato_geracao" in sql]
    assert fact_calls[0][1][:2] == (date(2026, 1, 1), date(2026, 1, 2))
    assert '"din_instante" >= %s AND "din_instante" < %s' in fact_calls[0][0]
    assert "2026-01-01" not in fact_calls[0][0]


def test_loads_allowlisted_dimension_rows_in_bounded_pages_without_changing_nulls():
    connector = FakeConnector()
    loader = RedshiftReadOnlyLoader(config(), connector=connector)

    result = loader.load_table("dim_usina", page_size=2, max_rows=10)

    assert result.dataset == "dim_usina"
    assert result.row_count == 3
    assert result.pages_read == 2
    assert result.rows[0] == {"sk_usina": 4, "nom_usina": "A", "ceg": None}
    assert result.rows[1]["ceg"] == "CEG5"
    assert result.rows[2]["ceg"] == ""
    assert connector.connection.closed
    assert not connector.connection.committed
    assert connector.connection.rolled_back
    selects = [sql for sql, _ in connector.connection.cursor_instance.calls]
    assert all(sql.lstrip().upper().startswith("SELECT") for sql in selects)
    assert any('ORDER BY "sk_usina" LIMIT %s OFFSET %s' in sql for sql in selects)


def test_dataset_name_cannot_inject_sql_or_escape_allowlist():
    loader = RedshiftReadOnlyLoader(config(), connector=FakeConnector())
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table('dim_usina; DROP TABLE users', page_size=2, max_rows=10)
    assert exc.value.code == "dataset_not_allowed"


def test_limits_are_bounded_before_opening_a_connection():
    connector = FakeConnector()
    loader = RedshiftReadOnlyLoader(config(), connector=connector)
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table("dim_usina", page_size=0, max_rows=10)
    assert exc.value.code == "invalid_limits"
    assert connector.kwargs is None


def test_never_returns_partial_result_after_row_limit_exceeded():
    connector = FakeConnector()
    loader = RedshiftReadOnlyLoader(config(), connector=connector)
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table("dim_usina", page_size=2, max_rows=2)
    assert exc.value.code == "row_limit_exceeded"
    assert connector.connection.closed
    assert connector.connection.rolled_back


def test_connection_error_is_sanitized_and_does_not_echo_password():
    class BrokenConnector:
        def connect(self, **kwargs):
            raise RuntimeError("failed using not-a-real-password")

    loader = RedshiftReadOnlyLoader(config(), connector=BrokenConnector())
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table("dim_usina", page_size=2, max_rows=10)
    assert exc.value.code == "source_unavailable"
    assert "not-a-real-password" not in str(exc.value)


def test_rejects_unexpected_database_and_closes_without_returning_data():
    class WrongDatabaseCursor(FakeCursor):
        def execute(self, sql, args=None):
            if "current_database()" in sql:
                self.rows = [("other",)]
            else:
                raise AssertionError("não deveria ler tabelas")

    connection = FakeConnection()
    connection.cursor_instance = WrongDatabaseCursor(connection)
    loader = RedshiftReadOnlyLoader(config(), connector=FakeConnector(connection))
    with pytest.raises(RedshiftLoadError) as exc:
        loader.load_table("dim_usina", page_size=2, max_rows=10)
    assert exc.value.code == "database_mismatch"
    assert connection.closed


def test_supported_dataset_allowlist_is_explicit_and_not_user_supplied():
    assert set(RedshiftReadOnlyLoader.DATASETS) == {
        "dim_data", "dim_subsistema", "dim_usina", "fato_geracao", "fato_taxa_teif_teip"
    }
    assert all(table.startswith('"datalake"."public".') for table in RedshiftReadOnlyLoader.DATASETS.values())
