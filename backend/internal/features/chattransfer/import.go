package chattransfer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

var (
	ErrImportRequestInvalid = errors.New("invalid chat import request")
	ErrIdempotencyConflict  = errors.New("idempotency key was already used for a different archive")
	ErrAttachmentStorage    = errors.New("attachment storage is unavailable")
)

type ImportRequest struct {
	FamilyID        string
	ImportingUserID string
	IdempotencyKey  string
	Archive         Archive
	Encryption      string
	PreparedContent map[string]StoredMessageContent
}

type StoredMessageContent struct {
	Content            *string
	Ciphertext         *string
	Nonce              *string
	EncryptionMetadata *string
}

type ImportResult struct {
	ChatID    string
	CreatedAt string
	Replayed  bool
}

type ImportedChat struct {
	ID, FamilyID, Type, Title, CreatedBy, MediaVisibility, EncryptionProtocol, CreatedAt string
	MemberIDs                                                                            []string
}

type ImportedMessage struct {
	ID, SourceMessageID, SenderID, SourceAuthorID, SourceAuthorName      string
	Type, Content, EncryptionProtocol, CreatedAt, UpdatedAt, MessageKind string
	Ciphertext, Nonce, EncryptionMetadata                                *string
	ReplyToMessageID, ThreadRootMessageID                                *string
	IsEdited                                                             bool
	SourceDeletedAt                                                      *string
	SourceReactions                                                      json.RawMessage
	SourceMetadata                                                       json.RawMessage
	SourceAttachments                                                    json.RawMessage
	AttachmentFileIDs                                                    []string
}

type ImportedFile struct {
	ID, SourceAttachmentID, FamilyID, UploadedBy, ChatID                       string
	AccessScope, StorageProvider, ObjectKey, OriginalName, MIMEType, CreatedAt string
	Size                                                                       int
	Checksum                                                                   *string
}

type ImportCommit struct {
	BatchID, FamilyID, ImportingUserID, IdempotencyKey, RequestHash string
	SourceProvider, SourceProfile, SourceConversationID, CreatedAt  string
	Chat                                                            ImportedChat
	Messages                                                        []ImportedMessage
	Files                                                           []ImportedFile
}

type ImportStore interface {
	FindImport(context.Context, string, string, string) (ImportResult, bool, error)
	CommitImport(context.Context, ImportCommit) (ImportResult, bool, error)
}

type ImportObjectStore interface {
	Save(string, []byte) error
	Delete(string) error
	Provider() string
}

type ImportService struct {
	store   ImportStore
	objects ImportObjectStore
	now     func() time.Time
	newID   func() string
}

func NewImportService(store ImportStore, now func() time.Time, newID func() string, objects ...ImportObjectStore) *ImportService {
	if now == nil {
		now = time.Now
	}
	if newID == nil {
		newID = func() string { return uuid.NewString() }
	}
	service := &ImportService{store: store, now: now, newID: newID}
	if len(objects) > 0 {
		service.objects = objects[0]
	}
	return service
}

