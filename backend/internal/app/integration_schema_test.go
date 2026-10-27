package app

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"sync"
	"testing"
)

func TestExecSchemaSQLBatchesMigrationStatements(t *testing.T) {
	recorder := &schemaSQLExecRecorder{}
	db := sql.OpenDB(schemaSQLExecConnector{recorder: recorder})
	t.Cleanup(func() { _ = db.Close() })

	err := execSchemaSQL(db, "CREATE TABLE first_table (id integer);\nCREATE TABLE second_table (id integer);")
	if err != nil {
		t.Fatalf("exec schema SQL: %v", err)
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if len(recorder.queries) != 1 {
		t.Fatalf("schema statements executed in %d database round trips, want 1", len(recorder.queries))
	}
	for _, statement := range []string{"CREATE TABLE first_table", "CREATE TABLE second_table"} {
		if !strings.Contains(recorder.queries[0], statement) {
			t.Errorf("batched schema SQL is missing %q: %s", statement, recorder.queries[0])
		}
	}
}

type schemaSQLExecRecorder struct {
	mu      sync.Mutex
	queries []string
}

type schemaSQLExecConnector struct{ recorder *schemaSQLExecRecorder }

func (c schemaSQLExecConnector) Connect(context.Context) (driver.Conn, error) {
	return schemaSQLExecConn(c), nil
}

func (schemaSQLExecConnector) Driver() driver.Driver { return schemaSQLExecDriver{} }

type schemaSQLExecDriver struct{}

func (schemaSQLExecDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("schema SQL recorder only supports OpenDB")
}

type schemaSQLExecConn struct{ recorder *schemaSQLExecRecorder }

func (schemaSQLExecConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("schema SQL recorder does not support prepared statements")
}

func (schemaSQLExecConn) Close() error { return nil }

func (schemaSQLExecConn) Begin() (driver.Tx, error) {
	return nil, errors.New("schema SQL recorder does not support transactions")
}

func (c schemaSQLExecConn) ExecContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Result, error) {
	c.recorder.mu.Lock()
	c.recorder.queries = append(c.recorder.queries, query)
	c.recorder.mu.Unlock()
	return driver.RowsAffected(0), nil
}
