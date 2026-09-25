package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	stdhttp "net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// DirectUploadOperations provides application callbacks for upload reservation
// and completion without exposing internal storage or DB entities to HTTP.
type DirectUploadOperations struct {
	Reserve  func(ctx context.Context, idempotencyKey string, payload ReserveDirectFileUploadRequest) (DirectFileUploadResponse, int, string, error)
	Complete func(ctx context.Context, uploadID string) (DirectFileUploadResponse, int, string, error)
}

// DirectUploadHandler owns header extraction, JSON decoding, URL parameter
// extraction, and status formatting for direct upload operations.
type DirectUploadHandler struct {
	operations DirectUploadOperations
}

func NewDirectUploadHandler(operations DirectUploadOperations) DirectUploadHandler {
	return DirectUploadHandler{operations: operations}
}

func (h DirectUploadHandler) Reserve(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" || len(key) > 200 {
		writeDirectUploadError(w, stdhttp.StatusUnprocessableEntity, "Idempotency-Key is required")
		return
	}
	var payload ReserveDirectFileUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeDirectUploadError(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	resp, status, detail, err := h.operations.Reserve(r.Context(), key, payload)
	if err != nil || detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		if detail == "" && err != nil {
			detail = err.Error()
		}
		writeDirectUploadError(w, status, detail)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h DirectUploadHandler) Complete(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	uploadID := strings.TrimSpace(chi.URLParam(r, "uploadId"))
	if uploadID == "" {
		writeDirectUploadError(w, stdhttp.StatusNotFound, "Upload not found")
		return
	}
	resp, status, detail, err := h.operations.Complete(r.Context(), uploadID)
	if err != nil || detail != "" {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		if detail == "" && err != nil {
			detail = err.Error()
		}
		writeDirectUploadError(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusAccepted
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(resp)
}

// MultipartUploadInput represents the raw parsed multipart file parameters.
type MultipartUploadInput struct {
	Filename    string
	ContentType string
	ChatID      string
	Data        []byte
}

// FileUploadOperations provides the application callback for legacy multipart uploads.
type FileUploadOperations struct {
	Upload func(ctx context.Context, input MultipartUploadInput) (any, int, string, error)
}

// FileUploadHandler owns multipart form parsing and status responses for legacy file uploads.
type FileUploadHandler struct {
	maxUploadSizeBytes int64
	operations         FileUploadOperations
}

func NewFileUploadHandler(maxUploadSizeBytes int64, operations FileUploadOperations) FileUploadHandler {
	return FileUploadHandler{maxUploadSizeBytes: maxUploadSizeBytes, operations: operations}
}

func (h FileUploadHandler) Upload(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	maxSize := h.maxUploadSizeBytes
	if maxSize <= 0 {
		maxSize = 32 << 20
	}
	if err := r.ParseMultipartForm(maxSize); err != nil {
		writeFileUploadError(w, stdhttp.StatusBadRequest, "Could not parse upload")
		return
	}

	fileHeader, header, err := r.FormFile("file")
	if err != nil {
		writeFileUploadError(w, stdhttp.StatusBadRequest, "file is required")
		return
	}
	defer func() { _ = fileHeader.Close() }()

	data, err := readUploadData(fileHeader, maxSize)
	if err != nil {
		writeFileUploadError(w, stdhttp.StatusBadRequest, err.Error())
		return
	}

	chatID := strings.TrimSpace(r.FormValue("chatId"))
	result, status, detail, err := h.operations.Upload(r.Context(), MultipartUploadInput{
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		ChatID:      chatID,
		Data:        data,
	})
	if err != nil || detail != "" {
		if status == 0 {
			status = stdhttp.StatusBadRequest
		}
		if detail == "" && err != nil {
			detail = err.Error()
		}
		writeFileUploadError(w, status, detail)
		return
	}
	if status == 0 {
		status = stdhttp.StatusCreated
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(result)
}

func readUploadData(r io.Reader, maxBytes int64) ([]byte, error) {
	lr := io.LimitReader(r, maxBytes+1)
	data, err := io.ReadAll(lr)
	if err != nil {
		return nil, errors.New("could not read upload")
	}
	if int64(len(data)) > maxBytes {
		return nil, errors.New("file exceeds maximum upload size")
	}
	return data, nil
}

func writeFileUploadError(w stdhttp.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": message})
}
