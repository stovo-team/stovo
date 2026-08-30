package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterSocketRoutesPreservesHandshakeAndPollingPaths(t *testing.T) {
	router := chi.NewRouter()
	RegisterSocketRoutes(router, stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-Socket-Route", r.Method)
		w.WriteHeader(stdhttp.StatusNoContent)
	}))

	for _, request := range []struct {
		method string
		path   string
	}{
		{stdhttp.MethodGet, "/socket.io/"},
		{stdhttp.MethodPost, "/socket.io/"},
		{stdhttp.MethodGet, "/socket.io/polling"},
		{stdhttp.MethodPost, "/socket.io/polling"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent {
				t.Fatalf("status=%d", recorder.Code)
			}
			if recorder.Header().Get("X-Socket-Route") != request.method {
				t.Fatalf("handler was not invoked for %s %s", request.method, request.path)
			}
		})
	}
}
