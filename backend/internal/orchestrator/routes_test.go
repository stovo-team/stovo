package orchestrator

import (
	"strings"
	"testing"
)

func TestBackendContainerEnvIncludesTurnConfiguration(t *testing.T) {
	env := backendContainerEnv("family", func(key, fallback string) string {
		values := map[string]string{
			"POSTGRES_USER":        "db-user",
			"POSTGRES_PASSWORD":    "db-password",
			"MINIO_ROOT_USER":      "minio-user",
			"MINIO_ROOT_PASSWORD":  "minio-password",
			"MASTER_SYSTEM_SECRET": "master-secret",
			"TURN_ENABLED":         "true",
			"TURN_HOST":            "calls.example.test",
			"TURN_PORT":            "3479",
			"TURN_REALM":           "family-calls",
			"TURN_USERNAME":        "turn-user",
			"TURN_PASSWORD":        "turn-password",
			"GROQ_API_KEY":         "gsk_test12345",
			"GROQ_STT_MODEL":       "whisper-large-v3-turbo",
		}
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	})

	joined := "\n" + strings.Join(env, "\n") + "\n"
	for _, want := range []string{
		"\nTURN_ENABLED=true\n",
		"\nTURN_HOST=calls.example.test\n",
		"\nTURN_PORT=3479\n",
		"\nTURN_REALM=family-calls\n",
		"\nTURN_USERNAME=turn-user\n",
		"\nTURN_PASSWORD=turn-password\n",
		"\nGROQ_API_KEY=gsk_test12345\n",
		"\nGROQ_STT_MODEL=whisper-large-v3-turbo\n",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("tenant backend is missing %q", strings.TrimSpace(want))
		}
	}
}

func TestBackendContainerEnvDefaultsToQwenASR(t *testing.T) {
	env := backendContainerEnv("family", func(_ string, fallback string) string { return fallback })
	joined := "\n" + strings.Join(env, "\n") + "\n"
	if !strings.Contains(joined, "\nGROQ_STT_MODEL=qwen3-asr-flash-2025-09-08\n") {
		t.Fatalf("tenant backend should default to Qwen ASR, got: %q", joined)
	}
}

func TestBackendContainerEnvUsesPublicIPWhenTurnHostIsUnset(t *testing.T) {
	env := backendContainerEnv("family", func(key, fallback string) string {
		if key == "PUBLIC_IP" {
			return "203.0.113.9"
		}
		return fallback
	})

	joined := "\n" + strings.Join(env, "\n") + "\n"
	if !strings.Contains(joined, "\nTURN_HOST=203.0.113.9\n") {
		t.Fatalf("TURN_HOST should fall back to PUBLIC_IP, got: %q", joined)
	}
}

func TestBackendContainerEnvIncludesNavTabsConfiguration(t *testing.T) {
	env := backendContainerEnv("family", func(key, fallback string) string {
		if key == "NAV_TABS" {
			return `{"chats":true,"storage":false,"plans":true,"settings":false}`
		}
		return fallback
	})

	joined := "\n" + strings.Join(env, "\n") + "\n"
	want := "\nNAV_TABS={\"chats\":true,\"storage\":false,\"plans\":true,\"settings\":false}\n"
	if !strings.Contains(joined, want) {
		t.Fatalf("NAV_TABS should be in environment, got: %q", joined)
	}
}

func TestBackendContainerEnvIncludesSupervisorChatTypes(t *testing.T) {
	env := backendContainerEnv("family", func(key, fallback string) string {
		if key == "CHAT_TYPES" {
			return `{"direct":true,"group":false,"channel":true,"voice":false}`
		}
		return fallback
	})
	joined := "\n" + strings.Join(env, "\n") + "\n"
	want := "\nCHAT_TYPES={\"direct\":true,\"group\":false,\"channel\":true,\"voice\":false}\n"
	if !strings.Contains(joined, want) {
		t.Fatalf("CHAT_TYPES should be in tenant environment, got: %q", joined)
	}
}