// Commit validates a provider-neutral archive and persists it as a new private
// archive chat. Object bytes are staged before the database transaction and
// removed if persistence fails; all chat/message/provenance rows are committed
// atomically by the store.
func (s *ImportService) Commit(ctx context.Context, request ImportRequest) (ImportResult, error) {
	if s.store == nil || strings.TrimSpace(request.FamilyID) == "" || strings.TrimSpace(request.ImportingUserID) == "" || strings.TrimSpace(request.IdempotencyKey) == "" || len(request.IdempotencyKey) > 200 {
		return ImportResult{}, ErrImportRequestInvalid
	}
	if err := ValidateArchive(request.Archive); err != nil {
		return ImportResult{}, err
	}
	encoded, err := json.Marshal(request.Archive)
	if err != nil {
		return ImportResult{}, fmt.Errorf("encode import archive: %w", err)
	}
	digest := sha256.Sum256(encoded)
	requestHash := hex.EncodeToString(digest[:])
	if existing, found, err := s.store.FindImport(ctx, request.ImportingUserID, request.IdempotencyKey, requestHash); err != nil {
		return ImportResult{}, err
	} else if found {
		existing.Replayed = true
		return existing, nil
	}

	createdAt := s.now().UTC().Format(time.RFC3339Nano)
	chatID, batchID := s.newID(), s.newID()
	title := importedTitle(request.Archive.Conversation.Title)
	protocol := request.Encryption
	if protocol == "" {
		protocol = "legacy_plaintext"
	}
	commit := ImportCommit{
		BatchID: batchID, FamilyID: request.FamilyID, ImportingUserID: request.ImportingUserID,
		IdempotencyKey: request.IdempotencyKey, RequestHash: requestHash,
		SourceProvider: request.Archive.Source.ProviderID, SourceProfile: request.Archive.Source.ProfileID,
		SourceConversationID: request.Archive.Conversation.SourceID, CreatedAt: createdAt,
		Chat: ImportedChat{ID: chatID, FamilyID: request.FamilyID, Type: "archive", Title: title, CreatedBy: request.ImportingUserID, MediaVisibility: "members", EncryptionProtocol: protocol, CreatedAt: createdAt, MemberIDs: []string{request.ImportingUserID}},
	}
	messageIDs := make(map[string]string, len(request.Archive.Messages))
	for _, source := range request.Archive.Messages {
		messageIDs[source.SourceID] = s.newID()
	}
	attachmentIDs := make(map[string]string, len(request.Archive.Attachments))
	staged := make([]string, 0, len(request.Archive.Attachments))
	cleanup := func() {
		if s.objects != nil {
			for _, key := range staged {
				_ = s.objects.Delete(key)
			}
		}
	}
	for _, attachment := range request.Archive.Attachments {
		if len(attachment.Bytes) == 0 {
			continue
		}
		if s.objects == nil {
			return ImportResult{}, ErrAttachmentStorage
		}
		fileID, objectKey := s.newID(), "chat-imports/"+request.FamilyID+"/"+chatID+"/"+s.newID()
		if err := s.objects.Save(objectKey, attachment.Bytes); err != nil {
			cleanup()
			return ImportResult{}, fmt.Errorf("stage import attachment: %w", err)
		}
		staged = append(staged, objectKey)
		name := safeImportFilename(attachment.Filename)
		mimeType := safeImportMIME(attachment.MIMEType)
		checksum := attachment.Checksum
		if checksum == "" {
			sum := sha256.Sum256(attachment.Bytes)
			checksum = hex.EncodeToString(sum[:])
		}
		attachmentIDs[attachment.ID] = fileID
		commit.Files = append(commit.Files, ImportedFile{ID: fileID, SourceAttachmentID: attachment.ID, FamilyID: request.FamilyID, UploadedBy: request.ImportingUserID, ChatID: chatID, AccessScope: "chat", StorageProvider: s.objects.Provider(), ObjectKey: objectKey, OriginalName: name, MIMEType: mimeType, Size: len(attachment.Bytes), Checksum: &checksum, CreatedAt: createdAt})
	}

	participantNames := make(map[string]string, len(request.Archive.Participants))
	for _, participant := range request.Archive.Participants {
		participantNames[participant.SourceID] = safeImportedText(participant.DisplayName)
	}
	for _, source := range request.Archive.Messages {
		content := ""
		if source.Text != nil {
			content = safeImportedText(*source.Text)
		}
		stored := StoredMessageContent{Content: &content}
		if supplied, ok := request.PreparedContent[source.SourceID]; ok {
			stored = supplied
		}
		messageKind := "chat"
		if source.ThreadRootSourceID != "" {
			messageKind = "thread"
		}
		message := ImportedMessage{
			ID: messageIDs[source.SourceID], SourceMessageID: source.SourceID, SenderID: request.ImportingUserID,
			SourceAuthorID: source.AuthorID, SourceAuthorName: participantNames[source.AuthorID],
			Type: "text", EncryptionProtocol: protocol, CreatedAt: source.Timestamp.UTC().Format(time.RFC3339Nano), UpdatedAt: source.Timestamp.UTC().Format(time.RFC3339Nano), MessageKind: messageKind,
			Ciphertext: stored.Ciphertext, Nonce: stored.Nonce, EncryptionMetadata: stored.EncryptionMetadata,
			ReplyToMessageID: mappedMessageID(source.ReplyToSourceID, messageIDs), ThreadRootMessageID: mappedMessageID(source.ThreadRootSourceID, messageIDs),
			IsEdited: source.IsEdited, SourceReactions: jsonBytes(source.Reactions), SourceMetadata: jsonBytes(sourceMetadata(source.Metadata, source.Kind)), SourceAttachments: jsonBytes(sourceAttachments(source.AttachmentIDs, request.Archive.Attachments)),
		}
		if stored.Content != nil {
			message.Content = *stored.Content
		}
		if source.DeletedAt != nil {
			deletedAt := source.DeletedAt.UTC().Format(time.RFC3339Nano)
			message.SourceDeletedAt = &deletedAt
		}
		for _, sourceAttachmentID := range source.AttachmentIDs {
			if fileID := attachmentIDs[sourceAttachmentID]; fileID != "" {
				message.AttachmentFileIDs = append(message.AttachmentFileIDs, fileID)
			}
		}
		commit.Messages = append(commit.Messages, message)
	}
	result, created, err := s.store.CommitImport(ctx, commit)
	if err != nil || !created {
		cleanup()
	}
	if err != nil {
		return ImportResult{}, err
	}
	result.Replayed = !created
	return result, nil
}

