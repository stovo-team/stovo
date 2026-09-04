package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"path"
	"strings"
	"time"

	"stovo-messenger/backend/internal/adapters/groq"
	featurefiles "stovo-messenger/backend/internal/features/files"
	"stovo-messenger/backend/internal/ports"
	"stovo-messenger/backend/internal/transcription"
	transporthttp "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

const (
	mediaPlaybackTokenHeader        = transporthttp.MediaPlaybackTokenHeader
	maxMediaPlaybackTokenHeaderSize = 4096
	directUploadCapabilityTTL       = 15 * time.Minute
	directDownloadCapabilityTTL     = 5 * time.Minute
)

type mediaPlaybackTokenResponse = transporthttp.MediaPlaybackTokenResponse
type reserveDirectFileUploadRequest = transporthttp.ReserveDirectFileUploadRequest
type directFileUploadResponse = transporthttp.DirectFileUploadResponse
type directFileAccessResponse = transporthttp.DirectFileAccessResponse
type directUploadRecord = featurefiles.DirectUpload

// createDirectFileAccess is the HTTP-free capability issuance operation used
// by the HTTP transport. Storage presigning remains an outer adapter concern.
func (s *Server) createDirectFileAccess(ctx context.Context, user userPublic, fileID string) (any, error) {
	if strings.TrimSpace(s.cfg.MinIOPublicEndpoint) == "" {
		return nil, newStatusError(http.StatusServiceUnavailable, "Direct access is not configured")
	}
	file, objectKey, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return nil, newStatusError(http.StatusNotFound, "File not found")
	}
	lifecycle, err := s.fileLifecycle.Get(ctx, fileID)
	if err != nil || lifecycle.State != "ready" {
		return nil, newStatusError(http.StatusNotFound, "File not found")
	}
	expiresAt := time.Now().UTC().Add(directDownloadCapabilityTTL)
	store, err := s.presignedObjectStore()
	if err != nil {
		return nil, newStatusError(http.StatusServiceUnavailable, "Direct access is not available")
	}
	url, err := store.PresignGetObject(ctx, s.cfg.MinIOFilesBucket, objectKey, directDownloadCapabilityTTL)
	if err != nil {
		return nil, newStatusError(http.StatusServiceUnavailable, "Direct access is not available")
	}
	return directFileAccessResponse{FileID: fileID, Revision: lifecycle.ObjectRevision, URL: url, ExpiresAt: expiresAt, MimeType: file.MimeType, SizeBytes: file.SizeBytes, Checksum: file.Checksum}, nil
}

func (s *Server) downloadFile(ctx context.Context, user userPublic, fileID string) (transporthttp.FileDelivery, error) {
	file, objectKey, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return transporthttp.FileDelivery{}, newStatusError(http.StatusNotFound, "File not found")
	}
	data, err := s.storage.Read(objectKey)
	if err != nil {
		return transporthttp.FileDelivery{}, newStatusError(http.StatusNotFound, "File not found")
	}
	return transporthttp.FileDelivery{Data: data, ContentType: file.MimeType, OriginalName: file.OriginalName}, nil
}

func (s *Server) downloadThumbnail(ctx context.Context, user userPublic, fileID string) (transporthttp.FileDelivery, error) {
	file, _, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || file.ThumbnailObjectKey == nil || !s.fileVisibleToUser(ctx, file, user) {
		return transporthttp.FileDelivery{}, newStatusError(http.StatusNotFound, "File not found")
	}
	data, err := s.storage.Read(*file.ThumbnailObjectKey)
	if err != nil {
		return transporthttp.FileDelivery{}, newStatusError(http.StatusNotFound, "File not found")
	}
	return transporthttp.FileDelivery{Data: data, ContentType: "image/jpeg"}, nil
}

