package http

import (
	"context"
	"encoding/json"
	"net/http"

	"stovo-messenger/backend/internal/transport/http/presenter"

	"github.com/go-chi/chi/v5"
)

// ChatReadOperations is the narrow application-facing seam used by the chat
// read HTTP adapter.  It deliberately deals only in transport DTOs: the
// compatibility layer can supply its existing use-case orchestration without
// leaking app, Ent, or feature implementation types into this package.
type ChatReadOperations struct {
	List      func(context.Context) ([]presenter.Chat, error)
	Get       func(context.Context, string) (presenter.Chat, error)
	IsMissing func(error) bool
	LogError  func(operation string, err error)
}

// ChatReadHandler maps the stable list/detail REST contract to supplied
// application operations. Authentication has already happened when these
// handlers are constructed by the compatibility adapter.
type ChatReadHandler struct {
	operations ChatReadOperations
}

func NewChatReadHandler(operations ChatReadOperations) ChatReadHandler {
	return ChatReadHandler{operations: operations}
}

func (h ChatReadHandler) ListChats(w http.ResponseWriter, r *http.Request) {
	chats, err := h.operations.List(r.Context())
	if err != nil {
		h.log("list chats", err)
		writeChatReadError(w, http.StatusInternalServerError, "Could not load chats")
		return
	}
	presenter.WriteChats(w, http.StatusOK, chats)
}

func (h ChatReadHandler) GetChat(w http.ResponseWriter, r *http.Request) {
	chat, err := h.operations.Get(r.Context(), chi.URLParam(r, "chatId"))
	if err != nil {
		if h.operations.IsMissing != nil && h.operations.IsMissing(err) {
			writeChatReadError(w, http.StatusNotFound, "Chat not found")
			return
		}
		h.log("get chat", err)
		writeChatReadError(w, http.StatusInternalServerError, "Could not load chat")
		return
	}
	presenter.WriteChat(w, http.StatusOK, chat)
}

func (h ChatReadHandler) log(operation string, err error) {
	if h.operations.LogError != nil {
		h.operations.LogError(operation, err)
	}
}

func writeChatReadError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": message})
}
