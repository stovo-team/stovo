package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"testing"
)

func TestFileListHandlerPreservesListContract(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		h := NewFileListHandler(FileListOperations{List: func(context.Context) ([]FileListItem, error) {
			return []FileListItem{{ID: "file-1", FamilyID: "family-1", UploadedBy: "user-1", AccessScope: "family", StorageProvider: "local", OriginalName: "note.txt", MimeType: "text/plain"}}, nil
		}})
		r := httptest.NewRecorder()
		h.GetFiles(r, httptest.NewRequest(stdhttp.MethodGet, "/api/files", nil))
		if r.Code != stdhttp.StatusOK || r.Body.String() != "[{\"id\":\"file-1\",\"familyId\":\"family-1\",\"uploadedBy\":\"user-1\",\"chatId\":null,\"chatTitle\":null,\"chatType\":null,\"originMessageId\":null,\"accessScope\":\"family\",\"storageProvider\":\"local\",\"thumbnailObjectKey\":null,\"originalName\":\"note.txt\",\"mimeType\":\"text/plain\",\"sizeBytes\":0,\"checksum\":null,\"createdAt\":\"0001-01-01T00:00:00Z\",\"deletedAt\":null,\"isFavorite\":false}]\n" {
			t.Fatalf("got %d %s", r.Code, r.Body.String())
		}
	})

	t.Run("failure", func(t *testing.T) {
		h := NewFileListHandler(FileListOperations{List: func(context.Context) ([]FileListItem, error) { return nil, errors.New("db") }})
		r := httptest.NewRecorder()
		h.GetFiles(r, httptest.NewRequest(stdhttp.MethodGet, "/api/files", nil))
		if r.Code != stdhttp.StatusInternalServerError || r.Body.String() != "{\"detail\":\"Could not load files\"}\n" {
			t.Fatalf("got %d %s", r.Code, r.Body.String())
		}
	})
}