func TestBackendContainerEnvUsesExplicitTrustedProxyCIDR(t *testing.T) {
	env := backendContainerEnv("family", func(key, fallback string) string {
		if key == "TRUSTED_PROXY_CIDRS" {
			return "172.33.0.2/32"
		}
		return fallback
	})
	for _, value := range env {
		if value == "TRUSTED_PROXY_CIDRS=172.33.0.2/32" {
			return
		}
	}
	t.Fatal("tenant backend did not receive the explicit Caddy proxy CIDR")
}

func TestProxyEndpointSettingsUsesUniqueCaddyAlias(t *testing.T) {
	settings := proxyEndpointSettings("family-1")
	if len(settings.Aliases) != 1 || settings.Aliases[0] != "stovo-backend-family-1-proxy" {
		t.Fatalf("proxy endpoint aliases = %#v", settings.Aliases)
	}
}

func TestBackendContainerEnvPrefersExternalDatabaseAndRedisURLs(t *testing.T) {
	env := backendContainerEnv("acdcbca1", func(key, fallback string) string {
		values := map[string]string{
			"DATABASE_URL":               "postgres://external.example.test:5432/stovo_db_{slug}?sslmode=require",
			"PGBOUNCER_ENABLED":          "true",
			"TENANT_DB_RUNTIME_USER":     "tenant-role",
			"TENANT_DB_RUNTIME_PASSWORD": "tenant-password",
			"REDIS_URL":                  "rediss://cache.example.test:6380/0",
		}
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	})

	got := parseEnvSlice(env)
	if got["MIGRATION_DATABASE_URL"] != "postgres://external.example.test:5432/stovo_db_acdcbca1?sslmode=require" {
		t.Fatalf("migration URL should preserve external host, slug, and TLS settings, got: %q", got["MIGRATION_DATABASE_URL"])
	}
	if got["DATABASE_URL"] != "postgres://tenant-role:tenant-password@pgbouncer:6432/stovo_db_acdcbca1?sslmode=disable" {
		t.Fatalf("runtime URL should use PgBouncer and the tenant database, got: %q", got["DATABASE_URL"])
	}
	if got["REDIS_URL"] != "rediss://cache.example.test:6380/0" {
		t.Fatalf("expected tenant backend to use the external Redis URL, got: %q", got["REDIS_URL"])
	}
}

func TestBackendContainerEnvSeparatesRuntimeAndMigrationDatabaseURLs(t *testing.T) {
	env := backendContainerEnv("space-a", func(key, fallback string) string {
		values := map[string]string{
			"POSTGRES_USER":              "admin-user",
			"POSTGRES_PASSWORD":          "admin-password",
			"PGBOUNCER_ENABLED":          "true",
			"PGBOUNCER_HOST":             "pool.internal",
			"PGBOUNCER_PORT":             "7444",
			"TENANT_DB_RUNTIME_USER":     "tenant-user",
			"TENANT_DB_RUNTIME_PASSWORD": "tenant-secret",
			"DATABASE_URL":               "postgres://admin-user:admin-password@db.internal:5432/app_{slug}?sslmode=verify-full&application_name=master",
		}
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	})

	got := parseEnvSlice(env)
	if got["MIGRATION_DATABASE_URL"] != "postgres://admin-user:admin-password@db.internal:5432/app_space-a?sslmode=verify-full&application_name=master" {
		t.Fatalf("migration URL must retain direct host, admin credentials, and query parameters, got: %q", got["MIGRATION_DATABASE_URL"])
	}
	if got["DATABASE_URL"] != "postgres://tenant-user:tenant-secret@pool.internal:7444/app_space-a?sslmode=disable" {
		t.Fatalf("runtime URL must use tenant credentials and pooler endpoint, got: %q", got["DATABASE_URL"])
	}
	if strings.Contains(got["DATABASE_URL"], "admin-password") || strings.Contains(got["DATABASE_URL"], "db.internal") {
		t.Fatalf("runtime URL leaked direct migration credentials or endpoint: %q", got["DATABASE_URL"])
	}
}

