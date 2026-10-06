package orchestrator

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestRenderPgBouncerAuthFileSortsUsersAndEscapesValues(t *testing.T) {
	got, err := renderPgBouncerAuthFile(map[string]string{
		"tenant-b": `secret "b"`,
		"tenant-a": "secret-a",
	})
	if err != nil {
		t.Fatalf("render PgBouncer auth file: %v", err)
	}
	want := `"tenant-a" "secret-a"` + "\n" + `"tenant-b" "secret \"b\""` + "\n"
	if got != want {
		t.Fatalf("auth file = %q, want %q", got, want)
	}
}

func TestRenderPgBouncerAuthFileRejectsInvalidIdentityAndControlCharacters(t *testing.T) {
	for name, users := range map[string]map[string]string{
		"empty user":        {"": "secret"},
		"empty password":    {"tenant": ""},
		"newline injection": {"tenant": "secret\n\"admin\" \"bad\""},
	} {
		t.Run(name, func(t *testing.T) {
			got, err := renderPgBouncerAuthFile(users)
			if err == nil || got != "" {
				t.Fatalf("expected fail-closed auth rendering, got %q, err %v", got, err)
			}
		})
	}
}

func TestWritePgBouncerAuthFileUsesPrivatePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("PgBouncer runs in Linux containers; Unix ownership and mode bits are not available on Windows")
	}
	path := filepath.Join(t.TempDir(), "auth", "userlist.txt")
	if err := writePgBouncerAuthFileForUID(path, `"tenant" "secret"`+"\n", os.Getuid()); err != nil {
		t.Fatalf("write auth file: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat auth file: %v", err)
	}
	if got := info.Mode().Perm(); got != 0600 {
		t.Fatalf("auth file permissions = %04o, want 0600", got)
	}
}

func TestTenantDatabaseURLRejectsPoolerHostConfigurationInjection(t *testing.T) {
	if runtimeURL, _, err := buildTenantDatabaseURLs("space-a", "postgres://admin:secret@db/tenant_{slug}", "pooler;host=attacker", "6432", "tenant-user", "tenant-password"); err == nil || runtimeURL != "" {
		t.Fatalf("invalid PgBouncer host returned runtime URL %q with error %v", runtimeURL, err)
	}
}

func TestTenantDatabaseURLRequiresPerSpaceDatabasePlaceholder(t *testing.T) {
	if runtimeURL, migrationURL, err := buildTenantDatabaseURLs("space-a", "postgres://admin:secret@db.example.test/shared?sslmode=require", "pgbouncer", "6432", "runtime", "runtime-password"); err == nil || runtimeURL != "" || migrationURL != "" {
		t.Fatalf("fixed shared database URL should fail closed, runtime=%q migration=%q err=%v", runtimeURL, migrationURL, err)
	}
}

func TestValidatePgBouncerAdminPasswordRequiresHexSecret(t *testing.T) {
	for _, password := range []string{"0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"} {
		if err := validatePgBouncerAdminPassword(password); err != nil {
			t.Errorf("valid PgBouncer admin secret rejected: %v", err)
		}
	}
	for _, password := range []string{"", "short", "0123456789abcdef0123456789abcdef!", "0123456789abcdef0123456789abcde\n"} {
		if err := validatePgBouncerAdminPassword(password); err == nil {
			t.Errorf("invalid PgBouncer admin secret %q accepted", password)
		}
	}
}

func TestValidatePgBouncerUpstreamMatchesMigrationEndpoint(t *testing.T) {
	if err := validatePgBouncerUpstream("postgres://admin:secret@db.example.test:5433/tenant_{slug}", "db.example.test", "5433"); err != nil {
		t.Fatalf("matching PgBouncer endpoint should pass: %v", err)
	}
	if err := validatePgBouncerUpstream("postgres://admin:secret@db.example.test:5433/tenant_{slug}", "other.example.test", "5433"); err == nil {
		t.Fatal("mismatched PgBouncer upstream host should fail closed")
	}
	if err := validatePgBouncerUpstream("postgres://admin:secret@db.example.test:5433/tenant_{slug}", "db.example.test", "5432"); err == nil {
		t.Fatal("mismatched PgBouncer upstream port should fail closed")
	}
	if err := validatePgBouncerUpstream("postgres://admin:secret@db.example.test:65536/tenant_{slug}", "db.example.test", "65536"); err == nil {
		t.Fatal("out-of-range PgBouncer upstream port should fail closed")
	}
}

func TestBuildTenantDatabaseURLsUsesDirectEndpointWhenPoolerIsDisabled(t *testing.T) {
	runtimeURL, migrationURL, err := buildTenantDatabaseURLsWithPooler(
		"space-a",
		"postgres://admin:admin-password@db.internal:5432/stovo_db_{slug}?sslmode=require",
		"",
		"",
		"tenant-user",
		"tenant-password",
		false,
	)
	if err != nil {
		t.Fatalf("build direct tenant URLs: %v", err)
	}
	if runtimeURL != "postgres://tenant-user:tenant-password@db.internal:5432/stovo_db_space-a?sslmode=require" {
		t.Fatalf("runtime URL should use direct endpoint and tenant credentials, got %q", runtimeURL)
	}
	if migrationURL != "postgres://admin:admin-password@db.internal:5432/stovo_db_space-a?sslmode=require" {
		t.Fatalf("migration URL should retain admin endpoint and credentials, got %q", migrationURL)
	}
}
