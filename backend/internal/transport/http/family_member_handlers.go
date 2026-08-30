package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// FamilyMemberHandler owns the HTTP mapping for membership mutations.  The
// callbacks are deliberately narrow: composition supplies use cases and this
// inbound adapter owns decoding, status codes, and response serialization.
type FamilyMemberHandler struct {
	List   func(context.Context) (any, error)
	Change func(context.Context, string, string) (any, int, string, error)
	Remove func(context.Context, string) (int, string, error)
}

func (h FamilyMemberHandler) ListMembers(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	members, err := h.List(r.Context())
	if err != nil {
		writeFamilyMemberDetail(w, stdhttp.StatusInternalServerError, "Could not load members")
		return
	}
	writeFamilyMemberJSON(w, stdhttp.StatusOK, members)
}

func (h FamilyMemberHandler) ChangeRole(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeFamilyMemberDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	value, status, detail, err := h.Change(r.Context(), chi.URLParam(r, "userId"), payload.Role)
	if err != nil {
		writeFamilyMemberDetail(w, status, detail)
		return
	}
	writeFamilyMemberJSON(w, stdhttp.StatusOK, value)
}

func (h FamilyMemberHandler) RemoveMember(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	status, detail, err := h.Remove(r.Context(), chi.URLParam(r, "userId"))
	if err != nil {
		writeFamilyMemberDetail(w, status, detail)
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}

func writeFamilyMemberJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeFamilyMemberDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeFamilyMemberJSON(w, status, map[string]string{"detail": detail})
}