func TestBackendContainerEnvEscapesRuntimeCredentialsAndUsesPoolerDefaults(t *testing.T) {
	env := backendContainerEnv("space-b", func(key, fallback string) string {
		values := map[string]string{
			"PGBOUNCER_ENABLED":          "true",
			"TENANT_DB_RUNTIME_USER":     "tenant+user@example.test",
			"TENANT_DB_RUNTIME_PASSWORD": "secret:@/ with?symbols",
		}
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	})

	got := parseEnvSlice(env)
	if got["DATABASE_URL"] != "postgres://tenant%2Buser%40example.test:secret%3A%40%2F%20with%3Fsymbols@pgbouncer:6432/stovo_db_space-b?sslmode=disable" {
		t.Fatalf("runtime URL should escape credentials and use pooler defaults, got: %q", got["DATABASE_URL"])
	}
	if got["MIGRATION_DATABASE_URL"] != "postgres://postgres:postgres@postgres:5432/stovo_db_space-b?sslmode=disable" {
		t.Fatalf("default migration URL should remain direct, got: %q", got["MIGRATION_DATABASE_URL"])
	}
}

func TestTenantDBPasswordEncryptionRoundTrip(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef"
	password := "tenant secret with symbols: @/?"

	ciphertext, err := encryptTenantDBPassword(password, key)
	if err != nil {
		t.Fatalf("encrypt tenant password: %v", err)
	}
	if strings.Contains(ciphertext, password) {
		t.Fatal("encrypted tenant password contains plaintext")
	}
	got, err := decryptTenantDBPassword(ciphertext, key)
	if err != nil {
		t.Fatalf("decrypt tenant password: %v", err)
	}
	if got != password {
		t.Fatalf("decrypted password = %q, want original password", got)
	}
}

func TestTenantDBPasswordEncryptionRejectsMissingOrInvalidKey(t *testing.T) {
	if _, err := encryptTenantDBPassword("tenant-secret", ""); err == nil {
		t.Fatal("encrypt with missing key should fail")
	}
	if _, err := encryptTenantDBPassword("tenant-secret", "not-a-valid-key"); err == nil {
		t.Fatal("encrypt with invalid key should fail")
	}
	ciphertext, err := encryptTenantDBPassword("tenant-secret", "0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("encrypt fixture: %v", err)
	}
	for _, key := range []string{"", "not-a-valid-key"} {
		if _, err := decryptTenantDBPassword(ciphertext, key); err == nil {
			t.Errorf("decrypt with key %q should fail", key)
		}
	}
}

func TestTenantDBPasswordEncryptionRejectsTamperedCiphertext(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef"
	ciphertext, err := encryptTenantDBPassword("tenant-secret", key)
	if err != nil {
		t.Fatalf("encrypt fixture: %v", err)
	}
	mutated := "A" + ciphertext[1:]
	if strings.HasPrefix(ciphertext, "A") {
		mutated = "B" + ciphertext[1:]
	}
	if _, err := decryptTenantDBPassword(mutated, key); err == nil {
		t.Fatal("decrypting tampered ciphertext should fail authentication")
	}
}

func TestGetMasterSecretFallback(t *testing.T) {
	t.Setenv("MASTER_SYSTEM_SECRET", "")
	secret := getMasterSecret()
	if string(secret) != "super_secret_master_key_123" {
		t.Fatalf("expected fallback secret, got %q", string(secret))
	}

	t.Setenv("MASTER_SYSTEM_SECRET", "custom_secret")
	secret = getMasterSecret()
	if string(secret) != "custom_secret" {
		t.Fatalf("expected custom secret, got %q", string(secret))
	}
}

func TestDefaultNavTabs(t *testing.T) {
	tabs := defaultNavTabs()
	if !tabs.Chats || !tabs.Storage || !tabs.Plans || !tabs.Settings {
		t.Fatalf("expected all tabs true by default, got: %+v", tabs)
	}
}
