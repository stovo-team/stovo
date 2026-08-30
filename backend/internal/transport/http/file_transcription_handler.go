package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// FileTranscriptionHandler owns the HTTP shape of file transcription. The
// application callbacks receive only a file identifier and return a neutral
// response, keeping storage/provider concerns outside this transport.
type FileTranscriptionHandler struct {
	Transcribe func(context.Context, string) (any, int, string)
	Get        func(context.Context, string) (any, int, string)
}

func (h FileTranscriptionHandler) TranscribeFile(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.respond(w, r, h.Transcribe)
}

func (h FileTranscriptionHandler) GetTranscript(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.respond(w, r, h.Get)
}

func (h FileTranscriptionHandler) respond(w stdhttp.ResponseWriter, r *stdhttp.Request, operation func(context.Context, string) (any, int, string)) {
	if operation == nil { writeFileTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Transcription is unavailable"); return }
	fileID := chi.URLParam(r, "fileId")
	value, status, detail := operation(r.Context(), fileID)
	if detail != "" { writeFileTranscriptionDetail(w, status, detail); return }
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeFileTranscriptionDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}
