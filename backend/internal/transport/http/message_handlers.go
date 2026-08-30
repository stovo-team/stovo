package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// MessageHandlerOperations is the transport boundary for message detail and
// mutation endpoints. Values intentionally remain opaque to this adapter: the
// feature/application layer supplies the stable JSON shape while this package
// owns request decoding, URL parsing, and HTTP status mapping.
type MessageHandlerOperations struct {
	Get        func(context.Context, string) (any, error)
	Attach     func(context.Context, string, []string) (any, error)
	Forward    func(context.Context, string, string) (any, error)
	Archive    func(context.Context, string) (value any, status int, err error)
	GetArchive func(context.Context) (any, error)
	React      func(context.Context, string, string, bool) (any, error)
	Edit       func(context.Context, string, string) (any, error)
	Delete     func(context.Context, string, string) (any, error)
	StatusFor  func(error) int
	DetailFor  func(error) string
}

// Edit owns the public PATCH payload contract; mutation policy is supplied by
// the feature-facing callback.
func (h MessageHandler) Edit(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	content := strings.TrimSpace(payload.Content)
	if content == "" {
		writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "content is required")
		return
	}
	if len(content) > 4000 {
		writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "content exceeds maximum length of 4000 characters")
		return
	}
	value, err := h.operations.Edit(r.Context(), chi.URLParam(r, "messageId"), content)
	if err != nil {
		writeMessageDetail(w, h.status(err), h.detail(err))
		return
	}
	writeMessageValue(w, stdhttp.StatusOK, value)
}

// Delete owns query parsing and response serialization for the delete
// endpoint while preserving the historical "scope=me" contract.
func (h MessageHandler) Delete(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.Delete(r.Context(), chi.URLParam(r, "messageId"), r.URL.Query().Get("scope"))
	if err != nil {
		writeMessageDetail(w, h.status(err), h.detail(err))
		return
	}
	writeMessageValue(w, stdhttp.StatusOK, value)
}

type MessageHandler struct{ operations MessageHandlerOperations }

func NewMessageHandler(operations MessageHandlerOperations) MessageHandler {
	return MessageHandler{operations: operations}
}

func (h MessageHandler) Get(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.Get(r.Context(), chi.URLParam(r, "messageId"))
	if err != nil {
		writeMessageDetail(w, stdhttp.StatusNotFound, "Message not found")
		return
	}
	writeMessageValue(w, stdhttp.StatusOK, value)
}

func (h MessageHandler) Attach(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload struct {
		FileIDs []string `json:"fileIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.FileIDs) == 0 {
		writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "fileIds are required")
		return
	}
	value, err := h.operations.Attach(r.Context(), chi.URLParam(r, "messageId"), payload.FileIDs)
	if err != nil {
		writeMessageDetail(w, h.status(err), h.detail(err))
		return
	}
	writeMessageValue(w, stdhttp.StatusOK, value)
}

func (h MessageHandler) Forward(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload struct {
		ChatID string `json:"chatId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.ChatID = strings.TrimSpace(payload.ChatID)
	if payload.ChatID == "" {
		writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "chatId is required")
		return
	}
	value, err := h.operations.Forward(r.Context(), chi.URLParam(r, "messageId"), payload.ChatID)
	if err != nil {
		writeMessageDetail(w, h.status(err), h.detail(err))
		return
	}
	writeMessageValue(w, stdhttp.StatusCreated, value)
}

func (h MessageHandler) Archive(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, status, err := h.operations.Archive(r.Context(), chi.URLParam(r, "messageId"))
	if err != nil {
		writeMessageDetail(w, h.status(err), h.detail(err))
		return
	}
	writeMessageValue(w, status, value)
}

func (h MessageHandler) GetArchive(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.GetArchive(r.Context())
	if err != nil {
		writeMessageDetail(w, stdhttp.StatusInternalServerError, "Could not load Message Archive")
		return
	}
	writeMessageValue(w, stdhttp.StatusOK, value)
}

func (h MessageHandler) Reaction(w stdhttp.ResponseWriter, r *stdhttp.Request, add bool) {
	emoji := chi.URLParam(r, "emoji")
	if add {
		var payload struct {
			Emoji string `json:"emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeMessageDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
			return
		}
		emoji = payload.Emoji
	}
	value, err := h.operations.React(r.Context(), chi.URLParam(r, "messageId"), emoji, add)
	if err != nil {
		writeMessageDetail(w, h.status(err), h.detail(err))
		return
	}
	writeMessageValue(w, stdhttp.StatusOK, value)
}

func (h MessageHandler) status(err error) int {
	if h.operations.StatusFor != nil {
		return h.operations.StatusFor(err)
	}
	return stdhttp.StatusInternalServerError
}
func (h MessageHandler) detail(err error) string {
	if h.operations.DetailFor != nil {
		return h.operations.DetailFor(err)
	}
	return err.Error()
}
func writeMessageValue(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeMessageDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeMessageValue(w, status, map[string]string{"detail": detail})
}
