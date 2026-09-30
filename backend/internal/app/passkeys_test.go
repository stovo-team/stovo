package app

import (
	"net/http/httptest"
	"testing"

	"stovo-messenger/backend/internal/config"
)

func TestWebAuthnOriginMustBeConfiguredAndSecure(t *testing.T) {
	server := &Server{cfg: config.Config{AppURL: "https://chat.example.test"}}
	for _, tc := range []struct {
		name, origin string
		wantErr      bool
	}{
		{name: "configured origin", origin: "https://chat.example.test"},
		{name: "unlisted subdomain", origin: "https://evil.chat.example.test", wantErr: true},
		{name: "http public hostname", origin: "http://chat.example.test", wantErr: true},
		{name: "different hostname", origin: "https://other.example.test", wantErr: true},
		{name: "opaque origin", origin: "null", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest("POST", "/api/auth/passkeys/authentication/options", nil)
			request.Header.Set("Origin", tc.origin)
			_, err := server.webAuthnForRequest(request)
			if (err != nil) != tc.wantErr {
				t.Fatalf("webAuthnForRequest(%q) error = %v, wantErr %v", tc.origin, err, tc.wantErr)
			}
		})
	}
}

func TestWebAuthnAllowsConfiguredLocalhostDevelopmentOrigin(t *testing.T) {
	server := &Server{cfg: config.Config{AppURL: "http://localhost:8000", CORSAllowedOrigins: []string{"http://localhost:5173"}}}
	request := httptest.NewRequest("POST", "/api/auth/passkeys/authentication/options", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	if _, err := server.webAuthnForRequest(request); err != nil {
		t.Fatalf("configured localhost origin rejected: %v", err)
	}
}

func TestWebAuthnRejectsUnconfiguredLocalhostPort(t *testing.T) {
	server := &Server{cfg: config.Config{AppURL: "http://localhost:8000"}}
	request := httptest.NewRequest("POST", "/api/auth/passkeys/authentication/options", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	if _, err := server.webAuthnForRequest(request); err == nil {
		t.Fatal("unconfigured localhost origin was accepted")
	}
}
