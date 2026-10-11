package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/features/chattransfer"
)

const maxChatImportRequestBytes = 250 * 1024 * 1024

type ChatTransferOperations struct {
	ExportSource func(context.Context, string) (any, error)
	Import       func(context.Context, string, chattransfer.Archive, map[string]chattransfer.StoredMessageContent) (any, int, error)
	StatusFor    func(error) int
	DetailFor    func(error) string
}

type ChatTransferHandler struct{ operations ChatTransferOperations }

func NewChatTransferHandler(operations ChatTransferOperations) ChatTransferHandler {
	return ChatTransferHandler{operations: operations}
}

func (h ChatTransferHandler) GetSource(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	value, err := h.operations.ExportSource(r.Context(), chi.URLParam(r, "chatId"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeChatMutationValue(w, http.StatusOK, value)
}

func (h ChatTransferHandler) Import(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" {
		writeChatMutationError(w, http.StatusBadRequest, "Idempotency-Key is required")
		return
	}
	if r.ContentLength > maxChatImportRequestBytes {
		writeChatMutationError(w, http.StatusRequestEntityTooLarge, "Import archive exceeds the request size limit")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxChatImportRequestBytes)
	var payload struct {
		Archive         chattransfer.Archive                         `json:"archive"`
		PreparedContent map[string]chattransfer.StoredMessageContent `json:"preparedContent,omitempty"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeChatMutationError(w, http.StatusRequestEntityTooLarge, "Import archive exceeds the request size limit")
		} else {
			writeChatMutationError(w, http.StatusBadRequest, "Invalid import archive")
		}
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeChatMutationError(w, http.StatusBadRequest, "Invalid import archive")
		return
	}
	value, status, err := h.operations.Import(r.Context(), idempotencyKey, payload.Archive, payload.PreparedContent)
	if err != nil {
		h.writeError(w, err)
		return
	}
	if status == 0 {
		status = http.StatusCreated
	}
	writeChatMutationValue(w, status, value)
}

func (h ChatTransferHandler) writeError(w http.ResponseWriter, err error) {
	status, detail := http.StatusInternalServerError, "Could not transfer chat"
	if h.operations.StatusFor != nil {
		status = h.operations.StatusFor(err)
	}
	if h.operations.DetailFor != nil {
		detail = h.operations.DetailFor(err)
	}
	writeChatMutationError(w, status, detail)
}
