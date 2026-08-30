package http

import (
	"context"
	"encoding/json"
	"errors"
	stdhttp "net/http"
	"time"
)

type SyncEventResponse struct {
	Sequence      int64           `json:"sequence"`
	EventID       string          `json:"eventId"`
	Type          string          `json:"type"`
	Version       int             `json:"version"`
	AggregateType string          `json:"aggregateType"`
	AggregateID   string          `json:"aggregateId"`
	Payload       json.RawMessage `json:"payload"`
	OccurredAt    time.Time       `json:"occurredAt"`
}

type SyncResponse struct {
	Events     []SyncEventResponse `json:"events"`
	NextCursor *string             `json:"nextCursor"`
	HasMore    bool                `json:"hasMore"`
}

// SyncOperations defines application callbacks used by the device sync HTTP edge.
type SyncOperations struct {
	Page          func(context.Context, string, string) (any, error)
	InvalidCursor error
	InvalidLimit  error
	LogFailure    func(error)
}

// SyncHandler owns the HTTP query and response contract for device sync. The
// application supplies a persistence-neutral page operation for the current
// authenticated actor.
type SyncHandler struct {
	operations SyncOperations
}

func NewSyncHandler(operations SyncOperations) SyncHandler {
	return SyncHandler{operations: operations}
}

func (h SyncHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h.operations.Page == nil {
		writeSyncDetail(w, stdhttp.StatusInternalServerError, "Could not synchronize")
		return
	}
	page, err := h.operations.Page(r.Context(), r.URL.Query().Get("cursor"), r.URL.Query().Get("limit"))
	if errors.Is(err, h.operations.InvalidCursor) {
		writeSyncDetail(w, stdhttp.StatusBadRequest, "Invalid sync cursor")
		return
	}
	if errors.Is(err, h.operations.InvalidLimit) {
		writeSyncDetail(w, stdhttp.StatusBadRequest, "Invalid sync limit")
		return
	}
	if err != nil {
		if h.operations.LogFailure != nil {
			h.operations.LogFailure(err)
		}
		writeSyncDetail(w, stdhttp.StatusInternalServerError, "Could not synchronize")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_ = json.NewEncoder(w).Encode(page)
}

func writeSyncDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}
