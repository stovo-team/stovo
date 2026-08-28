package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"stovo-messenger/backend/internal/ports"
	"stovo-messenger/backend/internal/repository"
	"stovo-messenger/backend/internal/transcription"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	mediaPlaybackTokenHeader        = "X-Stovo-Media-Token"
	maxMediaPlaybackTokenHeaderSize = 4096
)

type mediaPlaybackTokenResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

const directUploadCapabilityTTL = 15 * time.Minute
const directDownloadCapabilityTTL = 5 * time.Minute

type reserveDirectFileUploadRequest struct {
	OriginalName string  `json:"originalName"`
	MimeType     string  `json:"mimeType"`
	SizeBytes    int64   `json:"sizeBytes"`
	Checksum     *string `json:"checksum,omitempty"`
	ChatID       *string `json:"chatId,omitempty"`
}

type directFileUploadResponse struct {
	UploadID      string     `json:"uploadId"`
	FileID        string     `json:"fileId"`
	State         string     `json:"state"`
	UploadURL     *string    `json:"uploadUrl,omitempty"`
	ExpiresAt     *time.Time `json:"expiresAt,omitempty"`
	ExpectedMIME  string     `json:"expectedMimeType"`
	ExpectedBytes int64      `json:"expectedSizeBytes"`
}

