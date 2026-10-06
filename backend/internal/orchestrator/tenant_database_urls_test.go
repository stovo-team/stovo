package orchestrator

import (
	"net/url"
	"strings"
	"testing"
)

func TestBuildTenantDatabaseURLsSeparatesPoolerAndDirectMigrationTargets(t *testing.T) {
	migrationPassword := strings.Join([]string{"migration", "-", "fixture"}, "")
	direct := "postgres://" + url.UserPassword("admin", migrationPassword).String() + "@db.example.test:5432/tenant_{slug}?sslmode=verify-full&application_name=master"
	runtimePassword := strings.Join([]string{"runtime", ":", "fixture"}, "")
	runtimeURL, migrationURL, err := buildTenantDatabaseURLs(
		"team-42", direct, "pooler.internal", "7444", "runtime-user", runtimePassword,
	)
	if err != nil {
		t.Fatalf("build tenant database URLs: %v", err)
	}
	runtimeParsed, err := url.Parse(runtimeURL)
	if err != nil {
		t.Fatalf("parse runtime URL: %v", err)
	}
	migrationParsed, err := url.Parse(migrationURL)
	if err != nil {
		t.Fatalf("parse migration URL: %v", err)
	}
	if runtimeParsed.Host != "pooler.internal:7444" || runtimeParsed.Path != "/tenant_team-42" {
		t.Fatalf("runtime URL target = %s%s, want pooler and tenant database", runtimeParsed.Host, runtimeParsed.Path)
	}
	if got := runtimeParsed.User.Username(); got != "runtime-user" {
		t.Fatalf("runtime user = %q, want runtime-user", got)
	}
	if got, _ := runtimeParsed.User.Password(); got != runtimePassword {
		t.Fatalf("runtime password = %q, want original password", got)
	}
	if migrationParsed.Host != "db.example.test:5432" || migrationParsed.Path != "/tenant_team-42" {
		t.Fatalf("migration URL target = %s%s, want direct tenant database", migrationParsed.Host, migrationParsed.Path)
	}
	if got := migrationParsed.Query().Encode(); got != "application_name=master&sslmode=verify-full" {
		t.Fatalf("migration query = %q, want original TLS and query parameters", got)
	}
	if got := migrationParsed.User.Username(); got != "admin" {
		t.Fatalf("migration user = %q, want admin", got)
	}
	if got, _ := migrationParsed.User.Password(); got != migrationPassword {
		t.Fatalf("migration password = %q, want original direct credential", got)
	}
	if strings.Contains(runtimeURL, "db.example.test") || strings.Contains(runtimeURL, migrationPassword) {
		t.Fatalf("runtime URL leaked direct migration endpoint or credential: %q", runtimeURL)
	}
}

func TestBuildTenantDatabaseURLsRejectsInvalidInputsFailClosed(t *testing.T) {
	validDirect := "postgres://" + url.UserPassword("admin", "fixture-credential").String() + "@db.example.test:5432/tenant_{slug}?sslmode=require"
	tests := []struct {
		name, slug, direct, host, port, user, password string
	}{
		{name: "missing runtime user", slug: "team-a", direct: validDirect, host: "pooler", port: "6432", password: "secret"},
		{name: "missing runtime password", slug: "team-a", direct: validDirect, host: "pooler", port: "6432", user: "runtime"},
		{name: "malformed direct URL", slug: "team-a", direct: "://not a URL", host: "pooler", port: "6432", user: "runtime", password: "secret"},
		{name: "unsupported direct URL scheme", slug: "team-a", direct: "http://db.example.test/tenant_{slug}", host: "pooler", port: "6432", user: "runtime", password: "secret"},
		{name: "invalid slug", slug: "../other", direct: validDirect, host: "pooler", port: "6432", user: "runtime", password: "secret"},
		{name: "empty pooler host", slug: "team-a", direct: validDirect, port: "6432", user: "runtime", password: "secret"},
		{name: "pooler host with port injection", slug: "team-a", direct: validDirect, host: "pooler:9999", port: "6432", user: "runtime", password: "secret"},
		{name: "non-numeric pooler port", slug: "team-a", direct: validDirect, host: "pooler", port: "abc", user: "runtime", password: "secret"},
		{name: "out of range pooler port", slug: "team-a", direct: validDirect, host: "pooler", port: "65536", user: "runtime", password: "secret"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runtimeURL, _, err := buildTenantDatabaseURLs(tt.slug, tt.direct, tt.host, tt.port, tt.user, tt.password)
			if err == nil {
				t.Fatal("expected invalid tenant database URL input to fail")
			}
			if runtimeURL != "" {
				t.Fatalf("failed URL construction returned runtime URL %q; must fail closed", runtimeURL)
			}
		})
	}
}

func TestQuotePostgresIdentifierEscapesEmbeddedQuotes(t *testing.T) {
	got := quotePostgresIdentifier(`tenant"; DROP ROLE postgres; --`)
	want := `"tenant""; DROP ROLE postgres; --"`
	if got != want {
		t.Fatalf("quoted identifier = %q, want %q", got, want)
	}
}

func TestProvisionTenantDatabaseRejectsUnsafeRuntimePassword(t *testing.T) {
	if validTenantRuntimePassword("password'; DROP ROLE postgres; --") {
		t.Fatal("unsafe runtime password was accepted")
	}
	if !validTenantRuntimePassword("runtime-password_for-test-123") {
		t.Fatal("valid generated runtime password was rejected")
	}
}
