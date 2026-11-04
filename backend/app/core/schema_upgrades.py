import logging
from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

logger = logging.getLogger("openlogbook")

# Columns added after the first release. create_all() only creates missing tables, so existing
# databases get these through ALTER TABLE. Every entry must be nullable to suit old rows.
ADDED_COLUMNS = [
    ("flights", "details", "TEXT"),
]


def add_missing_columns(connection: Connection) -> list[str]:
    """Adds columns new code expects to existing tables. Safe to run on every start."""
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    added = []
    for table, column, column_type in ADDED_COLUMNS:
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column in existing:
            continue
        connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))
        added.append(f"{table}.{column}")
        logger.info("Added column %s.%s", table, column)
    return added