type directFileAccessResponse struct {
	FileID    string    `json:"fileId"`
	Revision  *string   `json:"revision,omitempty"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
	MimeType  string    `json:"mimeType"`
	SizeBytes int64     `json:"sizeBytes"`
	Checksum  *string   `json:"checksum,omitempty"`
}

type directUploadRecord struct {
	UploadID       string
	FileID         string
	ObjectKey      string
	ExpectedMIME   string
	ExpectedBytes  int64
	ExpectedSHA256 *string
	State          string
	ExpiresAt      time.Time
}

// handleReserveDirectFileUpload creates durable metadata before any direct
// object transfer. It intentionally does not alter the legacy multipart route.
func (s *Server) handleReserveDirectFileUpload(w http.ResponseWriter, r *http.Request, user userPublic) {
	if strings.TrimSpace(s.cfg.MinIOPublicEndpoint) == "" {
		s.detail(w, http.StatusServiceUnavailable, "Direct uploads are not configured")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" || len(key) > 200 {
		s.detail(w, http.StatusUnprocessableEntity, "Idempotency-Key is required")
		return
	}
	var payload reserveDirectFileUploadRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.OriginalName = sanitizeFilename(payload.OriginalName)
	mimeType, allowed := normalizeUploadMime(payload.MimeType, payload.OriginalName)
	if !allowed || payload.SizeBytes <= 0 || payload.SizeBytes > s.cfg.MaxUploadSizeBytes {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid file metadata")
		return
	}
	if payload.Checksum != nil {
		checksum := strings.ToLower(strings.TrimSpace(*payload.Checksum))
		if len(checksum) != 64 {
			s.detail(w, http.StatusUnprocessableEntity, "checksum must be a SHA-256 hex digest")
			return
		}
		for _, ch := range checksum {
			if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f')) {
				s.detail(w, http.StatusUnprocessableEntity, "checksum must be a SHA-256 hex digest")
				return
			}
		}
		payload.Checksum = &checksum
	}

	chatID := ""
	accessScope := "family"
	if payload.ChatID != nil {
		chatID = strings.TrimSpace(*payload.ChatID)
	}
	if chatID != "" {
		chat, err := s.buildChatPublic(chatID, user)
		if err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid chatId")
			return
		}
		chatID, accessScope = chat.ID, "chat"
	}

	requestHashBytes, _ := json.Marshal(struct {
		OriginalName string  `json:"originalName"`
		MimeType     string  `json:"mimeType"`
		SizeBytes    int64   `json:"sizeBytes"`
		Checksum     *string `json:"checksum,omitempty"`
		ChatID       string  `json:"chatId,omitempty"`
	}{payload.OriginalName, mimeType, payload.SizeBytes, payload.Checksum, chatID})
	requestHash := sha256Hex(requestHashBytes)

	record, found, err := s.loadDirectUploadByIdempotency(r.Context(), user.ID, key)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load upload")
		return
	}
	if found {
		storedHash, err := s.directUploadRequestHash(r.Context(), record.UploadID)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load upload")
			return
		}
		if storedHash != requestHash {
			s.detail(w, http.StatusConflict, "Idempotency-Key was already used with a different request")
			return
		}
		s.respondDirectUploadReservation(w, r, record)
		return
	}

	now := time.Now().UTC()
	record = directUploadRecord{
		UploadID:       uuid.NewString(),
		FileID:         uuid.NewString(),
		ObjectKey:      path.Join("quarantine", "families", user.FamilyID, "uploads", uuid.NewString(), payload.OriginalName),
		ExpectedMIME:   mimeType,
		ExpectedBytes:  payload.SizeBytes,
		ExpectedSHA256: payload.Checksum,
		State:          "reserved",
		ExpiresAt:      now.Add(directUploadCapabilityTTL),
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not reserve upload")
		return
	}
	defer tx.Rollback()
	var chatValue any
	if chatID != "" {
		chatValue = chatID
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO files
		(id, family_id, uploaded_by, chat_id, access_scope, storage_provider, object_key, lifecycle_state, object_revision, original_name, mime_type, size_bytes, checksum, created_at, preview_status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9,$10,$11,$12,$13,'none')`,
		record.FileID, user.FamilyID, user.ID, chatValue, accessScope, s.storage.Provider(), record.ObjectKey, record.FileID, payload.OriginalName, mimeType, payload.SizeBytes, payload.Checksum, now.Format(time.RFC3339Nano))
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO file_uploads
			(id, file_id, family_id, uploaded_by, chat_id, access_scope, idempotency_key, request_hash, upload_mode, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'single',$9,$10,$11,$12,'reserved',$13,$14,$14)`,
			record.UploadID, record.FileID, user.FamilyID, user.ID, chatValue, accessScope, key, requestHash, record.ObjectKey, mimeType, payload.SizeBytes, payload.Checksum, record.ExpiresAt.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	}
	if err != nil {
		_ = tx.Rollback()
		// A concurrent retry may have won the unique idempotency constraint.
		if existing, exists, loadErr := s.loadDirectUploadByIdempotency(r.Context(), user.ID, key); loadErr == nil && exists {
			storedHash, hashErr := s.directUploadRequestHash(r.Context(), existing.UploadID)
			if hashErr == nil && storedHash == requestHash {
				s.respondDirectUploadReservation(w, r, existing)
				return
			}
		}
		s.detail(w, http.StatusInternalServerError, "Could not reserve upload")
		return
	}
	if err := tx.Commit(); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not reserve upload")
		return
	}
	s.respondDirectUploadReservation(w, r, record)
}

func (s *Server) respondDirectUploadReservation(w http.ResponseWriter, r *http.Request, record directUploadRecord) {
	response := directFileUploadResponse{UploadID: record.UploadID, FileID: record.FileID, State: record.State, ExpectedMIME: record.ExpectedMIME, ExpectedBytes: record.ExpectedBytes}
	if record.State == "reserved" && time.Now().UTC().Before(record.ExpiresAt) {
		store, err := s.presignedObjectStore()
		if err != nil {
			s.detail(w, http.StatusServiceUnavailable, "Direct uploads are not available")
			return
		}
		url, err := store.PresignPutObject(r.Context(), s.cfg.MinIOFilesBucket, record.ObjectKey, time.Until(record.ExpiresAt), record.ExpectedMIME)
		if err != nil {
			s.detail(w, http.StatusServiceUnavailable, "Direct uploads are not available")
			return
		}
		response.UploadURL, response.ExpiresAt = &url, &record.ExpiresAt
	}
	s.json(w, http.StatusOK, response)
}

func (s *Server) handleCompleteDirectFileUpload(w http.ResponseWriter, r *http.Request, user userPublic) {
	uploadID := strings.TrimSpace(chi.URLParam(r, "uploadId"))
	if uploadID == "" {
		s.detail(w, http.StatusNotFound, "Upload not found")
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not complete upload")
		return
	}
	defer tx.Rollback()
	record, err := scanDirectUpload(tx.QueryRowContext(r.Context(), `SELECT id, file_id, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at FROM file_uploads WHERE id = $1 AND uploaded_by = $2 FOR UPDATE`, uploadID, user.ID))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Upload not found")
		return
	}
	if record.State == "validating" || record.State == "ready" {
		_ = tx.Commit()
		s.json(w, http.StatusAccepted, directFileUploadResponse{UploadID: record.UploadID, FileID: record.FileID, State: record.State, ExpectedMIME: record.ExpectedMIME, ExpectedBytes: record.ExpectedBytes})
		return
	}
	if record.State != "reserved" || !time.Now().UTC().Before(record.ExpiresAt) {
		s.detail(w, http.StatusConflict, "Upload is no longer completable")
		return
	}
	store, err := s.bucketObjectStore()
	if err != nil {
		s.detail(w, http.StatusConflict, "Uploaded object does not match reservation")
		return
	}
	object, err := store.StatObject(r.Context(), s.cfg.MinIOFilesBucket, record.ObjectKey)
	if err != nil || object.Size != record.ExpectedBytes {
		s.detail(w, http.StatusConflict, "Uploaded object does not match reservation")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = tx.ExecContext(r.Context(), `UPDATE file_uploads SET state = 'validating', completed_at = $2, updated_at = $2 WHERE id = $1`, record.UploadID, now)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE files SET lifecycle_state = 'validating', object_etag = $2 WHERE id = $1`, record.FileID, object.ETag)
	}
	if err == nil {
		jobPayload, marshalErr := json.Marshal(map[string]string{"uploadId": record.UploadID, "fileId": record.FileID})
		if marshalErr != nil {
			err = marshalErr
		} else {
			err = writeOutboxEventTx(r.Context(), tx, "", user.FamilyID, "file.validate", record.FileID, jobPayload)
		}
	}
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not complete upload")
		return
	}
	if err := tx.Commit(); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not complete upload")
		return
	}
	// A later validation worker promotes the file to ready after it verifies
	// bytes, checksum, MIME and safety; completion alone never grants access.
	s.json(w, http.StatusAccepted, directFileUploadResponse{UploadID: record.UploadID, FileID: record.FileID, State: "validating", ExpectedMIME: record.ExpectedMIME, ExpectedBytes: record.ExpectedBytes})
}

