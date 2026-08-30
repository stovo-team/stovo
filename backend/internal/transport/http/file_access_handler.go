package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// FileAccessOperations is the narrow transport seam for direct-download
// capability issuance. Presigning and visibility policy remain outside the
// HTTP adapter.
type FileAccessOperations struct {
	Create    func(context.Context, string) (any, error)
	StatusFor func(error) int
	DetailFor func(error) string
}

type FileAccessHandler struct{ operations FileAccessOperations }

func NewFileAccessHandler(operations FileAccessOperations) FileAccessHandler {
	return FileAccessHandler{operations: operations}
}

func (h FileAccessHandler) Create(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.Create(r.Context(), chi.URLParam(r, "fileId"))
	if err != nil {
		status := stdhttp.StatusInternalServerError
		if h.operations.StatusFor != nil {
			status = h.operations.StatusFor(err)
		}
		detail := err.Error()
		if h.operations.DetailFor != nil {
			detail = h.operations.DetailFor(err)
		}
		writeFileAccess(w, status, map[string]string{"detail": detail})
		return
	}
	writeFileAccess(w, stdhttp.StatusOK, value)
}

func writeFileAccess(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
