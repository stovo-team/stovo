package http

import (
	"context"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// InvitePreviewHandler owns extraction of the public invite token and its
// HTTP result. Lookup remains a family use-case supplied by composition.
type InvitePreviewHandler struct {
	Find func(context.Context, string) (any, error)
}

func (h InvitePreviewHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h.Find == nil {
		writeFamilyReadJSON(w, stdhttp.StatusInternalServerError, map[string]string{"detail": "Invite lookup unavailable"})
		return
	}
	preview, err := h.Find(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusNotFound, map[string]string{"detail": "Invite not found"})
		return
	}
	writeFamilyReadJSON(w, stdhttp.StatusOK, preview)
}