func importedTitle(source string) string {
	const prefix = "Imported: "
	name := strings.TrimSpace(safeImportedText(source))
	if name == "" {
		name = "Chat"
	}
	max := 100 - len(prefix)
	if len(name) > max {
		name = name[:max]
		for !utf8.ValidString(name) {
			name = name[:len(name)-1]
		}
	}
	return prefix + name
}

func safeImportedText(value string) string {
	value = strings.ToValidUTF8(value, "�")
	return strings.ReplaceAll(value, "\x00", "�")
}

func safeImportFilename(value string) string {
	name := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	name = path.Base(name)
	name = strings.ReplaceAll(name, "\x00", "")
	if name == "" || name == "." {
		return "attachment"
	}
	if len(name) > 240 {
		name = name[:240]
		for !utf8.ValidString(name) {
			name = name[:len(name)-1]
		}
	}
	return name
}

func safeImportMIME(value string) string {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	if err != nil || mediaType == "text/html" || mediaType == "image/svg+xml" || strings.Contains(mediaType, "javascript") {
		return "application/octet-stream"
	}
	return mediaType
}

func mappedMessageID(sourceID string, ids map[string]string) *string {
	if sourceID == "" {
		return nil
	}
	id := ids[sourceID]
	return &id
}

func jsonBytes(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil || len(encoded) == 0 {
		return json.RawMessage("null")
	}
	return encoded
}

func sourceAttachments(ids []string, attachments []Attachment) []map[string]any {
	selected := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		selected[id] = struct{}{}
	}
	result := make([]map[string]any, 0, len(ids))
	for _, attachment := range attachments {
		if _, ok := selected[attachment.ID]; !ok {
			continue
		}
		result = append(result, map[string]any{"id": attachment.ID, "path": attachment.Path, "filename": attachment.Filename, "mimeType": attachment.MIMEType, "size": attachment.Size, "checksum": attachment.Checksum, "externalUrl": attachment.ExternalURL})
	}
	return result
}

func sourceMetadata(metadata map[string]any, kind string) map[string]any {
	result := make(map[string]any, len(metadata)+1)
	for key, value := range metadata {
		result[key] = value
	}
	result["sourceKind"] = kind
	return result
}
