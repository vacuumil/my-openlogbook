from sqlalchemy import create_engine, inspect, text

from app.core.schema_upgrades import add_missing_columns


def test_adds_new_columns_to_an_old_table_once():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE flights (id TEXT PRIMARY KEY, remarks TEXT)"))
        connection.execute(text("INSERT INTO flights (id, remarks) VALUES ('a', 'old row')"))

        assert add_missing_columns(connection) == ["flights.details"]
        assert add_missing_columns(connection) == []

        columns = {column["name"] for column in inspect(connection).get_columns("flights")}
        assert "details" in columns
        assert connection.execute(text("SELECT remarks, details FROM flights")).one() == ("old row", None)


def test_skips_tables_that_do_not_exist_yet():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        assert add_missing_columns(connection) == []
