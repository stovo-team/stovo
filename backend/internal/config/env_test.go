package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseEnvLine(t *testing.T) {
	tests := []struct {
		input   string
		wantKey string
		wantVal string
		wantOK  bool
	}{
		{input: "# comment", wantOK: false},
		{input: "   ", wantOK: false},
		{input: "GROQ_API_KEY=gsk_123456", wantKey: "GROQ_API_KEY", wantVal: "gsk_123456", wantOK: true},
		{input: "export GROQ_API_KEY=gsk_123456", wantKey: "GROQ_API_KEY", wantVal: "gsk_123456", wantOK: true},
		{input: `GROQ_API_KEY="gsk_quoted_key"`, wantKey: "GROQ_API_KEY", wantVal: "gsk_quoted_key", wantOK: true},
		{input: `GROQ_API_KEY='gsk_single_quoted'`, wantKey: "GROQ_API_KEY", wantVal: "gsk_single_quoted", wantOK: true},
		{input: `GROQ_API_KEY=gsk_test # trailing comment`, wantKey: "GROQ_API_KEY", wantVal: "gsk_test", wantOK: true},
		{input: `GROQ_API_KEY="gsk_quoted_with_comment" # comment here`, wantKey: "GROQ_API_KEY", wantVal: "gsk_quoted_with_comment", wantOK: true},
		{input: `APP_NAME="Stovo\nMessenger"`, wantKey: "APP_NAME", wantVal: "Stovo\nMessenger", wantOK: true},
		{input: "INVALID_NO_EQUALS", wantOK: false},
	}

	for _, tt := range tests {
		k, v, ok := parseEnvLine(tt.input)
		if ok != tt.wantOK {
			t.Errorf("parseEnvLine(%q) ok = %v, want %v", tt.input, ok, tt.wantOK)
			continue
		}
		if ok {
			if k != tt.wantKey {
				t.Errorf("parseEnvLine(%q) key = %q, want %q", tt.input, k, tt.wantKey)
			}
			if v != tt.wantVal {
				t.Errorf("parseEnvLine(%q) val = %q, want %q", tt.input, v, tt.wantVal)
			}
		}
	}
}

func TestIsPlaceholderKey(t *testing.T) {
	placeholders := []string{
		"",
		"   ",
		"gsk_your_groq_api_key_here",
		"your_groq_api_key_here",
		"change_me",
		"change_me_too",
		"gsk_your_xxx",
		"<your_api_key>",
	}
	for _, p := range placeholders {
		if !IsPlaceholderKey(p) {
			t.Errorf("IsPlaceholderKey(%q) = false, want true", p)
		}
	}

	validKeys := []string{
		"gsk_abcdef1234567890",
		"gsk_9876543210abcdef",
		"my-secret-key-12345",
	}
	for _, k := range validKeys {
		if IsPlaceholderKey(k) {
			t.Errorf("IsPlaceholderKey(%q) = true, want false", k)
		}
	}
}

func TestLoadEnvFile(t *testing.T) {
	tmpDir := t.TempDir()
	envPath := filepath.Join(tmpDir, ".env")
	content := "TEST_GROQ_KEY_ENV_TEST=gsk_my_secret_key\nTEST_ANOTHER_VAR=\"hello world\"\n"
	if err := os.WriteFile(envPath, []byte(content), 0600); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// Clean up environment after test
	defer os.Unsetenv("TEST_GROQ_KEY_ENV_TEST")
	defer os.Unsetenv("TEST_ANOTHER_VAR")

	if err := LoadEnvFile(envPath, false); err != nil {
		t.Fatalf("LoadEnvFile failed: %v", err)
	}

	if got := os.Getenv("TEST_GROQ_KEY_ENV_TEST"); got != "gsk_my_secret_key" {
		t.Errorf("os.Getenv(TEST_GROQ_KEY_ENV_TEST) = %q, want %q", got, "gsk_my_secret_key")
	}
	if got := os.Getenv("TEST_ANOTHER_VAR"); got != "hello world" {
		t.Errorf("os.Getenv(TEST_ANOTHER_VAR) = %q, want %q", got, "hello world")
	}
}
