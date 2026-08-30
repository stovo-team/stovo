package http

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestDirectUploadReadHandlerPreservesStatusContract(t *testing.T) {
	newRequest := func(uploadID string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/api/files/uploads/"+uploadID, nil)
		ctx := chi.NewRouteContext()
		ctx.URLParams.Add("uploadId", uploadID)
		return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, ctx))
	}

	t.Run("not found", func(t *testing.T) {
		h := NewDirectUploadReadHandler(DirectUploadReadOperations{Load: func(context.Context, string) (DirectFileUploadResponse, bool, bool, error) {
			return DirectFileUploadResponse{}, false, false, nil
		}})
		r := httptest.NewRecorder()
		h.GetDirectUpload(r, newRequest("missing"))
		if r.Code != http.StatusNotFound || r.Body.String() != "{\"detail\":\"Upload not found\"}\n" {
			t.Fatalf("got %d %s", r.Code, r.Body.String())
		}
	})

	t.Run("unavailable", func(t *testing.T) {
		h := NewDirectUploadReadHandler(DirectUploadReadOperations{Load: func(context.Context, string) (DirectFileUploadResponse, bool, bool, error) {
			return DirectFileUploadResponse{}, true, true, errors.New("presign")
		}})
		r := httptest.NewRecorder()
		h.GetDirectUpload(r, newRequest("upload-1"))
		if r.Code != http.StatusServiceUnavailable || r.Body.String() != "{\"detail\":\"Direct uploads are not available\"}\n" {
			t.Fatalf("got %d %s", r.Code, r.Body.String())
		}
	})

	t.Run("success", func(t *testing.T) {
		h := NewDirectUploadReadHandler(DirectUploadReadOperations{Load: func(context.Context, string) (DirectFileUploadResponse, bool, bool, error) {
			return PresentDirectFileUpload("upload-1", "file-1", "ready", "image/png", 42), true, false, nil
		}})
		r := httptest.NewRecorder()
		h.GetDirectUpload(r, newRequest("upload-1"))
		if r.Code != http.StatusOK || r.Body.String() != "{\"uploadId\":\"upload-1\",\"fileId\":\"file-1\",\"state\":\"ready\",\"expectedMimeType\":\"image/png\",\"expectedSizeBytes\":42}\n" {
			t.Fatalf("got %d %s", r.Code, r.Body.String())
		}
	})
}
