package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// SFUTokenActor contains the caller claims needed for SFU token generation.
type SFUTokenActor struct {
	ID          string
	DisplayName string
}

// SFUTokenOperations contains the business operations required for SFU tokens.
type SFUTokenOperations struct {
	IsSFUConfigured func() bool
	CreateToken     func(ctx context.Context, roomID string, actor SFUTokenActor) (any, int, string)
}

// SFUTokenHandler owns URL parameter extraction, configuration checks, and JSON
// serialization for SFU token requests.
type SFUTokenHandler struct {
	operations SFUTokenOperations
}

func NewSFUTokenHandler(operations SFUTokenOperations) SFUTokenHandler {
	return SFUTokenHandler{operations: operations}
}

func (h SFUTokenHandler) CreateToken(w stdhttp.ResponseWriter, r *stdhttp.Request, actor SFUTokenActor) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		writeSFUDetail(w, stdhttp.StatusBadRequest, "roomId required")
		return
	}
	if h.operations.IsSFUConfigured != nil && !h.operations.IsSFUConfigured() {
		writeSFUDetail(w, stdhttp.StatusServiceUnavailable, "SFU is not configured")
		return
	}
	if h.operations.CreateToken == nil {
		writeSFUDetail(w, stdhttp.StatusInternalServerError, "Could not mint SFU token")
		return
	}
	res, status, detail := h.operations.CreateToken(r.Context(), roomID, actor)
	if detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		writeSFUDetail(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeSFUJSON(w, status, res)
}

func writeSFUJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeSFUDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeSFUJSON(w, status, map[string]string{"detail": detail})
}
