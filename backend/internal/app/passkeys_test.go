package app

import (
	"net/http/httptest"
	"testing"

	"stovo-messenger/backend/internal/config"
)

func TestWebAuthnUnavailableMessageExplainsOriginConfiguration(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{
			name: "missing secure app URL",
			err:  errPasskeysRequireHTTPSAppURL,
			want: "Passkeys need APP_URL set to the site's public HTTPS address.",
		},
		{
			name: "insecure browser origin",
			err:  errPasskeysRequireSecureOrigin,
			want: "Passkeys require this page to use HTTPS (localhost is allowed for development).",
		},
		{
			name: "domain mismatch",
			err:  errPasskeyOriginMismatch,
			want: "This site's domain doesn't match APP_URL. Set APP_URL to the site's public HTTPS address.",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := webAuthnUnavailableMessage(tc.err); got != tc.want {
				t.Fatalf("webAuthnUnavailableMessage() = %q, want %q", got, tc.want)
			}
		})
	}
}

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