func (s *Server) mintMediaPlayback(ctx context.Context, user userPublic, fileID string) (transporthttp.MediaPlaybackToken, error) {
	file, _, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !isStreamableMediaMime(file.MimeType) || !s.fileVisibleToUser(ctx, file, user) {
		return transporthttp.MediaPlaybackToken{}, newStatusError(http.StatusNotFound, "File not found")
	}
	token, expiresAt, err := s.mintMediaPlaybackToken(user.ID, user.FamilyID, file.ID)
	if err != nil {
		return transporthttp.MediaPlaybackToken{}, newStatusError(http.StatusInternalServerError, "Could not create playback token")
	}
	return transporthttp.MediaPlaybackToken{Token: token, ExpiresAt: expiresAt}, nil
}

func (s *Server) openMediaPlayback(ctx context.Context, fileID, token string) (transporthttp.MediaStream, error) {
	claims, err := s.parseMediaPlaybackToken(token, fileID)
	if err != nil {
		return transporthttp.MediaStream{}, newStatusError(http.StatusNotFound, "File not found")
	}
	user, err := s.getUserByID(claims.UserID)
	if err != nil || user.FamilyID != claims.FamilyID || (!user.IsActive && user.Role != connectorRole) {
		return transporthttp.MediaStream{}, newStatusError(http.StatusNotFound, "File not found")
	}
	file, objectKey, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.ID != claims.FileID || file.FamilyID != claims.FamilyID || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return transporthttp.MediaStream{}, newStatusError(http.StatusNotFound, "File not found")
	}
	if user.Role != connectorRole && !isStreamableMediaMime(file.MimeType) {
		return transporthttp.MediaStream{}, newStatusError(http.StatusNotFound, "File not found")
	}
	reader, err := s.storage.Open(objectKey)
	if err != nil {
		return transporthttp.MediaStream{}, newStatusError(http.StatusNotFound, "File not found")
	}
	return transporthttp.MediaStream{Reader: reader, ContentType: file.MimeType, OriginalName: file.OriginalName, Attachment: user.Role == connectorRole && !isStreamableMediaMime(file.MimeType)}, nil
}

