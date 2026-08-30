package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestTranscriptionStatusOwnsRouteExtractionAndAuthorization(t *testing.T) {
	handler := NewTranscriptionHandler(TranscriptionOperations{
		CallByRoom: func(room string) (TranscriptionCall, bool) {
			return TranscriptionCall{ID: room}, room == "room-1"
		},
		IsParticipant: func(call TranscriptionCall, userID string) bool { return userID == "user-1" },
		Latest:        func(context.Context, string) (any, error) { return map[string]string{"status": "recording"}, nil },
	})
	router := chi.NewRouter()
	router.Get("/api/calls/{roomId}/transcription/status", func(w http.ResponseWriter, r *http.Request) {
		handler.Status(w, r, TranscriptionActor{ID: "user-1"})
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/calls/room-1/transcription/status", nil))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "recording") {
		t.Fatalf("status response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestTranscriptionUpdateSegmentPreservesAdminContract(t *testing.T) {
	updated := ""
	handler := NewTranscriptionHandler(TranscriptionOperations{
		IsAdministrator: func(role string) bool { return role == "admin" },
		UpdateSegment: func(_ context.Context, id, text string) error {
			updated = id + ":" + text
			return nil
		},
	})
	router := chi.NewRouter()
	router.Patch("/api/calls/{roomId}/transcript/segments/{segmentId}", func(w http.ResponseWriter, r *http.Request) {
		handler.UpdateSegment(w, r, TranscriptionActor{Role: "admin"})
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPatch, "/api/calls/r/transcript/segments/s1", strings.NewReader(`{"cleanedText":"fixed"}`)))
	if recorder.Code != http.StatusOK || updated != "s1:fixed" {
		t.Fatalf("update = %d %q", recorder.Code, updated)
	}
}
