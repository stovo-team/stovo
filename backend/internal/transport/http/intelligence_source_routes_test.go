package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestIntelligenceSourceRouteIsMountedBehindDisabledGate(t *testing.T) {
	router := chi.NewRouter()
	router.Mount(intelligenceSourceBasePath, NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{}))
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/intelligence/source/events", nil)
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("mounted source status = %d, want disabled 403; body=%s", recorder.Code, recorder.Body.String())
	}
}
