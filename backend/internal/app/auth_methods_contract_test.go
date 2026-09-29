package app

import (
	"net/http"
	"strings"
	"testing"
)

// These black-box checks deliberately define the initial HTTP surface before
// its handlers exist. Invalid/unauthenticated requests must reach the route
// contract (400/401/422), rather than falling through to an unrelated 404.
// Ceremony correctness and persistence behavior belong in the focused tests
// added with the corresponding service implementation.
func TestPasskeyAndQRAuthRoutesAreMounted(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	cases := []struct {
		name, method, path, body string
		wantStatus               int
	}{
		{name: "registration options require auth", method: http.MethodPost, path: "/api/auth/passkeys/registration/options", body: `{}`, wantStatus: http.StatusUnauthorized},
		{name: "registration completion requires auth", method: http.MethodPost, path: "/api/auth/passkeys/registration/verify", body: `{}`, wantStatus: http.StatusUnauthorized},
		{name: "authentication options validate request", method: http.MethodPost, path: "/api/auth/passkeys/authentication/options", body: `{}`, wantStatus: http.StatusUnprocessableEntity},
		{name: "authentication completion validates response", method: http.MethodPost, path: "/api/auth/passkeys/authentication/verify", body: `{}`, wantStatus: http.StatusUnprocessableEntity},
		{name: "QR request is created only from a valid request", method: http.MethodPost, path: "/api/auth/qr-login", body: `{}`, wantStatus: http.StatusUnprocessableEntity},
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
			defer response.Body.Close()
			if response.StatusCode != tc.wantStatus {
				t.Fatalf("status = %d, want %d", response.StatusCode, tc.wantStatus)
			}
			if response.StatusCode != http.StatusOK && len(response.Cookies()) != 0 {
				t.Fatalf("rejected request unexpectedly set cookies: %#v", response.Cookies())
			}
		})
	}
}

func TestPasskeyAndQRAuthRoutesRejectWrongMethods(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	for _, tc := range []struct{ path, method string }{
		{path: "/api/auth/passkeys/registration/options", method: http.MethodGet},
		{path: "/api/auth/passkeys/authentication/options", method: http.MethodGet},
		{path: "/api/auth/qr-login", method: http.MethodGet},
		{path: "/api/auth/qr-login/request-1/approve", method: http.MethodGet},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			request, err := http.NewRequest(tc.method, serverURL.URL+tc.path, nil)
			if err != nil {
				t.Fatal(err)
			}
			response, err := client.Do(request)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusMethodNotAllowed {
				t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusMethodNotAllowed)
			}
		})
	}
}
