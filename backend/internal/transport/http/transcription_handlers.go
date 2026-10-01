package http

import (
	"context"
	"encoding/json"
	"io"
	stdhttp "net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// TranscriptionActor is the authentication data the AI Notes HTTP endpoints
// need. It keeps the transport independent from the legacy app user model.
type TranscriptionActor struct {
	ID          string
	FamilyID    string
	Role        string
	DisplayName string
}

// TranscriptionCall is the transport-neutral view needed for call-scoped
// authorization. Runtime owns the concrete live-call representation.
type TranscriptionCall struct {
	ID       string
	ChatID   string
	CallerID string
}

// TranscriptionOperations is the narrow seam between the HTTP adapter and the
// call/transcription runtime. JSON parsing, URL extraction and response
// serialization intentionally stay here.
type TranscriptionOperations struct {
	CallByRoom       func(string) (TranscriptionCall, bool)
	IsParticipant    func(TranscriptionCall, string) bool
	CanAccessChat    func(string, string) bool
	IsAdministrator  func(string) bool
	Latest           func(context.Context, string) (any, error)
	Transcript       func(context.Context, string) (any, error)
	UpdateSegment    func(context.Context, string, string) error
	ArtifactDownload func(context.Context, string, string) (string, int, error)

	Start          func(ctx context.Context, roomID string, actor TranscriptionActor) (any, int, string)
	Stop           func(ctx context.Context, roomID, sessionID string, actor TranscriptionActor) (any, int, string)
	RequestUpload  func(ctx context.Context, roomID string, req UploadAudioChunkRequest, actor TranscriptionActor) (any, int, string)
	UploadData     func(ctx context.Context, chunkID string, data []byte, actor TranscriptionActor) (any, int, string)
	CompleteUpload func(ctx context.Context, chunkID string, req CompleteAudioUploadRequest, actor TranscriptionActor) (any, int, string)
}

type TranscriptionHandler struct{ operations TranscriptionOperations }

func NewTranscriptionHandler(operations TranscriptionOperations) TranscriptionHandler {
	return TranscriptionHandler{operations: operations}
}

func (h TranscriptionHandler) Start(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "roomId required")
		return
	}
	if h.operations.Start == nil {
		writeTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Start transcription is unavailable")
		return
	}
	res, status, detail := h.operations.Start(r.Context(), roomID, actor)
	if detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		writeTranscriptionDetail(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusCreated
	}
	writeTranscriptionJSON(w, status, res)
}

func (h TranscriptionHandler) Stop(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "roomId required")
		return
	}
	var body struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(body.SessionID) == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "sessionId is required")
		return
	}
	if h.operations.Stop == nil {
		writeTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Stop transcription is unavailable")
		return
	}
	res, status, detail := h.operations.Stop(r.Context(), roomID, strings.TrimSpace(body.SessionID), actor)
	if detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		writeTranscriptionDetail(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeTranscriptionJSON(w, status, res)
}

func (h TranscriptionHandler) RequestUpload(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "roomId required")
		return
	}
	var req UploadAudioChunkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.SessionID) == "" || strings.TrimSpace(req.ParticipantID) == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "sessionId and participantId are required")
		return
	}
	if req.ParticipantID != actor.ID {
		writeTranscriptionDetail(w, stdhttp.StatusForbidden, "Participant ID does not match authenticated user")
		return
	}
	if h.operations.RequestUpload == nil {
		writeTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Upload registration is unavailable")
		return
	}
	res, status, detail := h.operations.RequestUpload(r.Context(), roomID, req, actor)
	if detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		writeTranscriptionDetail(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeTranscriptionJSON(w, status, res)
}

func (h TranscriptionHandler) UploadData(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	chunkID := strings.TrimSpace(chi.URLParam(r, "chunkId"))
	if chunkID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "chunkId required")
		return
	}
	data, err := io.ReadAll(stdhttp.MaxBytesReader(w, r.Body, 32<<20))
	if err != nil || len(data) == 0 {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "Audio upload was empty or too large")
		return
	}
	if h.operations.UploadData == nil {
		writeTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Upload is unavailable")
		return
	}
	res, status, detail := h.operations.UploadData(r.Context(), chunkID, data, actor)
	if detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		writeTranscriptionDetail(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeTranscriptionJSON(w, status, res)
}

