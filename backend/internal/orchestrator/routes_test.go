package orchestrator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestProductionMultiserverOrchestratorReceivesPublicAppURL(t *testing.T) {
	composePath := filepath.Join("..", "..", "..", "deploy", "compose", "production-multiserver.yml")
	composeYAML, err := os.ReadFile(composePath)
	if err != nil {
		t.Fatalf("read production multi-server Compose config: %v", err)
	}

	var compose struct {
		Services map[string]struct {
			Environment map[string]string `yaml:"environment"`
		} `yaml:"services"`
	}
	if err := yaml.Unmarshal(composeYAML, &compose); err != nil {
		t.Fatalf("parse production multi-server Compose config: %v", err)
	}

	orchestrator, ok := compose.Services["orchestrator"]
	if !ok {
		t.Fatal("production multi-server Compose config has no orchestrator service")
	}
	if got, want := orchestrator.Environment["APP_URL"], "${APP_URL:-http://localhost:8000}"; got != want {
		t.Fatalf("orchestrator APP_URL mapping = %q, want %q", got, want)
	}
}

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
			"DATABASE_URL": "postgres://external.example.test:5432/stovo_db_{slug}?sslmode=require",
			"REDIS_URL":    "rediss://cache.example.test:6380/0",
		}
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	})

	joined := "\n" + strings.Join(env, "\n") + "\n"
	if !strings.Contains(joined, "\nDATABASE_URL=postgres://external.example.test:5432/stovo_db_acdcbca1?sslmode=require\n") {
		t.Fatalf("expected tenant backend to use the external database URL, got: %q", joined)
	}
	if !strings.Contains(joined, "\nREDIS_URL=rediss://cache.example.test:6380/0\n") {
		t.Fatalf("expected tenant backend to use the external Redis URL, got: %q", joined)
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