func (s *Server) reserveDirectFileUpload(ctx context.Context, user userPublic, key string, payload transporthttp.ReserveDirectFileUploadRequest) (transporthttp.DirectFileUploadResponse, int, string, error) {
	if strings.TrimSpace(s.cfg.MinIOPublicEndpoint) == "" {
		return transporthttp.DirectFileUploadResponse{}, http.StatusServiceUnavailable, "Direct uploads are not configured", nil
	}
	payload.OriginalName = featurefiles.SanitizeFilename(payload.OriginalName)
	mimeType, allowed := featurefiles.NormalizeUploadMIME(payload.MimeType, payload.OriginalName)
	if !allowed || payload.SizeBytes <= 0 || payload.SizeBytes > s.cfg.MaxUploadSizeBytes {
		return transporthttp.DirectFileUploadResponse{}, http.StatusUnprocessableEntity, "Invalid file metadata", nil
	}
	checksum, err := featurefiles.NormalizeChecksum(payload.Checksum)
	if errors.Is(err, featurefiles.ErrInvalidChecksum) {
		return transporthttp.DirectFileUploadResponse{}, http.StatusUnprocessableEntity, "checksum must be a SHA-256 hex digest", nil
	}
	payload.Checksum = checksum

	chatID := ""
	accessScope := "family"
	if payload.ChatID != nil {
		chatID = strings.TrimSpace(*payload.ChatID)
	}
	if chatID != "" {
		chat, err := s.buildChatPublic(chatID, user)
		if err != nil {
			return transporthttp.DirectFileUploadResponse{}, http.StatusBadRequest, "Invalid chatId", nil
		}
		chatID, accessScope = chat.ID, "chat"
	}

	requestHash, err := featurefiles.ReservationRequestHash(featurefiles.ReservationRequest{OriginalName: payload.OriginalName, MIMEType: mimeType, SizeBytes: payload.SizeBytes, Checksum: payload.Checksum, ChatID: chatID})
	if err != nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusInternalServerError, "Could not reserve upload", nil
	}

	record, found, err := s.directUploads.FindByIdempotency(ctx, user.ID, key)
	if err != nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusInternalServerError, "Could not load upload", nil
	}
	if found {
		storedHash, err := s.directUploads.RequestHash(ctx, record.UploadID)
		if err != nil {
			return transporthttp.DirectFileUploadResponse{}, http.StatusInternalServerError, "Could not load upload", nil
		}
		if storedHash != requestHash {
			return transporthttp.DirectFileUploadResponse{}, http.StatusConflict, "Idempotency-Key was already used with a different request", nil
		}
		resp, err := s.directUploadReservationResponse(ctx, record)
		if err != nil {
			return transporthttp.DirectFileUploadResponse{}, http.StatusServiceUnavailable, "Direct uploads are not available", nil
		}
		return resp, http.StatusOK, "", nil
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
	var chatValue *string
	if chatID != "" {
		chatValue = &chatID
	}
	err = s.directUploads.Reserve(ctx, featurefiles.ReserveUploadInput{Upload: record, FamilyID: user.FamilyID, UserID: user.ID, ChatID: chatValue, AccessScope: accessScope, StorageProvider: s.storage.Provider(), OriginalName: payload.OriginalName, Checksum: payload.Checksum, IdempotencyKey: key, RequestHash: requestHash, CreatedAt: now})
	if err != nil {
		if existing, exists, loadErr := s.directUploads.FindByIdempotency(ctx, user.ID, key); loadErr == nil && exists {
			storedHash, hashErr := s.directUploads.RequestHash(ctx, existing.UploadID)
			if hashErr == nil && storedHash == requestHash {
				resp, resErr := s.directUploadReservationResponse(ctx, existing)
				if resErr != nil {
					return transporthttp.DirectFileUploadResponse{}, http.StatusServiceUnavailable, "Direct uploads are not available", nil
				}
				return resp, http.StatusOK, "", nil
			}
		}
		return transporthttp.DirectFileUploadResponse{}, http.StatusInternalServerError, "Could not reserve upload", nil
	}
	resp, err := s.directUploadReservationResponse(ctx, record)
	if err != nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusServiceUnavailable, "Direct uploads are not available", nil
	}
	return resp, http.StatusOK, "", nil
}

// directUploadReservationResponse keeps object-store presigning in the
// application adapter while HTTP status polling is owned by the transport.
func (s *Server) directUploadReservationResponse(ctx context.Context, record directUploadRecord) (directFileUploadResponse, error) {
	response := transporthttp.PresentDirectFileUpload(record.UploadID, record.FileID, record.State, record.ExpectedMIME, record.ExpectedBytes)
	if record.State == "reserved" && time.Now().UTC().Before(record.ExpiresAt) {
		store, err := s.presignedObjectStore()
		if err != nil {
			return response, err
		}
		url, err := store.PresignPutObject(ctx, s.cfg.MinIOFilesBucket, record.ObjectKey, time.Until(record.ExpiresAt), record.ExpectedMIME)
		if err != nil {
			return response, err
		}
		response.UploadURL, response.ExpiresAt = &url, &record.ExpiresAt
	}
	return response, nil
}

