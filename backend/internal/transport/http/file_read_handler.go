package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// DirectUploadReadOperations is the application-facing seam for polling a
// direct upload. The callback deliberately returns a transport response so
// object-store URL creation stays outside this inbound adapter.
type DirectUploadReadOperations struct {
	// unavailable distinguishes presigning/configuration failures from a
	// persistence failure without leaking storage implementation details.
	Load func(context.Context, string) (response DirectFileUploadResponse, found bool, unavailable bool, err error)
}

// DirectUploadReadHandler owns URL extraction and the stable HTTP response
// contract for direct-upload status polling.
type DirectUploadReadHandler struct {
	operations DirectUploadReadOperations
}

func NewDirectUploadReadHandler(operations DirectUploadReadOperations) DirectUploadReadHandler {
	return DirectUploadReadHandler{operations: operations}
}

func (h DirectUploadReadHandler) GetDirectUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := strings.TrimSpace(chi.URLParam(r, "uploadId"))
	if uploadID == "" {
		writeDirectUploadError(w, http.StatusNotFound, "Upload not found")
		return
	}
	response, found, unavailable, err := h.operations.Load(r.Context(), uploadID)
	if !found && err == nil {
		writeDirectUploadError(w, http.StatusNotFound, "Upload not found")
		return
	}
	if err != nil {
		if unavailable {
			writeDirectUploadError(w, http.StatusServiceUnavailable, "Direct uploads are not available")
			return
		}
		writeDirectUploadError(w, http.StatusInternalServerError, "Could not load upload")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func writeDirectUploadError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": message})
}

// FileDetailOperations provides the single-file lookup application seam.
type FileDetailOperations struct {
	Get       func(context.Context, string) (any, error)
	StatusFor func(error) int
	DetailFor func(error) string
}

// FileDetailHandler owns URL parameter extraction and single-file GET responses.
type FileDetailHandler struct {
	operations FileDetailOperations
}

func NewFileDetailHandler(operations FileDetailOperations) FileDetailHandler {
	return FileDetailHandler{operations: operations}
}

func (h FileDetailHandler) GetFile(w http.ResponseWriter, r *http.Request) {
	fileID := strings.TrimSpace(chi.URLParam(r, "fileId"))
	if fileID == "" {
		writeDirectUploadError(w, http.StatusNotFound, "File not found")
		return
	}
	file, err := h.operations.Get(r.Context(), fileID)
	if err != nil {
		status := http.StatusNotFound
		if h.operations.StatusFor != nil {
			status = h.operations.StatusFor(err)
		}
		detail := "File not found"
		if h.operations.DetailFor != nil {
			detail = h.operations.DetailFor(err)
		}
		writeDirectUploadError(w, status, detail)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(file)
}

