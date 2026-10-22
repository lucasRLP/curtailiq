from unittest.mock import Mock

import pytest

from app import deps
from app.config import Settings
from app.routers.exposure import _fixture_repo


@pytest.fixture(autouse=True)
def clean_repository_cache():
    factory = getattr(deps, "get_mock_repository", None)
    if factory is not None:
        factory.cache_clear()
    yield
    factory = getattr(deps, "get_mock_repository", None)
    if factory is not None:
        factory.cache_clear()


@pytest.fixture
def constructor(monkeypatch):
    constructor = Mock(side_effect=lambda **kwargs: object())
    monkeypatch.setattr(deps, "MockRepository", constructor)
    return constructor


def test_same_configuration_reuses_repository(constructor):
    first = deps.get_mock_repository(True, None)
    assert deps.get_mock_repository(True, None) is first
    constructor.assert_called_once_with(mvp_only_nordeste=True, data_dir=None)


def test_directory_and_scope_are_isolated(constructor, tmp_path):
    directory = str(tmp_path / "first")
    first = deps.get_mock_repository(True, directory)
    assert deps.get_mock_repository(True, str(tmp_path / "second")) is not first
    assert deps.get_mock_repository(False, directory) is not first
    assert constructor.call_count == 3


def test_cache_is_bounded_and_can_be_cleared(constructor):
    for index in range(5):
        deps.get_mock_repository(True, str(index))
    assert deps.get_mock_repository.cache_info().maxsize == 4
    assert deps.get_mock_repository.cache_info().currsize == 4
    deps.get_mock_repository.cache_clear()
    assert deps.get_mock_repository.cache_info().currsize == 0


def test_get_repo_uses_factory(monkeypatch):
    factory = Mock(return_value=object())
    monkeypatch.setattr(deps, "get_mock_repository", factory)
    settings = Settings(_env_file=None, data_backend="mock", mvp_only_nordeste=False, mock_data_dir="example")
    assert deps.get_repo(settings=settings, db=object()) is factory.return_value
    factory.assert_called_once_with(False, "example")


def test_exposure_shares_factory_and_keeps_nordeste_scope(constructor):
    settings = Settings(_env_file=None, data_backend="postgres", mvp_only_nordeste=False, mock_data_dir="example")
    assert _fixture_repo(settings) is deps.get_mock_repository(True, "example")
    constructor.assert_called_once_with(mvp_only_nordeste=True, data_dir="example")


def test_postgres_remains_request_scoped(monkeypatch):
    from app.repositories import postgres_repo

    constructor = Mock(side_effect=lambda **kwargs: object())
    monkeypatch.setattr(postgres_repo, "PostgresRepository", constructor)
    factory = Mock()
    monkeypatch.setattr(deps, "get_mock_repository", factory)
    settings = Settings(_env_file=None, data_backend="postgres", mvp_only_nordeste=False)
    first_session, second_session = object(), object()
    first = deps.get_repo(settings=settings, db=first_session)
    assert deps.get_repo(settings=settings, db=second_session) is not first
    assert constructor.call_args_list[0].kwargs == {"db": first_session, "mvp_only_nordeste": False}
    assert constructor.call_args_list[1].kwargs == {"db": second_session, "mvp_only_nordeste": False}
    factory.assert_not_called()
