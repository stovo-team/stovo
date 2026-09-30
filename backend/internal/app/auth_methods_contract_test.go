package app

import (
	"net/http"
	"strings"
	"testing"
)

// These black-box checks cover public authentication routes and their basic
// validation behavior. Ceremony correctness and persistence behavior belong
// in the focused tests added with the corresponding service implementation.
func TestPasskeyAndQRAuthRoutesAreMounted(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	cases := []struct {
		name, method, path, body string
		wantStatus               int
	}{
		{name: "registration options require auth", method: http.MethodPost, path: "/api/auth/passkeys/registration/options", body: `{}`, wantStatus: http.StatusUnauthorized},
		{name: "registration completion requires auth", method: http.MethodPost, path: "/api/auth/passkeys/registration/verify", body: `{}`, wantStatus: http.StatusUnauthorized},
		{name: "authentication options require a secure origin", method: http.MethodPost, path: "/api/auth/passkeys/authentication/options", body: `{}`, wantStatus: http.StatusBadRequest},
		{name: "authentication completion validates response", method: http.MethodPost, path: "/api/auth/passkeys/authentication/verify", body: `{}`, wantStatus: http.StatusUnprocessableEntity},
		{name: "QR request can be created without a body", method: http.MethodPost, path: "/api/auth/qr-login", wantStatus: http.StatusCreated},
		{name: "unknown QR request is not disclosed", method: http.MethodGet, path: "/api/auth/qr-login/unknown-request", wantStatus: http.StatusNotFound},
		{name: "QR approval requires an authenticated phone", method: http.MethodPost, path: "/api/auth/qr-login/unknown-request/approve", body: `{}`, wantStatus: http.StatusUnauthorized},
		{name: "QR rejection requires an authenticated phone", method: http.MethodPost, path: "/api/auth/qr-login/unknown-request/reject", body: `{}`, wantStatus: http.StatusUnauthorized},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request, err := http.NewRequest(tc.method, serverURL.URL+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			if tc.body != "" {
				request.Header.Set("Content-Type", "application/json")
			}
			response, err := client.Do(request)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer func() { _ = response.Body.Close() }()
			if response.StatusCode != tc.wantStatus {
				t.Fatalf("status = %d, want %d", response.StatusCode, tc.wantStatus)
			}
			if response.StatusCode != http.StatusOK && len(response.Cookies()) != 0 {
				t.Fatalf("rejected request unexpectedly set cookies: %#v", response.Cookies())
			}
		})
	}
}
