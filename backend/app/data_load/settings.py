from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class RedshiftSettings(BaseSettings):
    """Connection details come from env/secret store, never notebook source or Git."""

    model_config = SettingsConfigDict(
        env_prefix="REDSHIFT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str | None = None
    port: int = 5439
    database: str = "datalake"
    user: str | None = None
    password: SecretStr | None = None
    timeout_seconds: int = 10
    ssl: bool = True

    def connection_kwargs(self) -> dict:
        if not self.host or not self.user or not self.password:
            raise ValueError("redshift_credentials_not_configured")
        if not 1 <= self.port <= 65535 or not 1 <= self.timeout_seconds <= 60:
            raise ValueError("redshift_connection_settings_invalid")
        if self.database != "datalake":
            raise ValueError("redshift_database_mismatch")
        return {
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "user": self.user,
            "password": self.password.get_secret_value(),
            "timeout": self.timeout_seconds,
            "ssl": self.ssl,
        }