func (s *Server) completeDirectFileUpload(ctx context.Context, user userPublic, uploadID string) (transporthttp.DirectFileUploadResponse, int, string, error) {
	record, found, err := s.directUploads.FindByID(ctx, uploadID, user.ID)
	if !found && err == nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusNotFound, "Upload not found", nil
	}
	if err != nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusInternalServerError, "Could not complete upload", nil
	}
	nextState, completable := featurefiles.UploadCompletionState(record.State, record.ExpiresAt, time.Now().UTC())
	if record.State == "validating" || record.State == "ready" {
		return transporthttp.PresentDirectFileUpload(record.UploadID, record.FileID, record.State, record.ExpectedMIME, record.ExpectedBytes), http.StatusAccepted, "", nil
	}
	if !completable || nextState != "validating" {
		return transporthttp.DirectFileUploadResponse{}, http.StatusConflict, "Upload is no longer completable", nil
	}
	store, err := s.bucketObjectStore()
	if err != nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusConflict, "Uploaded object does not match reservation", nil
	}
	object, err := store.StatObject(ctx, s.cfg.MinIOFilesBucket, record.ObjectKey)
	if err != nil || object.Size != record.ExpectedBytes {
		return transporthttp.DirectFileUploadResponse{}, http.StatusConflict, "Uploaded object does not match reservation", nil
	}
	record, accepted, err := s.directUploads.Complete(ctx, featurefiles.CompleteUploadInput{UploadID: uploadID, UserID: user.ID, FamilyID: user.FamilyID, ObjectETag: object.ETag, Now: time.Now().UTC()})
	if err != nil {
		return transporthttp.DirectFileUploadResponse{}, http.StatusInternalServerError, "Could not complete upload", nil
	}
	if !accepted {
		return transporthttp.DirectFileUploadResponse{}, http.StatusConflict, "Upload is no longer completable", nil
	}
	return transporthttp.PresentDirectFileUpload(record.UploadID, record.FileID, record.State, record.ExpectedMIME, record.ExpectedBytes), http.StatusAccepted, "", nil
}

func (s *Server) uploadFile(ctx context.Context, user userPublic, input transporthttp.MultipartUploadInput) (any, int, string, error) {
	mimeType, allowed := featurefiles.NormalizeUploadMIME(input.ContentType, input.Filename)
	if !allowed {
		return nil, http.StatusBadRequest, "Disallowed file type", nil
	}
	chatID := strings.TrimSpace(input.ChatID)
	accessScope := "family"
	objectKey := path.Join("family", user.FamilyID, time.Now().UTC().Format("2006"), time.Now().UTC().Format("01"), uuid.NewString()+"-"+featurefiles.SanitizeFilename(input.Filename))
	if chatID != "" {
		chat, err := s.buildChatPublic(chatID, user)
		if err != nil {
			return nil, http.StatusBadRequest, "Invalid chatId", nil
		}
		accessScope = "chat"
		objectKey = path.Join("family", user.FamilyID, "chats", chat.ID, time.Now().UTC().Format("2006"), time.Now().UTC().Format("01"), uuid.NewString()+"-"+featurefiles.SanitizeFilename(input.Filename))
	}

	fileID := uuid.NewString()
	checksum := sha256Hex(input.Data)
	now := time.Now().UTC()
	if err := s.storage.Save(objectKey, input.Data); err != nil {
		return nil, http.StatusInternalServerError, "Could not save file", nil
	}
	var thumbnailObjectKey *string
	if strings.HasPrefix(mimeType, "video/") {
		if thumbnail, err := generateVideoThumbnail(ctx, input.Data); err == nil {
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
	if err := s.legacyUploads.Record(ctx, featurefiles.LegacyUpload{
		FileID: fileID, FamilyID: user.FamilyID, UserID: user.ID, ChatID: chatIDPtr,
		AccessScope: accessScope, StorageProvider: "local", ObjectKey: objectKey,
		ThumbnailObjectKey: thumbnailObjectKey, OriginalName: featurefiles.SanitizeFilename(input.Filename),
		MIMEType: mimeType, SizeBytes: int64(len(input.Data)), Checksum: checksum, CreatedAt: now,
	}); err != nil {
		return nil, http.StatusInternalServerError, "Could not record file", nil
	}

	file, err := s.buildFilePublic(fileID, user.ID)
	if err != nil {
		return nil, http.StatusInternalServerError, "Could not load file", nil
	}
	return file, http.StatusCreated, "", nil
}

func fileListItemFromPublic(file filePublic) transporthttp.FileListItem {
	return transporthttp.FileListItem{
		ID: file.ID, FamilyID: file.FamilyID, UploadedBy: file.UploadedBy, ChatID: file.ChatID,
		ChatTitle: file.ChatTitle, ChatType: file.ChatType, OriginMessageID: file.OriginMessageID,
		AccessScope: file.AccessScope, StorageProvider: file.StorageProvider,
		ThumbnailObjectKey: file.ThumbnailObjectKey, OriginalName: file.OriginalName,
		MimeType: file.MimeType, SizeBytes: file.SizeBytes, Checksum: file.Checksum,
		CreatedAt: file.CreatedAt, DeletedAt: file.DeletedAt, IsFavorite: file.IsFavorite,
	}
}

func (s *Server) getFile(ctx context.Context, user userPublic, fileID string) (any, error) {
	file, err := s.buildFilePublic(fileID, user.ID)
	if err != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) || file.DeletedAt != nil {
		return nil, newStatusError(http.StatusNotFound, "File not found")
	}
	return file, nil
}

// fileReadyForPublic is intentionally used at the legacy read boundary too:
// direct-upload reservations create file metadata before bytes are validated,
// but that metadata must never appear in Storage or a legacy detail request.
func (s *Server) fileReadyForPublic(ctx context.Context, fileID string) bool {
	return s.fileLifecycle.Ready(ctx, fileID)
}

func isStreamableMediaMime(mimeType string) bool {
	return strings.HasPrefix(mimeType, "audio/") || strings.HasPrefix(mimeType, "video/")
}

func (s *Server) setFileFavorite(ctx context.Context, fileID string, isFavorite bool, user userPublic) (any, error) {
	file, _, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return nil, newStatusError(http.StatusNotFound, "File not found")
	}
	if err := s.filePreferences.SetFavorite(ctx, featurefiles.FavoriteChange{FileID: file.ID, UserID: user.ID, FamilyID: user.FamilyID, IsFavorite: isFavorite}); err != nil {
		return nil, newStatusError(http.StatusInternalServerError, "Could not update file preferences")
	}
	updated, _ := s.buildFilePublic(file.ID, user.ID)
	return updated, nil
}

