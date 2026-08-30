package http

import (
	"context"
	stdhttp "net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
)

// FileDelivery is a persistence-neutral HTTP response model for binary file
// delivery. Object-store reads happen behind the supplied operation.
type FileDelivery struct {
	Data         []byte
	ContentType  string
	OriginalName string
}

type FileDeliveryOperations struct {
	Download  func(context.Context, string) (FileDelivery, error)
	Thumbnail func(context.Context, string) (FileDelivery, error)
	StatusFor func(error) int
	DetailFor func(error) string
}

type FileDeliveryHandler struct{ operations FileDeliveryOperations }

func NewFileDeliveryHandler(operations FileDeliveryOperations) FileDeliveryHandler {
	return FileDeliveryHandler{operations: operations}
}

func (h FileDeliveryHandler) Download(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	delivery, err := h.operations.Download(r.Context(), chi.URLParam(r, "fileId"))
	if err != nil {
		h.error(w, err)
		return
	}
	w.Header().Set("Content-Type", delivery.ContentType)
	w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(delivery.OriginalName))
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = w.Write(delivery.Data)
}

func (h FileDeliveryHandler) Thumbnail(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	delivery, err := h.operations.Thumbnail(r.Context(), chi.URLParam(r, "fileId"))
	if err != nil {
		h.error(w, err)
		return
	}
	w.Header().Set("Content-Type", delivery.ContentType)
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = w.Write(delivery.Data)
}

func (h FileDeliveryHandler) error(w stdhttp.ResponseWriter, err error) {
	status := stdhttp.StatusInternalServerError
	if h.operations.StatusFor != nil {
		status = h.operations.StatusFor(err)
	}
	detail := err.Error()
	if h.operations.DetailFor != nil {
		detail = h.operations.DetailFor(err)
	}
	writeFileAccess(w, status, map[string]string{"detail": detail})
}
