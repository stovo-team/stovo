package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestProvisionTenantDatabaseCreatesIsolatedRuntimeRole(t *testing.T) {
	adminURL := strings.TrimSpace(os.Getenv("TEST_TENANT_ADMIN_DATABASE_URL"))
	if adminURL == "" {
		t.Skip("set TEST_TENANT_ADMIN_DATABASE_URL to a disposable PostgreSQL admin database to run tenant provisioning integration coverage")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	adminDB, err := sql.Open("pgx", adminURL)
	if err != nil {
		t.Fatalf("open tenant admin database: %v", err)
	}
	t.Cleanup(func() {
		if err := adminDB.Close(); err != nil {
			t.Errorf("close tenant admin database: %v", err)
		}
	})
	if err := adminDB.PingContext(ctx); err != nil {
		t.Fatalf("connect to tenant admin database: %v", err)
	}

	slug := "it" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	tenantDBName := "stovo_db_" + slug
	runtimeRole := "stovo_runtime_" + slug
	otherDBName := "stovo_it_other_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	cleanup := func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_, _ = adminDB.ExecContext(cleanupCtx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ($1, $2) AND pid <> pg_backend_pid()`, tenantDBName, otherDBName)
		if _, err := adminDB.ExecContext(cleanupCtx, `DROP DATABASE IF EXISTS `+quoteTestIdentifier(tenantDBName)); err != nil {
			t.Errorf("drop test tenant database: %v", err)
		}
		if _, err := adminDB.ExecContext(cleanupCtx, `DROP DATABASE IF EXISTS `+quoteTestIdentifier(otherDBName)); err != nil {
			t.Errorf("drop other test database: %v", err)
		}
		if _, err := adminDB.ExecContext(cleanupCtx, `DROP ROLE IF EXISTS `+quoteTestIdentifier(runtimeRole)); err != nil {
			t.Errorf("drop test runtime role: %v", err)
		}
	}
	cleanup()
	t.Cleanup(cleanup)

	if err := provisionTenantDatabase(ctx, adminDB, slug, "test-runtime-password"); err != nil {
		t.Fatalf("provision tenant database: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `CREATE DATABASE `+quoteTestIdentifier(otherDBName)); err != nil {
		t.Fatalf("create second test database: %v", err)
	}

	adminParsed, err := url.Parse(adminURL)
	if err != nil {
		t.Fatalf("parse admin database URL: %v", err)
	}
	runtimeParsed := *adminParsed
	runtimeParsed.Path = "/" + tenantDBName
	runtimeParsed.User = url.UserPassword(runtimeRole, "test-runtime-password")

	runtimeDB, err := sql.Open("pgx", runtimeParsed.String())
	if err != nil {
		t.Fatalf("open tenant runtime database: %v", err)
	}
	t.Cleanup(func() {
		if err := runtimeDB.Close(); err != nil {
			t.Errorf("close tenant runtime database: %v", err)
		}
	})
	var connectedDB string
	if err := runtimeDB.QueryRowContext(ctx, `SELECT current_database()`).Scan(&connectedDB); err != nil {
		t.Fatalf("runtime role could not connect to its tenant database: %v", err)
	}
	if connectedDB != tenantDBName {
		t.Fatalf("runtime role connected to %q, want %q", connectedDB, tenantDBName)
	}

	otherRuntimeURL := runtimeParsed
	otherRuntimeURL.Path = "/" + otherDBName
	otherRuntimeDB, err := sql.Open("pgx", otherRuntimeURL.String())
	if err != nil {
		t.Fatalf("open second runtime connection: %v", err)
	}
	t.Cleanup(func() {
		if err := otherRuntimeDB.Close(); err != nil {
			t.Errorf("close second tenant runtime database: %v", err)
		}
	})
	if err := otherRuntimeDB.PingContext(ctx); err == nil {
		t.Fatal("tenant runtime role connected to a different Space database")
	}
}

func TestPgBouncerSupportsRuntimeQueryTransactionAndPreparedStatement(t *testing.T) {
	poolerURL := strings.TrimSpace(os.Getenv("TEST_PGBOUNCER_URL"))
	if poolerURL == "" {
		t.Skip("set TEST_PGBOUNCER_URL to a disposable PgBouncer transaction-pooling DSN to run PgBouncer functional integration coverage")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", poolerURL)
	if err != nil {
		t.Fatalf("open PgBouncer URL: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close PgBouncer database: %v", err)
		}
	})
	db.SetMaxOpenConns(1)
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("PgBouncer is configured but unavailable: %v", err)
	}

	var databaseName string
	if err := db.QueryRowContext(ctx, `SELECT current_database()`).Scan(&databaseName); err != nil {
		t.Fatalf("query current database through PgBouncer: %v", err)
	}
	parsed, err := url.Parse(poolerURL)
	if err != nil {
		t.Fatalf("parse PgBouncer URL: %v", err)
	}
	wantDatabase := strings.TrimPrefix(parsed.EscapedPath(), "/")
	if wantDatabase != "" && databaseName != wantDatabase {
		t.Fatalf("PgBouncer connected to database %q, want configured database %q", databaseName, wantDatabase)
	}

	var parameterized int
	if err := db.QueryRowContext(ctx, `SELECT $1::int + $2::int`, 19, 23).Scan(&parameterized); err != nil {
		t.Fatalf("parameterized query through PgBouncer: %v", err)
	}
	if parameterized != 42 {
		t.Fatalf("parameterized query result = %d, want 42", parameterized)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin transaction through PgBouncer: %v", err)
	}
	var transactionValue string
	if err := tx.QueryRowContext(ctx, `SELECT $1::text || ':' || current_database()`, "transaction").Scan(&transactionValue); err != nil {
		_ = tx.Rollback()
		t.Fatalf("query within PgBouncer transaction: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit PgBouncer transaction: %v", err)
	}
	if transactionValue != fmt.Sprintf("transaction:%s", databaseName) {
		t.Fatalf("transaction result = %q, want database-scoped result", transactionValue)
	}

	stmt, err := db.PrepareContext(ctx, `SELECT $1::text || ':' || current_database()`)
	if err != nil {
		t.Fatalf("prepare statement through PgBouncer: %v", err)
	}
	t.Cleanup(func() {
		if err := stmt.Close(); err != nil {
			t.Errorf("close prepared statement: %v", err)
		}
	})
	var preparedValue string
	if err := stmt.QueryRowContext(ctx, "prepared").Scan(&preparedValue); err != nil {
		t.Fatalf("execute prepared statement through PgBouncer: %v", err)
	}
	if preparedValue != fmt.Sprintf("prepared:%s", databaseName) {
		t.Fatalf("prepared statement result = %q, want database-scoped result", preparedValue)
	}
}

func quoteTestIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}
