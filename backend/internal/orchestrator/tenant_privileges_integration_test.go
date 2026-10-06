package orchestrator

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestTenantRuntimeRoleCanUseMigratedTables(t *testing.T) {
	adminURL := strings.TrimSpace(os.Getenv("TEST_TENANT_ADMIN_DATABASE_URL"))
	if adminURL == "" {
		t.Skip("set TEST_TENANT_ADMIN_DATABASE_URL to a disposable PostgreSQL admin database to run tenant privilege integration coverage")
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
	slug := "perm" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	dbName, role := "stovo_db_"+slug, "stovo_runtime_"+slug
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_, _ = adminDB.ExecContext(cleanupCtx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, dbName)
		_, _ = adminDB.ExecContext(cleanupCtx, `DROP DATABASE IF EXISTS `+quoteTestIdentifier(dbName))
		_, _ = adminDB.ExecContext(cleanupCtx, `DROP ROLE IF EXISTS `+quoteTestIdentifier(role))
	})
	if err := provisionTenantDatabase(ctx, adminDB, slug, "runtime-password-for-test"); err != nil {
		t.Fatalf("provision tenant: %v", err)
	}
	tenantAdminURL, err := tenantDatabaseURL(adminURL, dbName)
	if err != nil {
		t.Fatal(err)
	}
	tenantAdmin, err := sql.Open("pgx", tenantAdminURL)
	if err != nil {
		t.Fatalf("open tenant admin connection: %v", err)
	}
	t.Cleanup(func() {
		if err := tenantAdmin.Close(); err != nil {
			t.Errorf("close tenant admin database: %v", err)
		}
	})
	if _, err := tenantAdmin.ExecContext(ctx, `CREATE TABLE public.privilege_fixture (id BIGSERIAL PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatalf("create migrated table: %v", err)
	}
	if err := grantTenantRuntimePrivileges(tenantAdminURL, role); err != nil {
		t.Fatalf("grant runtime table privileges: %v", err)
	}
	runtimeURL, err := tenantDatabaseURL(adminURL, dbName)
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(runtimeURL)
	parsed.User = url.UserPassword(role, "runtime-password-for-test")
	runtimeDB, err := sql.Open("pgx", parsed.String())
	if err != nil {
		t.Fatalf("open tenant runtime connection: %v", err)
	}
	t.Cleanup(func() {
		if err := runtimeDB.Close(); err != nil {
			t.Errorf("close tenant runtime database: %v", err)
		}
	})
	var id int
	if err := runtimeDB.QueryRowContext(ctx, `INSERT INTO privilege_fixture(value) VALUES ('ok') RETURNING id`).Scan(&id); err != nil {
		t.Fatalf("runtime insert: %v", err)
	}
	var value string
	if err := runtimeDB.QueryRowContext(ctx, `SELECT value FROM privilege_fixture WHERE id=$1`, id).Scan(&value); err != nil {
		t.Fatalf("runtime select: %v", err)
	}
	if value != "ok" {
		t.Fatalf("runtime selected %q, want ok", value)
	}
}

func tenantDatabaseURL(adminURL, database string) (string, error) {
	parsed, err := url.Parse(adminURL)
	if err != nil {
		return "", err
	}
	parsed.Path = "/" + database
	return parsed.String(), nil
}
