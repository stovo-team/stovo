package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// PinOperations is the transport-to-use-case seam for message pin management.
type PinOperations struct {
	Pin       func(context.Context, string, string) (any, int, error)
	Unpin     func(context.Context, string, string) (any, error)
	List      func(context.Context, string) (any, error)
	StatusFor func(error) int
	DetailFor func(error) string
}

// PinHandler is the HTTP boundary for pin endpoints. It owns parameter
// extraction and wire serialization; application callbacks retain only
// authorization and feature invocation.
type PinHandler struct {
	operations PinOperations
}

func NewPinHandler(operations PinOperations) PinHandler {
	return PinHandler{operations: operations}
}

func (h PinHandler) PinMessage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, status, err := h.operations.Pin(r.Context(), chi.URLParam(r, "chatId"), chi.URLParam(r, "messageId"))
	if err != nil {
		writePinDetail(w, h.status(err), h.detail(err))
		return
	}
	writePinJSON(w, status, value)
}
func (h PinHandler) UnpinMessage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.Unpin(r.Context(), chi.URLParam(r, "chatId"), chi.URLParam(r, "messageId"))
	if err != nil {
		writePinDetail(w, h.status(err), h.detail(err))
		return
	}
	writePinJSON(w, stdhttp.StatusOK, value)
}
func (h PinHandler) GetPins(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.List(r.Context(), chi.URLParam(r, "chatId"))
	if err != nil {
		writePinDetail(w, h.status(err), h.detail(err))
		return
	}
	writePinJSON(w, stdhttp.StatusOK, value)
}
func (h PinHandler) status(err error) int {
	if h.operations.StatusFor != nil {
		return h.operations.StatusFor(err)
	}
	return stdhttp.StatusInternalServerError
}
func (h PinHandler) detail(err error) string {
	if h.operations.DetailFor != nil {
		return h.operations.DetailFor(err)
	}
	return err.Error()
}
func writePinJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writePinDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writePinJSON(w, status, map[string]string{"detail": detail})
}
