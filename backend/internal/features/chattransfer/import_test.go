package chattransfer

import (
	"context"
	"errors"
	"testing"
	"time"
)

type importStoreFake struct {
	lookup  ImportResult
	found   bool
	commit  ImportCommit
	commits int
	err     error
}

type importObjectsFake struct {
	saved   map[string][]byte
	deleted []string
	err     error
}

func (s *importObjectsFake) Save(key string, data []byte) error {
	if s.err != nil {
		return s.err
	}
	if s.saved == nil {
		s.saved = map[string][]byte{}
	}
	s.saved[key] = append([]byte(nil), data...)
	return nil
}
func (s *importObjectsFake) Delete(key string) error {
	s.deleted = append(s.deleted, key)
	delete(s.saved, key)
	return nil
}
func (*importObjectsFake) Provider() string { return "local" }

func (s *importStoreFake) FindImport(context.Context, string, string, string) (ImportResult, bool, error) {
	return s.lookup, s.found, nil
}

func (s *importStoreFake) CommitImport(_ context.Context, commit ImportCommit) (ImportResult, bool, error) {
	s.commit = commit
	s.commits++
	if s.err != nil {
		return ImportResult{}, false, s.err
	}
	return ImportResult{ChatID: commit.Chat.ID, CreatedAt: commit.CreatedAt}, true, nil
}

func TestImportServiceCommitPreservesSourceAttributionAndHistory(t *testing.T) {
	store := &importStoreFake{}
	ids := []string{"generated-chat-id", "batch-id", "message-id"}
	idIndex := 0
	service := NewImportService(store, func() time.Time { return time.Date(2026, 10, 11, 10, 0, 0, 0, time.UTC) }, func() string { value := ids[idIndex]; idIndex++; return value })
	archive := importTestArchive()
	result, err := service.Commit(context.Background(), ImportRequest{
		FamilyID: "family-1", ImportingUserID: "stovo-user-1", IdempotencyKey: "import-1", Archive: archive,
	})
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	if result.ChatID != "generated-chat-id" {
		t.Fatalf("result chat ID = %q", result.ChatID)
	}
	if got := store.commit.Chat.Title; got != "Imported: Planning" {
		t.Fatalf("imported title = %q", got)
	}
	if store.commit.Chat.Type != "archive" || len(store.commit.Chat.MemberIDs) != 1 || store.commit.Chat.MemberIDs[0] != "stovo-user-1" {
		t.Fatalf("chat must be a private archive with only the importer: %#v", store.commit.Chat)
	}
	if len(store.commit.Messages) != 1 {
		t.Fatalf("message count = %d", len(store.commit.Messages))
	}
	message := store.commit.Messages[0]
	if message.ID != "message-id" || message.SenderID != "stovo-user-1" || message.SourceAuthorID != "source-user-1" || message.SourceAuthorName != "Mira" {
		t.Fatalf("message attribution = %#v", message)
	}
	if message.CreatedAt != "2026-10-10T08:00:00Z" || message.Content != "Hello" {
		t.Fatalf("message historical content/time = %#v", message)
	}
	if len(store.commit.Files) != 0 {
		t.Fatalf("unexpected file records: %#v", store.commit.Files)
	}
}

func TestImportServiceRejectsDuplicateSourceIDsBeforePersistence(t *testing.T) {
	store := &importStoreFake{}
	service := NewImportService(store, nil, nil)
	archive := importTestArchive()
	archive.Messages = append(archive.Messages, archive.Messages[0])
	if _, err := service.Commit(context.Background(), ImportRequest{FamilyID: "family-1", ImportingUserID: "user-1", IdempotencyKey: "import-1", Archive: archive}); err == nil {
		t.Fatal("Commit() error = nil, want duplicate message ID validation error")
	}
	if store.commits != 0 {
		t.Fatalf("CommitImport called %d times for invalid archive", store.commits)
	}
}

