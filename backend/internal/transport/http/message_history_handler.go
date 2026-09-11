package http

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// MessageHistoryOperations is the transport seam for the message history
// endpoint. The endpoint's query contract belongs here; paging/caching policy
// remains behind the supplied application operation.
type MessageHistoryOperations struct {
	List      func(context.Context, string, string, int, string, string) (any, error)
	StatusFor func(error) int
}

type MessageHistoryHandler struct{ operations MessageHistoryOperations }

func NewMessageHistoryHandler(operations MessageHistoryOperations) MessageHistoryHandler {
	return MessageHistoryHandler{operations}
}

func (h MessageHistoryHandler) Get(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			writeMessageDetail(w, http.StatusBadRequest, "Invalid history request")
			return
		}
		limit = value
	}
	value, err := h.operations.List(r.Context(), chi.URLParam(r, "chatId"), strings.TrimSpace(r.URL.Query().Get("before")), limit, strings.TrimSpace(r.URL.Query().Get("threadRootMessageId")), strings.TrimSpace(r.URL.Query().Get("archiveGroup")))
	if err != nil {
		status := http.StatusInternalServerError
		if h.operations.StatusFor != nil {
			status = h.operations.StatusFor(err)
		}
		writeMessageDetail(w, status, "Could not load messages")
		return
	}
	writeMessageValue(w, http.StatusOK, value)
}