func (s *Server) deleteFile(ctx context.Context, fileID string, user userPublic) error {
	file, objectKey, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return newStatusError(http.StatusNotFound, "File not found")
	}
	if !hasPermission(user, permissionManageFiles) && file.UploadedBy != user.ID {
		return newStatusError(http.StatusForbidden, "Only owner, admin, or uploader can delete")
	}
	if err := s.fileDeletions.Delete(ctx, featurefiles.Deletion{FileID: file.ID, FamilyID: user.FamilyID, ChatID: file.ChatID}); err != nil {
		return newStatusError(http.StatusInternalServerError, "Could not delete file")
	}
	s.removeDeletedFileFromCollections(ctx, file.ID)
	deleteFileObjects(s.storage, objectKey, file.ThumbnailObjectKey)
	return nil
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

func filePublicFromAccess(record featurefiles.AccessRecord) (filePublic, string) {
	file := filePublic{
		ID:                 record.ID,
		FamilyID:           record.FamilyID,
		UploadedBy:         record.UploadedBy,
		ChatID:             record.ChatID,
		ChatTitle:          record.ChatTitle,
		ChatType:           record.ChatType,
		OriginMessageID:    record.OriginMessageID,
		AccessScope:        record.AccessScope,
		StorageProvider:    record.StorageProvider,
		ThumbnailObjectKey: record.ThumbnailObjectKey,
		OriginalName:       record.OriginalName,
		MimeType:           record.MimeType,
		SizeBytes:          record.SizeBytes,
		Checksum:           record.Checksum,
		CreatedAt:          parseTime(record.CreatedAt),
		IsFavorite:         record.IsFavorite,
	}
	if record.DeletedAt != nil {
		deleted := parseTime(*record.DeletedAt)
		file.DeletedAt = &deleted
	}
	return file, record.ObjectKey
}