func TestImportServiceReturnsPriorResultForSameIdempotencyKey(t *testing.T) {
	store := &importStoreFake{lookup: ImportResult{ChatID: "existing-chat"}, found: true}
	service := NewImportService(store, nil, nil)
	result, err := service.Commit(context.Background(), ImportRequest{FamilyID: "family-1", ImportingUserID: "user-1", IdempotencyKey: "same-key", Archive: importTestArchive()})
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	if result.ChatID != "existing-chat" || store.commits != 0 {
		t.Fatalf("result=%#v commits=%d, want existing result and no write", result, store.commits)
	}
}

func TestImportServiceRejectsMissingActorOrIdempotencyKey(t *testing.T) {
	for _, request := range []ImportRequest{
		{FamilyID: "family-1", ImportingUserID: "user-1", Archive: importTestArchive()},
		{FamilyID: "family-1", IdempotencyKey: "key-1", Archive: importTestArchive()},
	} {
		store := &importStoreFake{}
		if _, err := NewImportService(store, nil, nil).Commit(context.Background(), request); err == nil {
			t.Fatal("Commit() error = nil, want required actor/idempotency error")
		}
		if store.commits != 0 {
			t.Fatal("invalid request reached persistence")
		}
	}
}

func TestImportServicePropagatesPersistenceFailure(t *testing.T) {
	want := errors.New("write failed")
	store := &importStoreFake{err: want}
	_, err := NewImportService(store, nil, nil).Commit(context.Background(), ImportRequest{FamilyID: "family-1", ImportingUserID: "user-1", IdempotencyKey: "key-1", Archive: importTestArchive()})
	if !errors.Is(err, want) {
		t.Fatalf("Commit() error = %v, want %v", err, want)
	}
}

func TestImportServiceStagesAttachmentsAndCleansThemUpOnDatabaseFailure(t *testing.T) {
	store := &importStoreFake{err: errors.New("transaction failed")}
	objects := &importObjectsFake{}
	ids := []string{"chat-id", "batch-id", "message-id", "file-id", "object-id"}
	idIndex := 0
	archive := importTestArchive()
	archive.Attachments = []Attachment{{ID: "source-file", Path: "media/photo.png", Filename: "../photo.png", MIMEType: "text/html", Size: 4, Bytes: []byte("data")}}
	archive.Messages[0].AttachmentIDs = []string{"source-file"}
	_, err := NewImportService(store, nil, func() string { value := ids[idIndex]; idIndex++; return value }, objects).Commit(context.Background(), ImportRequest{FamilyID: "family-1", ImportingUserID: "user-1", IdempotencyKey: "key-1", Archive: archive})
	if err == nil {
		t.Fatal("Commit() error = nil, want persistence failure")
	}
	if len(store.commit.Files) != 1 || store.commit.Files[0].ID != "file-id" || store.commit.Files[0].OriginalName != "photo.png" || store.commit.Files[0].MIMEType != "application/octet-stream" {
		t.Fatalf("staged file metadata = %#v", store.commit.Files)
	}
	if len(store.commit.Messages[0].AttachmentFileIDs) != 1 || store.commit.Messages[0].AttachmentFileIDs[0] != "file-id" {
		t.Fatalf("message file refs = %#v", store.commit.Messages[0].AttachmentFileIDs)
	}
	if len(objects.saved) != 0 || len(objects.deleted) != 1 {
		t.Fatalf("saved=%d deleted=%#v, want staged object cleanup", len(objects.saved), objects.deleted)
	}
}

func importTestArchive() Archive {
	text := "Hello"
	return Archive{
		SchemaVersion: SchemaVersion,
		Source:        Source{ProviderID: "telegram", ProfileID: "telegram-desktop-json"},
		Conversation:  Conversation{SourceID: "source-chat-1", Title: "Planning"},
		Participants:  []Participant{{SourceID: "source-user-1", DisplayName: "Mira"}},
		Messages:      []Message{{SourceID: "source-message-1", AuthorID: "source-user-1", Timestamp: time.Date(2026, 10, 10, 8, 0, 0, 0, time.UTC), Kind: "text", Text: &text}},
		Attachments:   []Attachment{},
	}
}
