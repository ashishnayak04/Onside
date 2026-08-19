"""Database connection helper for the Onside pipeline.

Reads DATABASE_URL from environment.  All pipeline modules import ``get_conn``
to obtain a psycopg2 connection.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Generator

import psycopg2
import psycopg2.extras


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
