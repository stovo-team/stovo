package http

import (
	"context"
	"encoding/json"
	"errors"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// MessageReadOperations is the narrow application seam for the message-read
// endpoint. It deliberately uses only IDs and a JSON-ready result so the HTTP
// adapter owns request extraction and response serialization.
type MessageReadOperations struct {
	Mark      func(context.Context, string, string) (message any, chatID string, err error)
	IsMissing func(error) bool
	Error     func(error) (status int, detail string)
	Published func(context.Context, string, string, string)
}

// MessageReadHandler preserves PATCH /api/messages/{messageId}/read while
// keeping its HTTP-specific success and error behavior out of the app facade.
type MessageReadHandler struct{ operations MessageReadOperations }

func NewMessageReadHandler(operations MessageReadOperations) MessageReadHandler {
	return MessageReadHandler{operations: operations}
}

// MarkRead is called after the outer authentication adapter has resolved the
// actor. Keeping that concern outside avoids coupling this transport package to
// the legacy app user type.
func (h MessageReadHandler) MarkRead(w stdhttp.ResponseWriter, r *stdhttp.Request, userID string) {
	messageID := chi.URLParam(r, "messageId")
	message, chatID, err := h.operations.Mark(r.Context(), userID, messageID)
	if err != nil {
		if h.operations.IsMissing != nil && h.operations.IsMissing(err) {
			writeMessageReadJSON(w, stdhttp.StatusOK, map[string]any{"status": "ok"})
			return
		}
		status, detail := stdhttp.StatusInternalServerError, "Internal server error"
		if h.operations.Error != nil {
			status, detail = h.operations.Error(err)
		}
		writeMessageReadJSON(w, status, map[string]string{"detail": detail})
		return
	}
	if h.operations.Published != nil {
		h.operations.Published(r.Context(), chatID, messageID, userID)
	}
	writeMessageReadJSON(w, stdhttp.StatusOK, message)
}

func writeMessageReadJSON(w stdhttp.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// IsMessageReadMissing makes a nil-safe missing predicate convenient for
// callers that use a sentinel error.
func IsMessageReadMissing(err error, target error) bool { return errors.Is(err, target) }
