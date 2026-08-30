package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// FileMutationHandler owns the small JSON contracts for file preferences and
// deletion. Authorization, storage deletion and persistence remain behind the
// application callbacks.
type FileMutationHandler struct {
	SetFavorite func(context.Context, string, bool) (any, error)
	Delete      func(context.Context, string) error
	StatusFor   func(error) int
	DetailFor   func(error) string
}

func (h FileMutationHandler) UpdatePreferences(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload struct {
		IsFavorite *bool `json:"isFavorite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeFileMutationDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if payload.IsFavorite == nil {
		writeFileMutationDetail(w, stdhttp.StatusUnprocessableEntity, "isFavorite is required")
		return
	}
	value, err := h.SetFavorite(r.Context(), chi.URLParam(r, "fileId"), *payload.IsFavorite)
	if err != nil {
		writeFileMutationDetail(w, h.status(err), h.detail(err))
		return
	}
	writeFileMutationJSON(w, stdhttp.StatusOK, value)
}
func (h FileMutationHandler) DeleteFile(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if err := h.Delete(r.Context(), chi.URLParam(r, "fileId")); err != nil {
		writeFileMutationDetail(w, h.status(err), h.detail(err))
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}
func (h FileMutationHandler) status(err error) int {
	if h.StatusFor != nil {
		return h.StatusFor(err)
	}
	return stdhttp.StatusInternalServerError
}
func (h FileMutationHandler) detail(err error) string {
	if h.DetailFor != nil {
		return h.DetailFor(err)
	}
	return err.Error()
}
func writeFileMutationJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeFileMutationDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeFileMutationJSON(w, status, map[string]string{"detail": detail})
}
