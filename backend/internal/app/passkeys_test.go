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
	server := &Server{cfg: config.Config{AppURL: "https://chat.example.test", CORSAllowedOrigins: []string{"https://web.chat.example.test"}}}
	for _, tc := range []struct {
		name, origin string
		wantErr      bool
	}{
		{name: "configured origin", origin: "https://chat.example.test"},
		{name: "configured secure browser origin", origin: "https://web.chat.example.test"},
		{name: "unlisted subdomain", origin: "https://evil.chat.example.test", wantErr: true},
		{name: "http public hostname", origin: "http://chat.example.test", wantErr: true},
		{name: "different hostname", origin: "https://other.example.test", wantErr: true},
		{name: "opaque origin", origin: "null", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest("POST", "/api/auth/passkeys/authentication/options", nil)
			request.Header.Set("Origin", tc.origin)
			wa, err := server.webAuthnForRequest(request)
			if (err != nil) != tc.wantErr {
				t.Fatalf("webAuthnForRequest(%q) error = %v, wantErr %v", tc.origin, err, tc.wantErr)
			}
			if err == nil && (wa.Config.RPID != "chat.example.test" || len(wa.Config.RPOrigins) != 1 || wa.Config.RPOrigins[0] != tc.origin) {
				t.Fatalf("browser RP configuration = %+v, want APP_URL hostname and browser origin only", wa.Config)
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

func TestWebAuthnAllowsConfiguredAndroidClientOrigin(t *testing.T) {
	const credentialOrigin = "android:apk-key-hash:GHz0pWhVAaCHx-QJWbM2nCwZ2dLDAIdyCJJEgUCRN_k"
	for _, origin := range []string{"capacitor://localhost", "capacitor://custom-host"} {
		t.Run(origin, func(t *testing.T) {
			server := &Server{cfg: config.Config{AppURL: "https://chat.example.test", NativeClientOrigins: []string{origin}}}
			request := httptest.NewRequest("POST", "https://untrusted.example/api/auth/passkeys/authentication/options", nil)
			request.Header.Set("Origin", origin)
			wa, err := server.webAuthnForRequest(request)
			if err != nil {
				t.Fatalf("configured Android request origin rejected: %v", err)
			}
			if wa.Config.RPID != "chat.example.test" {
				t.Fatalf("RPID = %q, want configured APP_URL hostname", wa.Config.RPID)
			}
			if len(wa.Config.RPOrigins) != 1 || wa.Config.RPOrigins[0] != credentialOrigin {
				t.Fatalf("credential origins = %v, want only published Android certificate", wa.Config.RPOrigins)
			}
			if !server.isAllowedWebAuthnOrigin(credentialOrigin, wa.Config.RPID) {
				t.Fatal("published Android credential origin rejected")
			}
			const otherCertificate = "android:apk-key-hash:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
			if server.isAllowedWebAuthnOrigin(otherCertificate, wa.Config.RPID) {
				t.Fatal("different Android signing certificate was accepted")
			}
		})
	}
}

func TestWebAuthnRejectsUnconfiguredAndroidClientOrigin(t *testing.T) {
	server := &Server{cfg: config.Config{AppURL: "https://chat.example.test", NativeClientOrigins: []string{"capacitor://localhost"}, CORSAllowedOrigins: []string{"capacitor://other-host"}}}
	for _, origin := range []string{"capacitor://other-host", "capacitor://localhost:1234", "android:apk-key-hash:GHz0pWhVAaCHx-QJWbM2nCwZ2dLDAIdyCJJEgUCRN_k"} {
		t.Run(origin, func(t *testing.T) {
			request := httptest.NewRequest("POST", "/api/auth/passkeys/authentication/options", nil)
			request.Header.Set("Origin", origin)
			if _, err := server.webAuthnForRequest(request); err == nil {
				t.Fatalf("unconfigured Android HTTP request origin %q was accepted", origin)
			}
		})
	}
}
