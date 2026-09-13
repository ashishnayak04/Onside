"""Database connection helper for the Onside pipeline.

Reads DATABASE_URL from environment (falling back to ``pipeline/.env``), so
scheduled runs work regardless of the scheduler's environment.  All pipeline
modules import ``get_conn`` to obtain a psycopg2 connection.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

import psycopg2
import psycopg2.extras


def _load_dotenv() -> None:
    """Load NAME=VALUE pairs from pipeline/.env into os.environ.

    Existing environment variables win. No external dependency (python-dotenv
    is not required for a key/value file of this shape).
    """
    dotenv_path = Path(__file__).resolve().parent.parent / ".env"
    if not dotenv_path.is_file():
        return
    for line in dotenv_path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().strip('"').strip("'")
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()

_DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/onside")


def get_conn() -> psycopg2.extensions.connection:
    """Return a new psycopg2 connection using DATABASE_URL."""
    return psycopg2.connect(_DSN)


@contextmanager
def transaction() -> Generator[psycopg2.extensions.connection, None, None]:
    """Context manager that commits on success, rolls back on error."""
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_one(sql: str, params: tuple = ()) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def execute(sql: str, params: tuple = ()) -> None:
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)


def execute_many(sql: str, params_list: list[tuple]) -> None:
    with transaction() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, sql, params_list, page_size=500)