// handleGetDirectFileUpload lets a durable device transfer poll the
// authoritative lifecycle state after it submits completion.
func (s *Server) handleGetDirectFileUpload(w http.ResponseWriter, r *http.Request, user userPublic) {
	uploadID := strings.TrimSpace(chi.URLParam(r, "uploadId"))
	if uploadID == "" {
		s.detail(w, http.StatusNotFound, "Upload not found")
		return
	}
	record, err := scanDirectUpload(s.db.QueryRowContext(r.Context(), `
		SELECT id, file_id, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at
		FROM file_uploads WHERE id = $1 AND uploaded_by = $2`, uploadID, user.ID))
	if errors.Is(err, sql.ErrNoRows) {
		s.detail(w, http.StatusNotFound, "Upload not found")
		return
	}
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load upload")
		return
	}
	s.respondDirectUploadReservation(w, r, record)
}

func (s *Server) handleCreateDirectFileAccess(w http.ResponseWriter, r *http.Request, user userPublic) {
	if strings.TrimSpace(s.cfg.MinIOPublicEndpoint) == "" {
		s.detail(w, http.StatusServiceUnavailable, "Direct access is not configured")
		return
	}
	fileID := fileIDFromURL(r)
	file, objectKey, err := s.loadFileRecord(r.Context(), fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	var state string
	var revision *string
	err = s.db.QueryRowContext(r.Context(), `SELECT lifecycle_state, object_revision FROM files WHERE id = $1`, fileID).Scan(&state, &revision)
	if err != nil || state != "ready" {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	expiresAt := time.Now().UTC().Add(directDownloadCapabilityTTL)
	store, err := s.presignedObjectStore()
	if err != nil {
		s.detail(w, http.StatusServiceUnavailable, "Direct access is not available")
		return
	}
	url, err := store.PresignGetObject(r.Context(), s.cfg.MinIOFilesBucket, objectKey, directDownloadCapabilityTTL)
	if err != nil {
		s.detail(w, http.StatusServiceUnavailable, "Direct access is not available")
		return
	}
	s.json(w, http.StatusOK, directFileAccessResponse{FileID: fileID, Revision: revision, URL: url, ExpiresAt: expiresAt, MimeType: file.MimeType, SizeBytes: file.SizeBytes, Checksum: file.Checksum})
}

func (s *Server) loadDirectUploadByIdempotency(ctx context.Context, userID, key string) (directUploadRecord, bool, error) {
	record, err := scanDirectUpload(s.db.QueryRowContext(ctx, `SELECT id, file_id, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at FROM file_uploads WHERE uploaded_by = $1 AND idempotency_key = $2`, userID, key))
	if err == sql.ErrNoRows {
		return directUploadRecord{}, false, nil
	}
	if err != nil {
		return directUploadRecord{}, false, err
	}
	return record, true, nil
}

func (s *Server) directUploadRequestHash(ctx context.Context, uploadID string) (string, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT request_hash FROM file_uploads WHERE id = $1`, uploadID).Scan(&hash)
	return hash, err
}

func scanDirectUpload(row *sql.Row) (directUploadRecord, error) {
	var record directUploadRecord
	var expires string
	err := row.Scan(&record.UploadID, &record.FileID, &record.ObjectKey, &record.ExpectedMIME, &record.ExpectedBytes, &record.ExpectedSHA256, &record.State, &expires)
	if err != nil {
		return directUploadRecord{}, err
	}
	record.ExpiresAt, err = time.Parse(time.RFC3339Nano, expires)
	return record, err
}

func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := r.ParseMultipartForm(s.cfg.MaxUploadSizeBytes); err != nil {
		s.detail(w, http.StatusBadRequest, "Could not parse upload")
		return
	}

	fileHeader, header, err := r.FormFile("file")
	if err != nil {
		s.detail(w, http.StatusBadRequest, "file is required")
		return
	}
	data, err := readUpload(fileHeader, s.cfg.MaxUploadSizeBytes)
	if err != nil {
		s.detail(w, http.StatusBadRequest, err.Error())
		return
	}

	mimeType, allowed := normalizeUploadMime(header.Header.Get("Content-Type"), header.Filename)
	if !allowed {
		s.detail(w, http.StatusBadRequest, "Disallowed file type")
		return
	}
	chatID := strings.TrimSpace(r.FormValue("chatId"))
	accessScope := "family"
	objectKey := path.Join("family", user.FamilyID, time.Now().UTC().Format("2006"), time.Now().UTC().Format("01"), uuid.NewString()+"-"+sanitizeFilename(header.Filename))
	if chatID != "" {
		chat, err := s.buildChatPublic(chatID, user)
		if err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid chatId")
			return
		}
		accessScope = "chat"
		objectKey = path.Join("family", user.FamilyID, "chats", chat.ID, time.Now().UTC().Format("2006"), time.Now().UTC().Format("01"), uuid.NewString()+"-"+sanitizeFilename(header.Filename))
	}

	fileID := uuid.NewString()
	checksum := sha256Hex(data)
	now := nowString()
	if err := s.storage.Save(objectKey, data); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save file")
		return
	}
	var thumbnailObjectKey *string
	if strings.HasPrefix(mimeType, "video/") {
		if thumbnail, err := generateVideoThumbnail(r.Context(), data); err == nil {
			key := objectKey + ".thumbnail.jpg"
			if err := s.storage.Save(key, thumbnail); err == nil {
				thumbnailObjectKey = &key
			}
		}
	}
	var chatIDPtr *string
	if chatID != "" {
		chatIDPtr = &chatID
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not record file")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO files (id, family_id, uploaded_by, chat_id, access_scope, storage_provider, object_key,
		                   thumbnail_object_key, original_name, mime_type, size_bytes, checksum, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		fileID, user.FamilyID, user.ID, chatIDPtr, accessScope, "local", objectKey,
		thumbnailObjectKey, sanitizeFilename(header.Filename), mimeType, len(data), checksum, now); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not record file")
		return
	}
	if err := writeFileSyncEventTx(r.Context(), tx, user.FamilyID, chatIDPtr, "file.changed", fileID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not record file")
		return
	}
	if err := tx.Commit(); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not record file")
		return
	}

	file, err := s.buildFilePublic(fileID, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load file")
		return
	}
	s.json(w, http.StatusCreated, file)
}

func (s *Server) handleGetFiles(w http.ResponseWriter, r *http.Request, user userPublic) {
	fileIDs, err := s.store.ListVisibleFamilyFileIDs(r.Context(), user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load files")
		return
	}
	files := make([]filePublic, 0)
	for _, fileID := range fileIDs {
		file, err := s.buildFilePublic(fileID, user.ID)
		if err == nil && file.DeletedAt == nil && s.fileReadyForPublic(r.Context(), file.ID) && s.fileVisibleToUser(r.Context(), file, user) {
			files = append(files, file)
		}
	}
	s.json(w, http.StatusOK, files)
}

func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, err := s.buildFilePublic(fileIDFromURL(r), user.ID)
	if err != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) || file.DeletedAt != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	s.json(w, http.StatusOK, file)
}

// fileReadyForPublic is intentionally used at the legacy read boundary too:
// direct-upload reservations create file metadata before bytes are validated,
// but that metadata must never appear in Storage or a legacy detail request.
func (s *Server) fileReadyForPublic(ctx context.Context, fileID string) bool {
	var state string
	if err := s.db.QueryRowContext(ctx, `SELECT lifecycle_state FROM files WHERE id = $1`, fileID).Scan(&state); err != nil {
		return false
	}
	return state == "ready"
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, objectKey, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	data, err := s.storage.Read(objectKey)
	if err != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	w.Header().Set("Content-Type", file.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.QueryEscape(file.OriginalName)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *Server) handleGetFileThumbnail(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, _, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || file.ThumbnailObjectKey == nil || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	data, err := s.storage.Read(*file.ThumbnailObjectKey)
	if err != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *Server) handleCreateMediaPlaybackToken(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, _, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !isStreamableMediaMime(file.MimeType) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	token, expiresAt, err := s.mintMediaPlaybackToken(user.ID, user.FamilyID, file.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create playback token")
		return
	}
	s.json(w, http.StatusOK, mediaPlaybackTokenResponse{Token: token, ExpiresAt: expiresAt})
}

func (s *Server) handleStreamMediaPlaybackFile(w http.ResponseWriter, r *http.Request) {
	fileID := fileIDFromURL(r)
	rawToken := mediaPlaybackTokenFromRequest(r)
	if rawToken == "" || len(rawToken) > maxMediaPlaybackTokenHeaderSize {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	claims, err := s.parseMediaPlaybackToken(rawToken, fileID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	user, err := s.getUserByID(claims.UserID)
	if err != nil || user.FamilyID != claims.FamilyID {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	if !user.IsActive && user.Role != connectorRole {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	file, objectKey, err := s.loadFileRecord(r.Context(), fileID, user.ID)
	if err != nil || file.ID != claims.FileID || file.FamilyID != claims.FamilyID || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) ||
		!s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	// Media playback tokens are primarily for streamable media; connector download links may
	// also use them for other MIME types scoped by connector policy.
	if user.Role != connectorRole && !isStreamableMediaMime(file.MimeType) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	handle, err := s.storage.Open(objectKey)
	if err != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	defer handle.Close()
	w.Header().Set("Content-Type", file.MimeType)
	if user.Role == connectorRole && !isStreamableMediaMime(file.MimeType) {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.QueryEscape(file.OriginalName)))
	} else {
		w.Header().Set("Content-Disposition", "inline")
	}
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeContent(w, r, "", time.Time{}, handle)
}

func isStreamableMediaMime(mimeType string) bool {
	return strings.HasPrefix(mimeType, "audio/") || strings.HasPrefix(mimeType, "video/")
}

func mediaPlaybackTokenFromRequest(r *http.Request) string {
	headerValues := r.Header.Values(mediaPlaybackTokenHeader)
	if len(headerValues) == 1 {
		return strings.TrimSpace(headerValues[0])
	}
	if token := strings.TrimSpace(r.URL.Query().Get("token")); token != "" {
		return token
	}
	return ""
}

func (s *Server) handleUpdateFilePreferences(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, _, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	var payload updateFilePreferencesRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if payload.IsFavorite == nil {
		s.detail(w, http.StatusUnprocessableEntity, "isFavorite is required")
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update file preferences")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO file_preferences (id, user_id, is_favorite)
		VALUES ($1, $2, $3)
		ON CONFLICT (id, user_id) DO UPDATE SET is_favorite=EXCLUDED.is_favorite`, file.ID, user.ID, *payload.IsFavorite); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update file preferences")
		return
	}
	// A favorite is private to one account, including that account's other devices.
	if err := writeFileSyncEventForRecipientsTx(r.Context(), tx, user.FamilyID, []string{user.ID}, "file.preference.changed", file.ID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update file preferences")
		return
	}
	if err := tx.Commit(); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update file preferences")
		return
	}
	updated, _ := s.buildFilePublic(file.ID, user.ID)
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, objectKey, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	if !hasPermission(user, permissionManageFiles) && file.UploadedBy != user.ID {
		s.detail(w, http.StatusForbidden, "Only owner, admin, or uploader can delete")
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not delete file")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE files SET deleted_at=$2 WHERE id=$1`, file.ID, nowString()); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not delete file")
		return
	}
	if err := writeFileSyncEventTx(r.Context(), tx, user.FamilyID, file.ChatID, "file.deleted", file.ID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not delete file")
		return
	}
	if err := tx.Commit(); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not delete file")
		return
	}
	deleteFileObjects(s.storage, objectKey, file.ThumbnailObjectKey)
	w.WriteHeader(http.StatusNoContent)
}

