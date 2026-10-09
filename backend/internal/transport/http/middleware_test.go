package http

import (
	"fmt"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSAllowsConfiguredOriginAndShortCircuitsPreflight(t *testing.T) {
	called := false
	handler := CORS("https://app.example.test", "https://browser.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		called = true
		w.WriteHeader(stdhttp.StatusCreated)
	}))
	request := httptest.NewRequest(stdhttp.MethodOptions, "/api/chats", nil)
	request.Header.Set("Origin", "https://browser.example.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if called {
		t.Fatal("next handler was called for preflight")
	}
	if response.Code != stdhttp.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, stdhttp.StatusNoContent)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "https://browser.example.test" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("allow credentials = %q", got)
	}
	if got := response.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("vary = %q", got)
	}
}

func TestCORSDoesNotEmitHeadersWithoutOrigin(t *testing.T) {
	handler := CORS("https://app.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(stdhttp.MethodGet, "/", nil))
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("allow origin = %q", got)
	}
}

func TestCORSRejectsUntrustedPreflight(t *testing.T) {
	handler := CORS("https://app.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		t.Fatal("next handler was called")
	}))
	request := httptest.NewRequest(stdhttp.MethodOptions, "/api/chats", nil)
	request.Header.Set("Origin", "https://evil.example.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != stdhttp.StatusForbidden {
		t.Fatalf("status = %d, want %d", response.Code, stdhttp.StatusForbidden)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("allow origin = %q", got)
	}
}

func TestCookieCSRFRejectsCrossOriginCookieRefresh(t *testing.T) {
	called := false
	handler := CookieCSRF("refresh", "https://app.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		called = true
		w.WriteHeader(stdhttp.StatusNoContent)
	}))
	request := httptest.NewRequest(stdhttp.MethodPost, "/api/auth/refresh", nil)
	request.AddCookie(&stdhttp.Cookie{Name: "refresh", Value: "secret"})
	request.Header.Set("Origin", "https://evil.example.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if called || response.Code != stdhttp.StatusForbidden {
		t.Fatalf("called=%v status=%d", called, response.Code)
	}
}

func TestCookieCSRFAcceptsConfiguredOrigin(t *testing.T) {
	handler := CookieCSRF("refresh", "https://app.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.WriteHeader(stdhttp.StatusNoContent)
	}))
	request := httptest.NewRequest(stdhttp.MethodPost, "/api/auth/logout", nil)
	request.AddCookie(&stdhttp.Cookie{Name: "refresh", Value: "secret"})
	request.Header.Set("Origin", "https://app.example.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != stdhttp.StatusNoContent {
		t.Fatalf("status=%d, want %d", response.Code, stdhttp.StatusNoContent)
	}
}

type capturedLog struct {
	loggerName, format string
	args               []any
}

func (l *capturedLog) Infof(loggerName, format string, args ...any) {
	l.loggerName, l.format, l.args = loggerName, format, args
}

func TestRequestLoggingRecordsCompletedStatus(t *testing.T) {
	logger := &capturedLog{}
	handler := RequestLogging(logger)(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) { w.WriteHeader(stdhttp.StatusAccepted) }))
	request := httptest.NewRequest(stdhttp.MethodPost, "/api/messages", nil)
	request.RemoteAddr = "127.0.0.1:4444"
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if logger.loggerName != "http" || len(logger.args) != 5 {
		t.Fatalf("log = %#v", logger)
	}
	if logger.args[0] != stdhttp.MethodPost || logger.args[1] != "/api/messages" || logger.args[2] != stdhttp.StatusAccepted || logger.args[3] != "127.0.0.1:4444" {
		t.Fatalf("log args = %#v", logger.args)
	}
}

type androidQRRequestLogger struct{ message string }

func (l *androidQRRequestLogger) Infof(_ string, format string, args ...any) {
	l.message = fmt.Sprintf(format, args...)
}

func TestAndroidQRLoginRequestLoggingRedactsBearerCode(t *testing.T) {
	logger := &androidQRRequestLogger{}
	handler := RequestLogging(logger)(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) { w.WriteHeader(stdhttp.StatusUnauthorized) }))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(stdhttp.MethodPost, "/api/auth/android-qr-login/raw-bearer-code/redeem", nil))
	if strings.Contains(logger.message, "raw-bearer-code") {
		t.Fatal("request log exposed Android QR bearer code")
	}
	if !strings.Contains(logger.message, "path=/api/auth/android-qr-login/[redacted]/redeem") {
		t.Fatalf("request path was not usefully redacted: %s", logger.message)
	}
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(stdhttp.MethodPost, "/api/auth/android-qr-login", nil))
	if !strings.Contains(logger.message, "path=/api/auth/android-qr-login status=") {
		t.Fatal("creation path logging changed")
	}
}
