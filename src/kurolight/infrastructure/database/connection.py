"""Thread-safe SQLite database connection manager."""

from contextlib import contextmanager
from pathlib import Path
import sqlite3
import threading
from typing import Generator

_local = threading.local()


class DatabaseConnectionManager:
    """Manages thread-local SQLite connections with foreign keys and WAL mode."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def get_connection(self) -> sqlite3.Connection:
        """Retrieve or create thread-local connection."""
        connections = getattr(_local, "connections", None)
        if connections is None:
            connections = {}
            _local.connections = connections

        key = str(self.db_path.resolve())
        if key not in connections:
            conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False,
            )
            conn.row_factory = sqlite3.Row
            # Enable WAL mode and foreign key constraints
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            connections[key] = conn

        return connections[key]

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """Transactional context manager that automatically commits or rolls back."""
        conn = self.get_connection()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def close_thread_connection(self) -> None:
        """Close connection for current thread if open."""
        connections = getattr(_local, "connections", None)
        if connections:
            key = str(self.db_path.resolve())
            conn = connections.pop(key, None)
            if conn:
                conn.close()
