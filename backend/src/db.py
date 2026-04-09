from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    from src import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    path_columns = {column["name"] for column in inspector.get_columns("paths")}
    if "user_id" not in path_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE paths "
                    "ADD COLUMN user_id INTEGER NULL"
                )
            )

    badge_columns = {column["name"] for column in inspector.get_columns("badges")}
    if "tier" not in badge_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE badges "
                    "ADD COLUMN tier VARCHAR(16) NOT NULL DEFAULT 'bronze'"
                )
            )

    unique_constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("paths")}
    with engine.begin() as connection:
      if "paths_name_key" in unique_constraints:
          connection.execute(text("ALTER TABLE paths DROP CONSTRAINT IF EXISTS paths_name_key"))
      if "uq_path_per_user" not in unique_constraints:
          connection.execute(
              text(
                  "ALTER TABLE paths "
                  "ADD CONSTRAINT uq_path_per_user UNIQUE (user_id, name)"
              )
          )
