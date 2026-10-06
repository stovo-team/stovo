package orchestrator

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestProvisionedRuntimeRoleDoesNotOwnTenantDatabase(t *testing.T) {
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
	if err := adminDB.PingContext(ctx); err != nil {
		t.Fatalf("connect to tenant admin database: %v", err)
	}

	slug := "it" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	dbName, roleName := "stovo_db_"+slug, "stovo_runtime_"+slug
	cleanup := func() {
		_, _ = adminDB.ExecContext(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, dbName)
		_, _ = adminDB.ExecContext(ctx, `DROP DATABASE IF EXISTS `+quoteTestIdentifier(dbName))
		_, _ = adminDB.ExecContext(ctx, `DROP ROLE IF EXISTS `+quoteTestIdentifier(roleName))
	}
	cleanup()
	t.Cleanup(cleanup)

	if err := provisionTenantDatabase(ctx, adminDB, slug, "test-runtime-password"); err != nil {
		t.Fatalf("provision tenant database: %v", err)
	}
	var ownsDatabase bool
	err = adminDB.QueryRowContext(ctx, `SELECT pg_get_userbyid(datdba)=$1 FROM pg_database WHERE datname=$2`, roleName, dbName).Scan(&ownsDatabase)
	if err != nil {
		t.Fatalf("query tenant database owner: %v", err)
	}
	if ownsDatabase {
		t.Fatalf("runtime role %q owns tenant database %q; migrations use the administrator role", roleName, dbName)
	}
}
