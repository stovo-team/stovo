package http

import (
	"context"
	"io"
	stdhttp "net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const MediaPlaybackTokenHeader = "X-Stovo-Media-Token"

type MediaPlaybackToken struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}
type MediaStream struct {
	Reader                    io.ReadSeekCloser
	ContentType, OriginalName string
	Attachment                bool
	ModifiedAt                time.Time
}
type MediaOperations struct {
	Mint      func(context.Context, string) (MediaPlaybackToken, error)
	Open      func(context.Context, string, string) (MediaStream, error)
	StatusFor func(error) int
	DetailFor func(error) string
}
type MediaHandler struct{ operations MediaOperations }

func NewMediaHandler(operations MediaOperations) MediaHandler { return MediaHandler{operations} }
func (h MediaHandler) Mint(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	value, err := h.operations.Mint(r.Context(), chi.URLParam(r, "fileId"))
	if err != nil {
		h.error(w, err)
		return
	}
	writeFileAccess(w, stdhttp.StatusOK, value)
}
func (h MediaHandler) Stream(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	token := mediaToken(r)
	if token == "" || len(token) > 4096 {
		h.error(w, errMediaNotFound{})
		return
	}
	stream, err := h.operations.Open(r.Context(), chi.URLParam(r, "fileId"), token)
	if err != nil {
		h.error(w, err)
		return
	}
	defer stream.Reader.Close()
	w.Header().Set("Content-Type", stream.ContentType)
	if stream.Attachment {
		w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(stream.OriginalName))
	} else {
		w.Header().Set("Content-Disposition", "inline")
	}
	w.Header().Set("Accept-Ranges", "bytes")
	stdhttp.ServeContent(w, r, "", stream.ModifiedAt, stream.Reader)
}
func (h MediaHandler) error(w stdhttp.ResponseWriter, err error) {
	status := stdhttp.StatusNotFound
	if _, missing := err.(errMediaNotFound); !missing && h.operations.StatusFor != nil {
		status = h.operations.StatusFor(err)
	}
	detail := "File not found"
	if h.operations.DetailFor != nil {
		detail = h.operations.DetailFor(err)
	}
	writeFileAccess(w, status, map[string]string{"detail": detail})
}

type errMediaNotFound struct{}

func (errMediaNotFound) Error() string { return "File not found" }
func mediaToken(r *stdhttp.Request) string {
	values := r.Header.Values(MediaPlaybackTokenHeader)
	if len(values) == 1 {
		return strings.TrimSpace(values[0])
	}
	return strings.TrimSpace(r.URL.Query().Get("token"))
}