func (s *Server) loadFileRecord(ctx context.Context, fileID, viewerID string) (filePublic, string, error) {
	record, err := s.fileAccess.Load(ctx, fileID, viewerID)
	if err != nil {
		return filePublic{}, "", err
	}
	file, objectKey := filePublicFromAccess(record)
	return file, objectKey, nil
}

func (s *Server) fileVisibleToUser(ctx context.Context, file filePublic, user userPublic) bool {
	if file.FamilyID != user.FamilyID {
		return false
	}
	if file.AccessScope == "private" {
		return file.UploadedBy == user.ID || hasPermission(user, permissionManageFiles) || s.collectionFileVisible(ctx, file.ID, user)
	}
	if s.fileAccess.VisibleTo(ctx, featurefiles.AccessRecord{
		FamilyID: file.FamilyID,
		ChatID:   file.ChatID,
	}, user.FamilyID, user.ID) {
		return true
	}
	return s.collectionFileVisible(ctx, file.ID, user)
}

type fileTranscriptResponse = transporthttp.FileTranscriptResponse

func (s *Server) transcribeFile(ctx context.Context, user userPublic, fileID string) (any, int, string) {
	provider := groq.Resolve(&s.cfg, s.logger)
	if provider.APIKey == "" {
		return nil, http.StatusServiceUnavailable, "Transcription service is not configured (GROQ_API_KEY missing)"
	}

	file, objectKey, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return nil, http.StatusNotFound, "File not found"
	}

	if !strings.HasPrefix(file.MimeType, "audio/") {
		return nil, http.StatusBadRequest, "File is not an audio file"
	}

	transcriptKey := objectKey + ".transcript.json"
	if cachedData, err := s.storage.Read(transcriptKey); err == nil {
		var cachedResp fileTranscriptResponse
		if json.Unmarshal(cachedData, &cachedResp) == nil && cachedResp.Text != "" {
			return cachedResp, http.StatusOK, ""
		}
	}

	audioData, err := s.storage.Read(objectKey)
	if err != nil {
		s.logger.Warnf("transcription", "failed to read audio data for transcribe file_id=%s object_key=%s provider=%s error=%v", fileID, objectKey, s.storage.Provider(), err)
		return nil, http.StatusNotFound, "Could not read audio file"
	}

	groqClient := transcription.NewGroqSTTClient(transcription.GroqSTTConfig{
		APIKey:           provider.APIKey,
		BaseURL:          provider.BaseURL,
		Model:            provider.STTModel,
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

	groqResp, err := groqClient.TranscribeBatched(ctx, transcription.TranscribeRequest{
		AudioData:   audioData,
		Filename:    filename,
		ContentType: contentType,
	}, 60)
	if err != nil {
		s.logger.Warnf("transcription", "file transcribe failed file_id=%s error=%v", fileID, err)
		return nil, http.StatusInternalServerError, "Failed to transcribe audio: " + err.Error()
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

	return resp, http.StatusOK, ""
}

func (s *Server) getFileTranscript(ctx context.Context, user userPublic, fileID string) (any, int, string) {
	file, objectKey, err := s.loadFileRecord(ctx, fileID, user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileReadyForPublic(ctx, file.ID) || !s.fileVisibleToUser(ctx, file, user) {
		return nil, http.StatusNotFound, "File not found"
	}

	transcriptKey := objectKey + ".transcript.json"
	cachedData, err := s.storage.Read(transcriptKey)
	if err != nil {
		return nil, http.StatusNotFound, "Transcript not found"
	}

	var cachedResp fileTranscriptResponse
	if err := json.Unmarshal(cachedData, &cachedResp); err != nil {
		return nil, http.StatusNotFound, "Transcript not found"
	}

	return cachedResp, http.StatusOK, ""
}
