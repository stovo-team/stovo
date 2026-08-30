package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterMCPRoutesPreservesEndpointPaths(t *testing.T) {
	router := chi.NewRouter()
	RegisterMCPRoutes(router, stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-MCP-Route", r.URL.Path)
		w.WriteHeader(stdhttp.StatusNoContent)
	}))

	for _, path := range []string{"/mcp", "/mcp/"} {
		t.Run(path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPost, path, nil))
			if recorder.Code != stdhttp.StatusNoContent {
				t.Fatalf("status=%d", recorder.Code)
			}
			if recorder.Header().Get("X-MCP-Route") != path {
				t.Fatalf("handler was not invoked for %s", path)
			}
		})
	}
}

func TestRegisterMCPRoutesNilHandlerDoesNotRegisterRoutes(t *testing.T) {
	router := chi.NewRouter()
	RegisterMCPRoutes(router, nil)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPost, "/mcp", nil))
	if recorder.Code != stdhttp.StatusNotFound {
		t.Fatalf("status=%d, want 404", recorder.Code)
	}
}
