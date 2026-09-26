package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterCallRoutesPreservesMethodsAndPaths(t *testing.T) {
	router := chi.NewRouter()
	handler := func(name string) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
			w.Header().Set("X-Call-Route", name)
			w.WriteHeader(stdhttp.StatusNoContent)
		})
	}
	RegisterCallRoutes(router, CallRoutes{
		GetICEServers: handler("ice"), CreateSFUToken: handler("token"),
		StartTranscription: handler("start"), StopTranscription: handler("stop"),
		GetTranscriptionStatus: handler("status"), GetTranscript: handler("transcript"),
		TranscribeCaptions:         handler("captions-transcribe"),
		RequestTranscriptionUpload: handler("request-upload"), UploadAudioChunkData: handler("upload-data"),
		CompleteTranscriptionUpload: handler("complete-upload"), UpdateTranscriptSegment: handler("segment"),
		GetTranscriptArtifact: handler("artifact"),
	})

	for _, request := range []struct{ method, path, want string }{
		{stdhttp.MethodGet, "/api/calls/ice-servers", "ice"},
		{stdhttp.MethodPost, "/api/calls/room-1/sfu-token", "token"},
		{stdhttp.MethodPost, "/api/calls/room-1/transcription/start", "start"},
		{stdhttp.MethodPost, "/api/calls/room-1/transcription/stop", "stop"},
		{stdhttp.MethodGet, "/api/calls/room-1/transcription/status", "status"},
		{stdhttp.MethodGet, "/api/calls/room-1/transcript", "transcript"},
		{stdhttp.MethodPost, "/api/calls/room-1/captions/transcribe", "captions-transcribe"},
		{stdhttp.MethodPost, "/api/calls/room-1/transcription/uploads", "request-upload"},
		{stdhttp.MethodPut, "/api/calls/room-1/transcription/uploads/chunk-1/data", "upload-data"},
		{stdhttp.MethodPost, "/api/calls/room-1/transcription/uploads/chunk-1/complete", "complete-upload"},
		{stdhttp.MethodPatch, "/api/calls/room-1/transcript/segments/segment-1", "segment"},
		{stdhttp.MethodGet, "/api/calls/room-1/transcript/artifacts/notes", "artifact"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent || recorder.Header().Get("X-Call-Route") != request.want {
				t.Fatalf("status=%d route=%q, want status=%d route=%q", recorder.Code, recorder.Header().Get("X-Call-Route"), stdhttp.StatusNoContent, request.want)
			}
		})
	}
}

func TestRegisterCallRoutesRejectsWrongMethod(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {})
	RegisterCallRoutes(router, CallRoutes{
		GetICEServers: handler, CreateSFUToken: handler, StartTranscription: handler, StopTranscription: handler,
		GetTranscriptionStatus: handler, GetTranscript: handler, RequestTranscriptionUpload: handler,
		TranscribeCaptions:   handler,
		UploadAudioChunkData: handler, CompleteTranscriptionUpload: handler, UpdateTranscriptSegment: handler,
		GetTranscriptArtifact: handler,
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodDelete, "/api/calls/room-1/transcript", nil))
	if recorder.Code != stdhttp.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusMethodNotAllowed)
	}
}
