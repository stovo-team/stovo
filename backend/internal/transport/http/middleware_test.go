package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSReflectsOriginAndShortCircuitsPreflight(t *testing.T) {
	called := false
	handler := CORS("https://app.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
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
	if response.Code != stdhttp.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, stdhttp.StatusOK)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "https://browser.example.test" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("allow credentials = %q", got)
	}
}

func TestCORSUsesAppURLWithoutOrigin(t *testing.T) {
	handler := CORS("https://app.example.test")(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(stdhttp.MethodGet, "/", nil))
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.test" {
		t.Fatalf("allow origin = %q", got)
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
