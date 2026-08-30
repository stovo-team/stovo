package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterCoreRoutesPreservesMethodsAndPaths(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-Core-Route", r.Method+" "+r.URL.Path)
		w.WriteHeader(stdhttp.StatusNoContent)
	})
	RegisterCoreRoutes(router, CoreRoutes{
		AssetLinks: handler, Health: handler, HealthDB: handler, HealthRedis: handler, Sync: handler,
	})

	for _, request := range []struct{ method, path string }{
		{stdhttp.MethodGet, "/.well-known/assetlinks.json"},
		{stdhttp.MethodGet, "/api/health"},
		{stdhttp.MethodGet, "/api/health/db"},
		{stdhttp.MethodGet, "/api/health/redis"},
		{stdhttp.MethodGet, "/api/sync"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent {
				t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusNoContent)
			}
			if recorder.Header().Get("X-Core-Route") != request.method+" "+request.path {
				t.Fatalf("handler not invoked for %s %s", request.method, request.path)
			}
		})
	}
}

func TestRegisterCoreRoutesRejectsWrongMethod(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {})
	RegisterCoreRoutes(router, CoreRoutes{
		AssetLinks: handler, Health: handler, HealthDB: handler, HealthRedis: handler, Sync: handler,
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPost, "/api/health", nil))
	if recorder.Code != stdhttp.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusMethodNotAllowed)
	}
}
