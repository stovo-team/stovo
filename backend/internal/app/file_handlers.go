package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/repository"
	"family-messenger/backend/internal/storage"
	"family-messenger/backend/internal/transcription"

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
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		return s.store.CreateFile(r.Context(), tx, repository.CreateFileParams{
			ID:                 fileID,
			FamilyID:           user.FamilyID,
			UploadedBy:         user.ID,
			ChatID:             chatIDPtr,
			AccessScope:        accessScope,
			StorageProvider:    "local",
			ObjectKey:          objectKey,
			ThumbnailObjectKey: thumbnailObjectKey,
			OriginalName:       sanitizeFilename(header.Filename),
			MimeType:           mimeType,
			SizeBytes:          len(data),
			Checksum:           &checksum,
			CreatedAt:          now,
		})
	}); err != nil {
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
		if err == nil && file.DeletedAt == nil && s.fileVisibleToUser(r.Context(), file, user) {
			files = append(files, file)
		}
	}
	s.json(w, http.StatusOK, files)
}

func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, err := s.buildFilePublic(fileIDFromURL(r), user.ID)
	if err != nil || !s.fileVisibleToUser(r.Context(), file, user) || file.DeletedAt != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	s.json(w, http.StatusOK, file)
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, objectKey, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(r.Context(), file, user) {
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
	if err != nil || file.DeletedAt != nil || file.ThumbnailObjectKey == nil || !s.fileVisibleToUser(r.Context(), file, user) {
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
	if err != nil || file.DeletedAt != nil || !isStreamableMediaMime(file.MimeType) || !s.fileVisibleToUser(r.Context(), file, user) {
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
	if err != nil || file.ID != claims.FileID || file.FamilyID != claims.FamilyID || file.DeletedAt != nil ||
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
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(r.Context(), file, user) {
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
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		return s.store.UpsertFileFavorite(r.Context(), tx, file.ID, user.ID, *payload.IsFavorite)
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update file preferences")
		return
	}
	updated, _ := s.buildFilePublic(file.ID, user.ID)
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, objectKey, err := s.loadFileRecord(r.Context(), fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(r.Context(), file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	if !isAdmin(user.Role) && file.UploadedBy != user.ID {
		s.detail(w, http.StatusForbidden, "Only owner, admin, or uploader can delete")
		return
	}
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		return s.store.SoftDeleteFile(r.Context(), tx, file.ID, nowString())
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not delete file")
		return
	}
	deleteFileObjects(s.storage, objectKey, file.ThumbnailObjectKey)
	w.WriteHeader(http.StatusNoContent)
}

func deleteFileObjects(store storage.ObjectStore, objectKey string, thumbnailObjectKey *string) {
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
	if err != nil || file.DeletedAt != nil || file.FamilyID != user.FamilyID || !s.fileVisibleToUser(context.Background(), file, user) {
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
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(r.Context(), file, user) {
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
		Model:            s.cfg.GroqSTTModel,
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

	groqResp, err := groqClient.Transcribe(r.Context(), transcription.TranscribeRequest{
		AudioData:   audioData,
		Filename:    filename,
		ContentType: contentType,
	})
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
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(r.Context(), file, user) {
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

