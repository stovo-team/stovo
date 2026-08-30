package http

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// FileListItem is the stable JSON representation returned by GET /api/files.
// It is owned by the HTTP adapter so neither application callbacks nor feature
// services need to depend on a transport response type.
type FileListItem struct {
	ID                 string     `json:"id"`
	FamilyID           string     `json:"familyId"`
	UploadedBy         string     `json:"uploadedBy"`
	ChatID             *string    `json:"chatId"`
	ChatTitle          *string    `json:"chatTitle"`
	ChatType           *string    `json:"chatType"`
	OriginMessageID    *string    `json:"originMessageId"`
	AccessScope        string     `json:"accessScope"`
	StorageProvider    string     `json:"storageProvider"`
	ThumbnailObjectKey *string    `json:"thumbnailObjectKey"`
	OriginalName       string     `json:"originalName"`
	MimeType           string     `json:"mimeType"`
	SizeBytes          int64      `json:"sizeBytes"`
	Checksum           *string    `json:"checksum"`
	CreatedAt          time.Time  `json:"createdAt"`
	DeletedAt          *time.Time `json:"deletedAt"`
	IsFavorite         bool       `json:"isFavorite"`
}

// FileListOperations provides the already-authorized, presentation-neutral
// list operation. Binding the authenticated user in composition keeps request
// authentication out of the transport handler.
type FileListOperations struct {
	List func(context.Context) ([]FileListItem, error)
}

// FileListHandler owns the GET /api/files response contract.
type FileListHandler struct{ operations FileListOperations }

func NewFileListHandler(operations FileListOperations) FileListHandler {
	return FileListHandler{operations: operations}
}

func (h FileListHandler) GetFiles(w http.ResponseWriter, r *http.Request) {
	files, err := h.operations.List(r.Context())
	if err != nil {
		writeFileListError(w, http.StatusInternalServerError, "Could not load files")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(files)
}

func writeFileListError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": message})
}
