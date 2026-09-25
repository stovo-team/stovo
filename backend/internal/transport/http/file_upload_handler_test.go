package http

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestDirectUploadHandlerReserve(t *testing.T) {
	t.Run("missing idempotency key", func(t *testing.T) {
		h := NewDirectUploadHandler(DirectUploadOperations{})
		r := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/files/uploads", strings.NewReader(`{}`))
		h.Reserve(r, req)
		if r.Code != stdhttp.StatusUnprocessableEntity || !strings.Contains(r.Body.String(), "Idempotency-Key is required") {
			t.Fatalf("got status %d body %s", r.Code, r.Body.String())
		}
	})

	t.Run("invalid json body", func(t *testing.T) {
		h := NewDirectUploadHandler(DirectUploadOperations{})
		r := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/files/uploads", strings.NewReader(`invalid json`))
		req.Header.Set("Idempotency-Key", "key-123")
		h.Reserve(r, req)
		if r.Code != stdhttp.StatusUnprocessableEntity || !strings.Contains(r.Body.String(), "Invalid request body") {
			t.Fatalf("got status %d body %s", r.Code, r.Body.String())
		}
	})

	t.Run("success", func(t *testing.T) {
		h := NewDirectUploadHandler(DirectUploadOperations{
			Reserve: func(ctx context.Context, key string, payload ReserveDirectFileUploadRequest) (DirectFileUploadResponse, int, string, error) {
				return PresentDirectFileUpload("upload-1", "file-1", "reserved", payload.MimeType, payload.SizeBytes), stdhttp.StatusOK, "", nil
			},
		})
		r := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/files/uploads", strings.NewReader(`{"originalName":"doc.pdf","mimeType":"application/pdf","sizeBytes":100}`))
		req.Header.Set("Idempotency-Key", "key-123")
		h.Reserve(r, req)
		if r.Code != stdhttp.StatusOK || !strings.Contains(r.Body.String(), "upload-1") {
			t.Fatalf("got status %d body %s", r.Code, r.Body.String())
		}
	})
}

func TestDirectUploadHandlerComplete(t *testing.T) {
	newRequest := func(uploadID string) *stdhttp.Request {
		r := httptest.NewRequest(stdhttp.MethodPost, "/api/files/uploads/"+uploadID+"/complete", nil)
		ctx := chi.NewRouteContext()
		ctx.URLParams.Add("uploadId", uploadID)
		return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, ctx))
	}

	t.Run("success", func(t *testing.T) {
		h := NewDirectUploadHandler(DirectUploadOperations{
			Complete: func(ctx context.Context, uploadID string) (DirectFileUploadResponse, int, string, error) {
				return PresentDirectFileUpload(uploadID, "file-1", "validating", "image/png", 42), stdhttp.StatusAccepted, "", nil
			},
		})
		r := httptest.NewRecorder()
		h.Complete(r, newRequest("upload-1"))
		if r.Code != stdhttp.StatusAccepted || !strings.Contains(r.Body.String(), "validating") {
			t.Fatalf("got status %d body %s", r.Code, r.Body.String())
		}
	})
}

func TestFileUploadHandlerUpload(t *testing.T) {
	t.Run("missing file", func(t *testing.T) {
		h := NewFileUploadHandler(1024, FileUploadOperations{})
		r := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/files/upload", strings.NewReader(`test`))
		req.Header.Set("Content-Type", "multipart/form-data; boundary=---")
		h.Upload(r, req)
		if r.Code != stdhttp.StatusBadRequest {
			t.Fatalf("got status %d", r.Code)
		}
	})

	t.Run("success", func(t *testing.T) {
		h := NewFileUploadHandler(1024, FileUploadOperations{
			Upload: func(ctx context.Context, input MultipartUploadInput) (any, int, string, error) {
				if input.Filename != "test.txt" || string(input.Data) != "hello world" {
					return nil, stdhttp.StatusBadRequest, "Invalid file content", errors.New("bad file")
				}
				return map[string]string{"id": "file-99"}, stdhttp.StatusCreated, "", nil
			},
		})

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "test.txt")
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		_, _ = part.Write([]byte("hello world"))
		_ = writer.Close()

		req := httptest.NewRequest(stdhttp.MethodPost, "/api/files/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())

		r := httptest.NewRecorder()
		h.Upload(r, req)
		if r.Code != stdhttp.StatusCreated || !strings.Contains(r.Body.String(), "file-99") {
			t.Fatalf("got status %d body %s", r.Code, r.Body.String())
		}
	})
}

func TestReadUploadDataErrorMessages(t *testing.T) {
	t.Run("read failure", func(t *testing.T) {
		_, err := readUploadData(failingUploadReader{}, 8)
		if err == nil || err.Error() != "could not read upload" {
			t.Fatalf("readUploadData error = %v, want %q", err, "could not read upload")
		}
	})

	t.Run("size limit", func(t *testing.T) {
		_, err := readUploadData(strings.NewReader("12345"), 4)
		if err == nil || err.Error() != "file exceeds maximum upload size" {
			t.Fatalf("readUploadData error = %v, want %q", err, "file exceeds maximum upload size")
		}
	})
}

type failingUploadReader struct{}

func (failingUploadReader) Read([]byte) (int, error) {
	return 0, errors.New("read failed")
}