func deleteFileObjects(store ports.ObjectStore, objectKey string, thumbnailObjectKey *string) {
	_ = store.Delete(objectKey)
	if thumbnailObjectKey != nil {
		_ = store.Delete(*thumbnailObjectKey)
	}
}

func (s *Server) buildFilePublic(fileID, viewerID string) (filePublic, error) {
	file, _, err := s.loadFileRecord(context.Background(), fileID, viewerID)
	return file, err
}

func (s *Server) validateImageFileForFamily(fileID string, user userPublic, missingMessage string) error {
	file, err := s.buildFilePublic(fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(context.Background(), file.ID) || file.FamilyID != user.FamilyID || !s.fileVisibleToUser(context.Background(), file, user) {
		return newStatusError(http.StatusNotFound, missingMessage)
	}
	if !strings.HasPrefix(file.MimeType, "image/") {
		return newStatusError(http.StatusUnprocessableEntity, "Photo must be an image")
	}
	if file.ChatID != nil {
		return newStatusError(http.StatusUnprocessableEntity, "Photo must be uploaded as a profile or chat photo")
	}
	return nil
}

func filePublicFromDetail(d *repository.FileDetail) (filePublic, string) {
	f := d.File
	file := filePublic{
		ID:                 f.ID,
		FamilyID:           f.FamilyID,
		UploadedBy:         f.UploadedBy,
		ChatID:             f.ChatID,
		ChatTitle:          d.ChatTitle,
		ChatType:           d.ChatType,
		OriginMessageID:    d.OriginMessageID,
		AccessScope:        f.AccessScope,
		StorageProvider:    f.StorageProvider,
		ThumbnailObjectKey: f.ThumbnailObjectKey,
		OriginalName:       f.OriginalName,
		MimeType:           f.MimeType,
		SizeBytes:          int64(f.SizeBytes),
		Checksum:           f.Checksum,
		CreatedAt:          parseTime(f.CreatedAt),
		IsFavorite:         d.IsFavorite,
	}
	if f.DeletedAt != nil {
		deleted := parseTime(*f.DeletedAt)
		file.DeletedAt = &deleted
	}
	return file, f.ObjectKey
}

func (s *Server) loadFileRecord(ctx context.Context, fileID, viewerID string) (filePublic, string, error) {
	detail, err := s.store.LoadFileDetail(ctx, fileID, viewerID)
	if err != nil {
		return filePublic{}, "", err
	}
	file, objectKey := filePublicFromDetail(detail)
	return file, objectKey, nil
}

func (s *Server) fileVisibleToUser(ctx context.Context, file filePublic, user userPublic) bool {
	if file.FamilyID != user.FamilyID {
		return false
	}
	if file.ChatID == nil {
		return true
	}
	mediaVisibility, err := s.store.ChatMediaVisibility(ctx, *file.ChatID)
	if err != nil {
		return false
	}
	if mediaVisibility == "family" {
		return true
	}
	member, err := s.store.IsChatMember(ctx, *file.ChatID, user.ID)
	if err != nil {
		return false
	}
	return member
}

type fileTranscriptResponse struct {
	FileID   string   `json:"fileId"`
	Text     string   `json:"text"`
	Language *string  `json:"language,omitempty"`
	Duration *float64 `json:"duration,omitempty"`
}

func (s *Server) handleTranscribeFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	apiKey := s.getGroqAPIKey()
	if apiKey == "" {
		s.detail(w, http.StatusServiceUnavailable, "Transcription service is not configured (GROQ_API_KEY missing)")
		return
	}

	fileID := fileIDFromURL(r)
	file, objectKey, err := s.loadFileRecord(r.Context(), fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}

	if !strings.HasPrefix(file.MimeType, "audio/") {
		s.detail(w, http.StatusBadRequest, "File is not an audio file")
		return
	}

	transcriptKey := objectKey + ".transcript.json"
	if cachedData, err := s.storage.Read(transcriptKey); err == nil {
		var cachedResp fileTranscriptResponse
		if json.Unmarshal(cachedData, &cachedResp) == nil && cachedResp.Text != "" {
			s.json(w, http.StatusOK, cachedResp)
			return
		}
	}

	audioData, err := s.storage.Read(objectKey)
	if err != nil {
		s.logger.Warnf("transcription", "failed to read audio data for transcribe file_id=%s object_key=%s provider=%s error=%v", fileID, objectKey, s.storage.Provider(), err)
		s.detail(w, http.StatusNotFound, "Could not read audio file")
		return
	}

	groqClient := transcription.NewGroqSTTClient(transcription.GroqSTTConfig{
		APIKey:           apiKey,
		BaseURL:          s.getGroqBaseURL(),
		Model:            s.getGroqSTTModel(),
		CostPerAudioHour: s.cfg.GroqSTTCostPerHourUSD,
	})

	filename := file.OriginalName
	if filename == "" {
		filename = "audio.webm"
	}
	contentType := file.MimeType
	if contentType == "" {
		contentType = "audio/webm"
	}

	groqResp, err := groqClient.TranscribeBatched(r.Context(), transcription.TranscribeRequest{
		AudioData:   audioData,
		Filename:    filename,
		ContentType: contentType,
	}, 60)
	if err != nil {
		s.logger.Warnf("transcription", "file transcribe failed file_id=%s error=%v", fileID, err)
		s.detail(w, http.StatusInternalServerError, "Failed to transcribe audio: "+err.Error())
		return
	}

	var lang *string
	if groqResp.Language != "" {
		lang = &groqResp.Language
	}
	var duration *float64
	if groqResp.Duration > 0 {
		dur := groqResp.Duration
		duration = &dur
	}

	resp := fileTranscriptResponse{
		FileID:   fileID,
		Text:     strings.TrimSpace(groqResp.Text),
		Language: lang,
		Duration: duration,
	}

	if data, err := json.Marshal(resp); err == nil {
		_ = s.storage.Save(transcriptKey, data)
	}

	s.json(w, http.StatusOK, resp)
}

func (s *Server) handleGetFileTranscript(w http.ResponseWriter, r *http.Request, user userPublic) {
	fileID := fileIDFromURL(r)
	file, objectKey, err := s.loadFileRecord(r.Context(), fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(r.Context(), file.ID) || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}

	transcriptKey := objectKey + ".transcript.json"
	cachedData, err := s.storage.Read(transcriptKey)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Transcript not found")
		return
	}

	var cachedResp fileTranscriptResponse
	if err := json.Unmarshal(cachedData, &cachedResp); err != nil {
		s.detail(w, http.StatusNotFound, "Transcript not found")
		return
	}

	s.json(w, http.StatusOK, cachedResp)
}
