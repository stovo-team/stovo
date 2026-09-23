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
