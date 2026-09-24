package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"stovo-messenger/backend/internal/config"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

func TestGetClientIPTrustsForwardingOnlyFromPrivateProxyPeers(t *testing.T) {
	server := &Server{cfg: config.Config{TrustedProxyCIDRs: []string{"172.30.0.2/32", "127.0.0.1/32", "::1/128"}}}
	for _, test := range []struct{ name, remote, forwarded, want string }{
		{name: "public peer cannot spoof forwarded IP", remote: "203.0.113.8:8000", forwarded: "198.51.100.9", want: "203.0.113.8"},
		{name: "explicit reverse proxy forwards client IP", remote: "172.30.0.2:8000", forwarded: "198.51.100.9, 172.30.0.1", want: "198.51.100.9"},
		{name: "untrusted sibling container cannot spoof forwarded IP", remote: "172.19.0.4:8000", forwarded: "198.51.100.9", want: "172.19.0.4"},
		{name: "IPv6 remote address", remote: "[2001:db8::4]:8000", want: "2001:db8::4"},
		{name: "IPv6 client forwarded by local proxy", remote: "[::1]:8000", forwarded: "2001:db8::9", want: "2001:db8::9"},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.RemoteAddr = test.remote
			r.Header.Set("X-Forwarded-For", test.forwarded)
			if got := server.getClientIP(r); got != test.want {
				t.Fatalf("getClientIP() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestSocketClientIPMiddlewareOverwritesClientSuppliedIPHeader(t *testing.T) {
	var got string
	next := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { got = r.Header.Get(socketClientIPHeader) })
	handler := socketClientIPMiddleware(next, func(*http.Request) string { return "198.51.100.9" })
	request := httptest.NewRequest(http.MethodGet, "/socket.io/", nil)
	request.Header.Set(socketClientIPHeader, "192.0.2.99")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if got != "198.51.100.9" {
		t.Fatalf("stamped socket client IP = %q, want trusted resolver result", got)
	}
}

func TestWriteAuthSuccessKeepsRefreshTokenOutOfBrowserJSON(t *testing.T) {
	server := &Server{cfg: config.Config{
		RefreshCookieName:   "refresh",
		RefreshTokenTTL:     24 * time.Hour,
		NativeClientOrigins: []string{"capacitor://localhost"},
	}}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Header.Set("Origin", "https://app.example.test")
	recorder := httptest.NewRecorder()

	server.writeAuthSuccess(recorder, request, http.StatusOK, httptransport.AuthSuccess[userPublic]{
		AccessToken: "access", TokenType: "Bearer", User: userPublic{}, RefreshToken: "refresh-secret",
	})

	var response map[string]any
	if err := json.NewDecoder(recorder.Result().Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if _, ok := response["refreshToken"]; ok {
		t.Fatal("browser response exposed refresh token")
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].Value != "refresh-secret" {
		t.Fatalf("unexpected refresh cookie: %#v", cookies)
	}
}

func TestWriteAuthSuccessScopesCookieToClusterAuthPath(t *testing.T) {
	server := &Server{cfg: config.Config{RefreshCookieName: "refresh", RefreshTokenTTL: 24 * time.Hour}}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Header.Set("X-Forwarded-Prefix", "/s/family-1")
	recorder := httptest.NewRecorder()

	server.writeAuthSuccess(recorder, request, http.StatusOK, httptransport.AuthSuccess[userPublic]{RefreshToken: "secret"})

	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Path != "/s/family-1/api/auth" {
		t.Fatalf("refresh cookie path = %#v, want /s/family-1/api/auth", cookies)
	}

	clearRecorder := httptest.NewRecorder()
	server.clearRefreshCookie(clearRecorder, request)
	clearedCookies := clearRecorder.Result().Cookies()
	if len(clearedCookies) != 1 || clearedCookies[0].Path != cookies[0].Path || clearedCookies[0].MaxAge != -1 {
		t.Fatalf("cleared refresh cookie = %#v, want deletion at %q", clearedCookies, cookies[0].Path)
	}
}

func TestRefreshCookiePathRejectsUntrustedPrefix(t *testing.T) {
	server := &Server{cfg: config.Config{RefreshCookieName: "refresh"}}
	for _, prefix := range []string{"https://evil.example", "/api", "/s/family-1/extra", "/s/family-1%2f.."} {
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		request.Header.Set("X-Forwarded-Prefix", prefix)
		recorder := httptest.NewRecorder()
		server.clearRefreshCookie(recorder, request)
		cookies := recorder.Result().Cookies()
		if len(cookies) != 1 || cookies[0].Path != "/api/auth" {
			t.Errorf("prefix %q yielded cookie path %#v, want /api/auth", prefix, cookies)
		}
	}
}

func TestWriteAuthSuccessAllowsConfiguredNativeOrigin(t *testing.T) {
	server := &Server{cfg: config.Config{
		RefreshCookieName:   "refresh",
		NativeClientOrigins: []string{"capacitor://localhost"},
	}}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Header.Set("Origin", "capacitor://localhost")
	recorder := httptest.NewRecorder()

	server.writeAuthSuccess(recorder, request, http.StatusOK, httptransport.AuthSuccess[userPublic]{
		AccessToken: "access", TokenType: "Bearer", User: userPublic{}, RefreshToken: "refresh-secret",
	})

	var response map[string]any
	if err := json.NewDecoder(recorder.Result().Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response["refreshToken"] != "refresh-secret" {
		t.Fatalf("native refresh token = %#v", response["refreshToken"])
	}
}
