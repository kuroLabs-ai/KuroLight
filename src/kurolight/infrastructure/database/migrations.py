"""Database migrations for KuroLight catalog schema."""

import sqlite3
from datetime import datetime, timezone

from kurolight.domain.assets import source_folder_from_path

CURRENT_SCHEMA_VERSION = 7

MIGRATION_V1 = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    settings_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    source_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    date_captured TEXT,
    rating INTEGER NOT NULL DEFAULT 0,
    flag TEXT NOT NULL DEFAULT 'unflagged',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_rating ON assets(rating);
CREATE INDEX IF NOT EXISTS idx_assets_flag ON assets(flag);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collections_project_id ON collections(project_id);

CREATE TABLE IF NOT EXISTS collection_assets (
    collection_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    PRIMARY KEY (collection_id, asset_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edit_states (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL UNIQUE,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parameters_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edit_states_asset_id ON edit_states(asset_id);

CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    schema_version INTEGER NOT NULL DEFAULT 1,
    parameters_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_asset_id ON history(asset_id);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visual_graphs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    graph_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

MIGRATION_V2 = """
CREATE TABLE IF NOT EXISTS edit_history (
    asset_id TEXT PRIMARY KEY,
    history_json TEXT NOT NULL,
    active_index INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
"""

MIGRATION_V3 = """
DROP INDEX IF EXISTS idx_assets_project_id;
CREATE INDEX IF NOT EXISTS idx_assets_project_gallery_name
    ON assets(project_id, file_name COLLATE NOCASE ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_assets_project_gallery_date
    ON assets(
        project_id,
        COALESCE(date_captured, '') DESC,
        file_name COLLATE NOCASE ASC,
        id ASC
    );
CREATE INDEX IF NOT EXISTS idx_assets_project_gallery_rating
    ON assets(
        project_id,
        rating DESC,
        file_name COLLATE NOCASE ASC,
        id ASC
    );
CREATE INDEX IF NOT EXISTS idx_assets_project_gallery_size
    ON assets(
        project_id,
        COALESCE(file_size, 0) DESC,
        file_name COLLATE NOCASE ASC,
        id ASC
    );
"""

MIGRATION_V4 = """
ALTER TABLE assets
    ADD COLUMN metadata_overrides_json TEXT NOT NULL DEFAULT '{}';
"""

MIGRATION_V5 = """
ALTER TABLE assets
    ADD COLUMN source_folder TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_assets_project_source_folder
    ON assets(project_id, source_folder COLLATE NOCASE, file_name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_assets_project_source_folder_binary
    ON assets(project_id, source_folder COLLATE BINARY, file_name COLLATE NOCASE, id);
"""

MIGRATION_V6 = """
ALTER TABLE collections
    ADD COLUMN parent_id TEXT REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE collections
    ADD COLUMN collection_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE collections
    ADD COLUMN rules_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_collections_project_parent_name
    ON collections(project_id, parent_id, name COLLATE NOCASE, id);
"""

MIGRATION_V7 = """
ALTER TABLE assets
    ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_project_deleted_at
    ON assets(project_id, deleted_at);
"""


def _backfill_source_folders(conn: sqlite3.Connection) -> None:
    cursor = conn.execute("SELECT id, source_path FROM assets;")
    while rows := cursor.fetchmany(500):
        conn.executemany(
            "UPDATE assets SET source_folder = ? WHERE id = ?;",
            ((source_folder_from_path(row[1]), row[0]) for row in rows),
        )


def apply_migrations(conn: sqlite3.Connection) -> None:
    """Execute schema migrations sequentially within connection."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);"
    )
    cursor = conn.cursor()
    cursor.execute("SELECT version FROM schema_migrations ORDER BY version ASC;")
    applied = {row[0] for row in cursor.fetchall()}

    if 1 not in applied:
        conn.executescript(MIGRATION_V1)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?);", (now,))
        conn.commit()
        applied.add(1)

    if 2 not in applied:
        conn.executescript(MIGRATION_V2)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?);", (now,))
        conn.commit()
        applied.add(2)

    if 3 not in applied:
        conn.executescript(MIGRATION_V3)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?);", (now,))
        conn.commit()
        applied.add(3)

    if 4 not in applied:
        conn.executescript(MIGRATION_V4)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?);", (now,))
        conn.commit()
        applied.add(4)

    if 5 not in applied:
        conn.executescript(MIGRATION_V5)
        _backfill_source_folders(conn)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?);", (now,))
        conn.commit()
        applied.add(5)

    if 6 not in applied:
        conn.executescript(MIGRATION_V6)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?);", (now,))
        conn.commit()
        applied.add(6)

    if 7 not in applied:
        conn.executescript(MIGRATION_V7)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (7, ?);", (now,))
        conn.commit()
