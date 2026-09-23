// Package files contains file lifecycle use cases and policy.
package files

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"mime"
	"path/filepath"
	"strings"
	"time"
)

var ErrInvalidChecksum = errors.New("checksum must be a SHA-256 hex digest")

// NormalizeChecksum applies the direct-upload checksum contract before an
// outer persistence adapter reserves storage metadata.
func NormalizeChecksum(checksum *string) (*string, error) {
	if checksum == nil {
		return nil, nil
	}
	value := strings.ToLower(strings.TrimSpace(*checksum))
	if len(value) != 64 {
		return nil, ErrInvalidChecksum
	}
	for _, ch := range value {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f')) {
			return nil, ErrInvalidChecksum
		}
	}
	return &value, nil
}

func SanitizeFilename(name string) string {
	base := filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	base = strings.TrimSpace(base)
	if base == "" || base == "." {
		return "file"
	}
	return strings.NewReplacer("..", "", "/", "-", "\\", "-", "\x00", "").Replace(base)
}

func AllowedMIME(contentType string) bool {
	mimeType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	switch mimeType {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "application/pdf", "text/plain", "text/markdown", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return true
	default:
		return false
	}
}

func NormalizeUploadMIME(contentType, filename string) (string, bool) {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err == nil && AllowedMIME(mediaType) {
		return mediaType, true
	}
	if mediaType != "" && mediaType != "application/octet-stream" && mediaType != "binary/octet-stream" {
		return "", false
	}
	inferred := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename)))
	inferredType, _, err := mime.ParseMediaType(inferred)
	if err != nil || !AllowedMIME(inferredType) {
		return "", false
	}
	return inferredType, true
}

// UploadCompletionState determines whether a completion request is idempotent,
// eligible for validation, or no longer valid. Persistence locking remains in
// the adapter/transport layer.
func UploadCompletionState(state string, expiresAt, now time.Time) (next string, accepted bool) {
	if state == "validating" || state == "ready" {
		return state, true
	}
	if state != "reserved" || !now.Before(expiresAt) {
		return "", false
	}
	return "validating", true
}

type ReservationRequest struct {
	OriginalName string
	MIMEType     string
	SizeBytes    int64
	Checksum     *string
	ChatID       string
}

// DirectUpload is the persistence-neutral lifecycle projection required by
// file use cases and inbound transports.
type DirectUpload struct {
	UploadID       string
	FileID         string
	ObjectKey      string
	ExpectedMIME   string
	ExpectedBytes  int64
	ExpectedSHA256 *string
	State          string
	ExpiresAt      time.Time
}

type DirectUploadReader interface {
	FindByIdempotency(context.Context, string, string) (DirectUpload, bool, error)
	FindByID(context.Context, string, string) (DirectUpload, bool, error)
	RequestHash(context.Context, string) (string, error)
}

type DirectUploadStore interface {
	DirectUploadReader
	Complete(context.Context, CompleteUploadInput) (DirectUpload, bool, error)
	Reserve(context.Context, ReserveUploadInput) error
}

// FavoriteChange is private to one user, including their other devices. The
// store owns the atomic preference and sync-event/outbox write.
type FavoriteChange struct {
	FileID, UserID, FamilyID string
	IsFavorite               bool
}

type PreferenceStore interface {
	SetFavorite(context.Context, FavoriteChange) error
}

type PreferenceService struct{ store PreferenceStore }

func NewPreferenceService(store PreferenceStore) *PreferenceService {
	return &PreferenceService{store: store}
}

func (s *PreferenceService) SetFavorite(ctx context.Context, change FavoriteChange) error {
	return s.store.SetFavorite(ctx, change)
}

// Deletion describes an already-authorized file deletion. The persistence
// adapter owns the atomic metadata change and its durable sync notification.
// Object removal remains an outer concern because it cannot be included in a
// database transaction.
type Deletion struct {
	FileID, FamilyID string
	ChatID           *string
}

type DeletionStore interface {
	Delete(context.Context, Deletion) error
}

type DeletionService struct{ store DeletionStore }

func NewDeletionService(store DeletionStore) *DeletionService {
	return &DeletionService{store: store}
}

func (s *DeletionService) Delete(ctx context.Context, deletion Deletion) error {
	return s.store.Delete(ctx, deletion)
}

// LegacyUpload is the metadata produced after the legacy multipart transport
// has saved its bytes. The store commits the metadata and recipient event as
// one unit, while byte streaming and thumbnail generation stay at the edge.
type LegacyUpload struct {
	FileID, FamilyID, UserID string
	ChatID                   *string
	AccessScope              string
	StorageProvider          string
	ObjectKey                string
	ThumbnailObjectKey       *string
	OriginalName             string
	MIMEType                 string
	SizeBytes                int64
	Checksum                 string
	CreatedAt                time.Time
}

type LegacyUploadStore interface {
	RecordLegacyUpload(context.Context, LegacyUpload) error
}

type LegacyUploadService struct{ store LegacyUploadStore }

func NewLegacyUploadService(store LegacyUploadStore) *LegacyUploadService {
	return &LegacyUploadService{store: store}
}

func (s *LegacyUploadService) Record(ctx context.Context, upload LegacyUpload) error {
	return s.store.RecordLegacyUpload(ctx, upload)
}

type ReserveUploadInput struct {
	Upload          DirectUpload
	FamilyID        string
	UserID          string
	ChatID          *string
	AccessScope     string
	StorageProvider string
	OriginalName    string
	Checksum        *string
	IdempotencyKey  string
	RequestHash     string
	CreatedAt       time.Time
}

type CompleteUploadInput struct {
	UploadID   string
	UserID     string
	FamilyID   string
	ObjectETag string
	Now        time.Time
}

// ReservationRequestHash is stable across retries and deliberately excludes
// infrastructure-generated IDs, timestamps, and object keys.
func ReservationRequestHash(request ReservationRequest) (string, error) {
	payload, err := json.Marshal(struct {
		OriginalName string  `json:"originalName"`
		MIMEType     string  `json:"mimeType"`
		SizeBytes    int64   `json:"sizeBytes"`
		Checksum     *string `json:"checksum,omitempty"`
		ChatID       string  `json:"chatId,omitempty"`
	}{request.OriginalName, request.MIMEType, request.SizeBytes, request.Checksum, request.ChatID})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