func (h TranscriptionHandler) CompleteUpload(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	chunkID := strings.TrimSpace(chi.URLParam(r, "chunkId"))
	if chunkID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "chunkId required")
		return
	}
	var req CompleteAudioUploadRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if h.operations.CompleteUpload == nil {
		writeTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Complete upload is unavailable")
		return
	}
	res, status, detail := h.operations.CompleteUpload(r.Context(), chunkID, req, actor)
	if detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		writeTranscriptionDetail(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeTranscriptionJSON(w, status, res)
}

func (h TranscriptionHandler) Status(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	call, ok := h.authorizedCall(w, r, actor)
	if !ok {
		return
	}
	value, err := h.operations.Latest(r.Context(), call.ID)
	if err != nil {
		writeTranscriptionJSON(w, stdhttp.StatusOK, map[string]any{"status": "none"})
		return
	}
	writeTranscriptionJSON(w, stdhttp.StatusOK, value)
}

// Transcript preserves the historical contract: transcript availability is
// determined by the feature query, rather than a live-call membership check.
func (h TranscriptionHandler) Transcript(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "roomId required")
		return
	}
	call, exists := h.operations.CallByRoom(roomID)
	if !exists || h.operations.CanAccessChat == nil || !h.operations.CanAccessChat(call.ChatID, actor.ID) {
		writeTranscriptionDetail(w, stdhttp.StatusForbidden, "You do not have access to this chat transcript")
		return
	}
	value, err := h.operations.Transcript(r.Context(), roomID)
	if err != nil {
		writeTranscriptionDetail(w, stdhttp.StatusNotFound, "Transcript not found")
		return
	}
	writeTranscriptionJSON(w, stdhttp.StatusOK, value)
}

func (h TranscriptionHandler) UpdateSegment(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	segmentID := strings.TrimSpace(chi.URLParam(r, "segmentId"))
	if segmentID == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "segmentId required")
		return
	}
	if h.operations.IsAdministrator == nil || !h.operations.IsAdministrator(actor.Role) {
		writeTranscriptionDetail(w, stdhttp.StatusForbidden, "Only administrators can edit transcript segments")
		return
	}
	var body struct {
		CleanedText string `json:"cleanedText"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.operations.UpdateSegment(r.Context(), segmentID, body.CleanedText); err != nil {
		writeTranscriptionDetail(w, stdhttp.StatusInternalServerError, "Failed to update segment")
		return
	}
	writeTranscriptionJSON(w, stdhttp.StatusOK, map[string]any{"segmentId": segmentID, "updated": true})
}

func (h TranscriptionHandler) Artifact(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	artifactType := strings.TrimSpace(chi.URLParam(r, "artifactType"))
	if roomID == "" || artifactType == "" {
		writeTranscriptionDetail(w, stdhttp.StatusBadRequest, "roomId and artifactType required")
		return
	}
	call, exists := h.operations.CallByRoom(roomID)
	if !exists || h.operations.CanAccessChat == nil || !h.operations.CanAccessChat(call.ChatID, actor.ID) {
		writeTranscriptionDetail(w, stdhttp.StatusForbidden, "You do not have access to this chat transcript")
		return
	}
	url, status, err := h.operations.ArtifactDownload(r.Context(), roomID, artifactType)
	if err != nil {
		if status == 0 {
			status = stdhttp.StatusNotFound
		}
		detail := "Artifact not found"
		if status != stdhttp.StatusNotFound {
			detail = "Failed to generate download URL"
		}
		writeTranscriptionDetail(w, status, detail)
		return
	}
	writeTranscriptionJSON(w, stdhttp.StatusOK, map[string]any{"downloadUrl": url})
}

func (h TranscriptionHandler) authorizedCall(w stdhttp.ResponseWriter, r *stdhttp.Request, actor TranscriptionActor) (TranscriptionCall, bool) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	call, exists := h.operations.CallByRoom(roomID)
	if !exists {
		writeTranscriptionDetail(w, stdhttp.StatusNotFound, "Call not found")
		return TranscriptionCall{}, false
	}
	if h.operations.IsParticipant == nil || !h.operations.IsParticipant(call, actor.ID) {
		writeTranscriptionDetail(w, stdhttp.StatusForbidden, "You are not a participant in this call")
		return TranscriptionCall{}, false
	}
	return call, true
}

func writeTranscriptionDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeTranscriptionJSON(w, status, map[string]string{"detail": detail})
}

func writeTranscriptionJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
