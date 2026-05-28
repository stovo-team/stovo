package app

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
)

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

	mimeType := header.Header.Get("Content-Type")
	if !allowedMime(mimeType) {
		s.detail(w, http.StatusBadRequest, "Disallowed file type")
		return
	}
	data = s.optimizeUploadMedia(data, mimeType, header.Filename, user.FamilyID)

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
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			INSERT INTO files (id, family_id, uploaded_by, chat_id, access_scope, storage_provider, object_key, original_name, mime_type, size_bytes, checksum, created_at)
			VALUES (?, ?, ?, ?, ?, 'local', ?, ?, ?, ?, ?, ?)
		`, fileID, user.FamilyID, user.ID, nullIfEmpty(chatID), accessScope, objectKey, sanitizeFilename(header.Filename), mimeType, len(data), checksum, now)
		return err
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

func (s *Server) handleGetFiles(w http.ResponseWriter, _ *http.Request, user userPublic) {
	rows, err := s.query(`
		SELECT id
		FROM files
		WHERE family_id = ? AND deleted_at IS NULL
		  AND (
			chat_id IS NULL
			OR EXISTS (
				SELECT 1
				FROM message_attachments ma
				WHERE ma.file_id = files.id
			)
		  )
		ORDER BY created_at DESC
	`, user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load files")
		return
	}
	defer rows.Close()
	files := make([]filePublic, 0)
	for rows.Next() {
		var fileID string
		if err := rows.Scan(&fileID); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load files")
			return
		}
		file, err := s.buildFilePublic(fileID, user.ID)
		if err == nil && file.DeletedAt == nil && s.fileVisibleToUser(file, user) {
			files = append(files, file)
		}
	}
	s.json(w, http.StatusOK, files)
}

func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, err := s.buildFilePublic(fileIDFromURL(r), user.ID)
	if err != nil || !s.fileVisibleToUser(file, user) || file.DeletedAt != nil {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	s.json(w, http.StatusOK, file)
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, objectKey, err := s.loadFileRecord(fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(file, user) {
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

func (s *Server) handleUpdateFilePreferences(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, _, err := s.loadFileRecord(fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(file, user) {
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
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			INSERT INTO file_preferences (file_id, user_id, is_favorite)
			VALUES (?, ?, ?)
			ON CONFLICT (file_id, user_id) DO UPDATE SET is_favorite = EXCLUDED.is_favorite
		`, file.ID, user.ID, *payload.IsFavorite)
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update file preferences")
		return
	}
	updated, _ := s.buildFilePublic(file.ID, user.ID)
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request, user userPublic) {
	file, objectKey, err := s.loadFileRecord(fileIDFromURL(r), user.ID)
	if err != nil || file.DeletedAt != nil || !s.fileVisibleToUser(file, user) {
		s.detail(w, http.StatusNotFound, "File not found")
		return
	}
	if !isAdmin(user.Role) && file.UploadedBy != user.ID {
		s.detail(w, http.StatusForbidden, "Only owner, admin, or uploader can delete")
		return
	}
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `UPDATE files SET deleted_at = ? WHERE id = ?`, nowString(), file.ID)
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not delete file")
		return
	}
	_ = s.storage.Delete(objectKey)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) buildFilePublic(fileID, viewerID string) (filePublic, error) {
	file, _, err := s.loadFileRecord(fileID, viewerID)
	return file, err
}

func (s *Server) validateImageFileForFamily(fileID string, user userPublic, missingMessage string) error {
	file, err := s.buildFilePublic(fileID, user.ID)
	if err != nil || file.DeletedAt != nil || file.FamilyID != user.FamilyID || !s.fileVisibleToUser(file, user) {
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

func (s *Server) loadFileRecord(fileID, viewerID string) (filePublic, string, error) {
	row := s.queryRow(`
		SELECT f.id, f.family_id, f.uploaded_by, f.chat_id, c.title, c.type, f.access_scope, f.storage_provider,
		       f.object_key, f.original_name, f.mime_type, f.size_bytes, f.checksum, f.created_at, f.deleted_at,
		       fp.is_favorite
		FROM files f
		LEFT JOIN chats c ON c.id = f.chat_id
		LEFT JOIN file_preferences fp ON fp.file_id = f.id AND fp.user_id = ?
		WHERE f.id = ?
	`, viewerID, fileID)
	var file filePublic
	var chatID, chatTitle, chatType, checksum, deletedAt sql.NullString
	var favorite sql.NullBool
	var objectKey string
	var createdAt string
	if err := row.Scan(
		&file.ID,
		&file.FamilyID,
		&file.UploadedBy,
		&chatID,
		&chatTitle,
		&chatType,
		&file.AccessScope,
		&file.StorageProvider,
		&objectKey,
		&file.OriginalName,
		&file.MimeType,
		&file.SizeBytes,
		&checksum,
		&createdAt,
		&deletedAt,
		&favorite,
	); err != nil {
		return filePublic{}, "", err
	}
	file.ChatID = stringPtrFromNull(chatID)
	file.ChatTitle = stringPtrFromNull(chatTitle)
	file.ChatType = stringPtrFromNull(chatType)
	file.Checksum = stringPtrFromNull(checksum)
	file.CreatedAt = parseTime(createdAt)
	if deletedAt.Valid {
		deleted := parseTime(deletedAt.String)
		file.DeletedAt = &deleted
	}
	file.IsFavorite = boolFromNull(favorite)
	return file, objectKey, nil
}

func (s *Server) fileVisibleToUser(file filePublic, user userPublic) bool {
	if file.FamilyID != user.FamilyID {
		return false
	}
	if file.ChatID == nil {
		return true
	}
	row := s.queryRow(`SELECT media_visibility FROM chats WHERE id = ?`, *file.ChatID)
	var mediaVisibility string
	if err := row.Scan(&mediaVisibility); err != nil {
		return false
	}
	if mediaVisibility == "family" {
		return true
	}
	memberRow := s.queryRow(`
		SELECT COUNT(*)
		FROM chat_members
		WHERE chat_id = ? AND user_id = ?
	`, *file.ChatID, user.ID)
	var count int
	if err := memberRow.Scan(&count); err != nil {
		return false
	}
	return count > 0
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
