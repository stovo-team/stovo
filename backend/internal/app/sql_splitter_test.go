package app

import (
	"strings"
	"testing"
)

func TestSplitSQLStatementsKeepsDollarQuotedBodiesIntact(t *testing.T) {
	sql := `CREATE FUNCTION sample() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'missing; id';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TABLE sample_table (id text);`

	statements := splitSQLStatements(sql)
	if len(statements) != 2 {
		t.Fatalf("got %d statements, want 2: %#v", len(statements), statements)
	}
	if !strings.Contains(statements[0], "RAISE EXCEPTION 'missing; id';") || !strings.Contains(statements[0], "$fn$") {
		t.Fatalf("function body was split or corrupted: %q", statements[0])
	}
	if !strings.HasPrefix(statements[1], "CREATE TABLE sample_table") {
		t.Fatalf("second statement = %q", statements[1])
	}
}
