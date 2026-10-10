package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
)

func TestLoadIntelligenceOIDCDefaultsDisabled(t *testing.T) {
	for _, key := range intelligenceOIDCEnvironmentKeys() {
		t.Setenv(key, "")
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.IntelligenceOIDCEnabled {
		t.Fatal("Intelligence OIDC must default to disabled")
	}
}

func TestLoadAcceptsCanonicalIntelligenceOIDCConfig(t *testing.T) {
	for key, value := range intelligenceOIDCTestEnvironment(t) {
		t.Setenv(key, value)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load valid OIDC config: %v", err)
	}
	if !cfg.IntelligenceOIDCEnabled {
		t.Fatal("valid enabled OIDC config was not retained")
	}
	if cfg.IntelligenceOIDCIssuer != "https://messenger.example" {
		t.Fatal("canonical OIDC issuer was not retained")
	}
	if cfg.IntelligenceOIDCClientID != "intelligence-test-client" || cfg.IntelligenceOIDCClientSecret != "synthetic-confidential-secret" {
		t.Fatal("registered OIDC client configuration was not retained")
	}
	if len(cfg.IntelligenceOIDCRedirectURIs) != 1 || cfg.IntelligenceOIDCRedirectURIs[0] != "https://intelligence.example/oauth/callback" {
		t.Fatal("exact OIDC callback allow-list was not retained")
	}
}

func TestLoadRejectsInvalidEnabledIntelligenceOIDCConfig(t *testing.T) {
	valid := intelligenceOIDCTestEnvironment(t)
	cases := []struct {
		name  string
		key   string
		value string
	}{
		{name: "non-HTTPS issuer", key: "INTELLIGENCE_OIDC_ISSUER", value: "http://messenger.example"},
		{name: "issuer with trailing slash", key: "INTELLIGENCE_OIDC_ISSUER", value: "https://messenger.example/"},
		{name: "issuer with query", key: "INTELLIGENCE_OIDC_ISSUER", value: "https://messenger.example?tenant=x"},
		{name: "issuer with empty query delimiter", key: "INTELLIGENCE_OIDC_ISSUER", value: "https://messenger.example?"},
		{name: "issuer with fragment", key: "INTELLIGENCE_OIDC_ISSUER", value: "https://messenger.example#fragment"},
		{name: "issuer with non-canonical host case", key: "INTELLIGENCE_OIDC_ISSUER", value: "https://Messenger.example"},
		{name: "issuer with explicit default port", key: "INTELLIGENCE_OIDC_ISSUER", value: "https://messenger.example:443"},
		{name: "missing client id", key: "INTELLIGENCE_OIDC_CLIENT_ID"},
		{name: "missing confidential secret", key: "INTELLIGENCE_OIDC_CLIENT_SECRET"},
		{name: "missing callback", key: "INTELLIGENCE_OIDC_REDIRECT_URIS"},
		{name: "callback contains fragment", key: "INTELLIGENCE_OIDC_REDIRECT_URIS", value: "https://intelligence.example/callback#part"},
		{name: "callback has empty query delimiter", key: "INTELLIGENCE_OIDC_REDIRECT_URIS", value: "https://intelligence.example/callback?"},
		{name: "duplicate callback", key: "INTELLIGENCE_OIDC_REDIRECT_URIS", value: "https://intelligence.example/callback,https://intelligence.example/callback"},
		{name: "missing signing key id", key: "INTELLIGENCE_OIDC_SIGNING_KEY_ID"},
		{name: "missing signing key", key: "INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM"},
		{name: "invalid signing key", key: "INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM", value: "not a PEM key"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for key, value := range valid {
				t.Setenv(key, value)
			}
			t.Setenv(tc.key, tc.value)
			if _, err := Load(); err == nil {
				t.Fatal("Load() accepted an enabled OIDC configuration with an invalid required value")
			}
		})
	}
}

func intelligenceOIDCTestEnvironment(t *testing.T) map[string]string {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate synthetic signing key: %v", err)
	}
	encodedKey, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("encode synthetic signing key: %v", err)
	}
	return map[string]string{
		"INTELLIGENCE_OIDC_ENABLED":                 "true",
		"INTELLIGENCE_OIDC_ISSUER":                  "https://messenger.example",
		"INTELLIGENCE_OIDC_CLIENT_ID":               "intelligence-test-client",
		"INTELLIGENCE_OIDC_CLIENT_SECRET":           "synthetic-confidential-secret",
		"INTELLIGENCE_OIDC_REDIRECT_URIS":           "https://intelligence.example/oauth/callback",
		"INTELLIGENCE_OIDC_SIGNING_KEY_ID":          "messenger-test-key-1",
		"INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM": string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encodedKey})),
	}
}

func intelligenceOIDCEnvironmentKeys() []string {
	return []string{
		"INTELLIGENCE_OIDC_ENABLED",
		"INTELLIGENCE_OIDC_ISSUER",
		"INTELLIGENCE_OIDC_CLIENT_ID",
		"INTELLIGENCE_OIDC_CLIENT_SECRET",
		"INTELLIGENCE_OIDC_REDIRECT_URIS",
		"INTELLIGENCE_OIDC_SIGNING_KEY_ID",
		"INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM",
	}
}
