package config

import (
	"slices"
	"testing"
)

func TestLoadAllowsSecureCapacitorAndroidOriginByDefault(t *testing.T) {
	t.Setenv("NATIVE_CLIENT_ORIGINS", "")
	t.Setenv("CORS_ALLOWED_ORIGINS", "")

	got, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !slices.Contains(got.NativeClientOrigins, "https://localhost") {
		t.Errorf("NativeClientOrigins = %#v, want secure Android WebView origin https://localhost", got.NativeClientOrigins)
	}
	if !slices.Contains(got.CORSAllowedOrigins, "https://localhost") {
		t.Errorf("CORSAllowedOrigins = %#v, want secure Android WebView origin https://localhost", got.CORSAllowedOrigins)
	}
}
