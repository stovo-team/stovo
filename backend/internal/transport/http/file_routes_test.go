package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterFileRoutesPreservesMethodsAndPaths(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-File-Route", r.Method+" "+r.URL.Path)
		w.WriteHeader(stdhttp.StatusNoContent)
	})
	routes := FileRoutes{
		Upload: handler, ReserveDirectUpload: handler, GetDirectUpload: handler,
		CompleteDirectUpload: handler, List: handler, Get: handler,
		CreateDirectAccess: handler, Download: handler, Thumbnail: handler,
		CreatePlaybackToken: handler, UpdatePreferences: handler, Transcribe: handler,
		GetTranscript: handler, Delete: handler, StreamMedia: handler,
	}
	RegisterFileRoutes(router, routes)

	for _, request := range []struct{ method, path string }{
		{stdhttp.MethodPost, "/api/files/upload"},
		{stdhttp.MethodPost, "/api/files/uploads"},
		{stdhttp.MethodGet, "/api/files/uploads/upload-1"},
		{stdhttp.MethodPost, "/api/files/uploads/upload-1/complete"},
		{stdhttp.MethodGet, "/api/files"},
		{stdhttp.MethodGet, "/api/files/file-1"},
		{stdhttp.MethodPost, "/api/files/file-1/access"},
		{stdhttp.MethodGet, "/api/files/file-1/download"},
		{stdhttp.MethodGet, "/api/files/file-1/thumbnail"},
		{stdhttp.MethodPost, "/api/files/file-1/playback-token"},
		{stdhttp.MethodPatch, "/api/files/file-1/preferences"},
		{stdhttp.MethodPost, "/api/files/file-1/transcribe"},
		{stdhttp.MethodGet, "/api/files/file-1/transcript"},
		{stdhttp.MethodDelete, "/api/files/file-1"},
		{stdhttp.MethodGet, "/api/media/file-1"},
		{stdhttp.MethodHead, "/api/media/file-1"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent {
				t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusNoContent)
			}
			if recorder.Header().Get("X-File-Route") != request.method+" "+request.path {
				t.Fatalf("handler not invoked for %s %s", request.method, request.path)
			}
		})
	}
}

func TestRegisterFileRoutesRejectsWrongMethod(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {})
	RegisterFileRoutes(router, FileRoutes{
		Upload: handler, ReserveDirectUpload: handler, GetDirectUpload: handler,
		CompleteDirectUpload: handler, List: handler, Get: handler,
		CreateDirectAccess: handler, Download: handler, Thumbnail: handler,
		CreatePlaybackToken: handler, UpdatePreferences: handler, Transcribe: handler,
		GetTranscript: handler, Delete: handler, StreamMedia: handler,
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPut, "/api/files/upload", nil))
	if recorder.Code != stdhttp.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusMethodNotAllowed)
	}
}
